import type { ATSAdapter, JobContent, JobListing } from "./types";
import { extractSalaryFromHtml } from "./salary";
import { fetchWithTimeout } from "../http";

/**
 * Oracle Recruiting Cloud's public candidate API. A source is the tenant's
 * host and career site, "jpmc.fa.oraclecloud.com/CX_1001". Boards can run to
 * thousands of postings worldwide, so each poll asks for the United States
 * only, and descriptions are fetched per job, when a title is worth reading.
 */

const USER_AGENT = "Mozilla/5.0 (compatible; Pinkslip/1.0; +https://pinkslip.work)";
const PAGE_SIZE = 200;
const PAGE_CONCURRENCY = 4;
const ORACLE_RESULT_CAP = 8000;
const HOST = /^[a-z0-9-]+\.fa(\.[a-z0-9]+)?\.oraclecloud\.com$/;
const SITE = /^[A-Za-z0-9_-]+$/;

interface OracleLocation {
  Name?: string | null;
}

interface OracleRequisition {
  Id?: string | number | null;
  Title?: string | null;
  PostedDate?: string | null;
  PrimaryLocation?: string | null;
  WorkplaceType?: string | null;
  WorkplaceTypeCode?: string | null;
  JobFamily?: string | null;
  secondaryLocations?: OracleLocation[] | null;
}

interface OracleFacet {
  Id?: string | number | null;
  Name?: string | null;
}

interface OracleSearch {
  TotalJobsCount?: number | null;
  requisitionList?: OracleRequisition[] | null;
  locationsFacet?: OracleFacet[] | null;
}

interface OracleDetail {
  ExternalDescriptionStr?: string | null;
  ExternalResponsibilitiesStr?: string | null;
  ExternalQualificationsStr?: string | null;
}

export function normalizeOracleSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Oracle source is required");

  const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  if (!HOST.test(url.hostname)) {
    throw new Error("Oracle source must use a *.fa.*.oraclecloud.com host");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const sitesAt = parts.indexOf("sites");
  const site = sitesAt >= 0 ? parts[sitesAt + 1] : parts[0];
  if (!site || !SITE.test(site)) throw new Error("Oracle source is missing its career site");
  return `${url.hostname}/${site}`;
}

function parts(slug: string) {
  const [host, site] = slug.split("/") as [string, string];
  return { host, site };
}

async function api<T>(host: string, path: string): Promise<T[]> {
  const response = await fetchWithTimeout(`https://${host}/hcmRestApi/resources/latest/${path}`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  }, 30_000);
  if (!response.ok) throw new Error(`Oracle API ${response.status}`);
  const data = await response.json() as { items?: unknown };
  if (!Array.isArray(data.items)) throw new Error(`Oracle API returned an unexpected payload for ${host}`);
  return data.items as T[];
}

async function search(host: string, site: string, offset: number, usFacet?: string): Promise<OracleSearch> {
  // Commas and semicolons are the finder's own syntax, so this is built by hand.
  const facet = usFacet ? `,lastSelectedFacet=LOCATIONS,selectedLocationsFacet=${usFacet}` : "";
  const finder = `findReqs;siteNumber=${site},facetsList=LOCATIONS,limit=${PAGE_SIZE},sortBy=POSTING_DATES_DESC,offset=${offset}${facet}`;
  const [result] = await api<OracleSearch>(host, `recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=${finder}`);
  if (!result || !Array.isArray(result.requisitionList)) {
    throw new Error(`Oracle API returned no search result for ${host}`);
  }
  return result;
}

function jobUrl(host: string, site: string, id: string) {
  return `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${id}`;
}

function jobLocation(job: OracleRequisition) {
  const places = [job.PrimaryLocation, ...(job.secondaryLocations ?? []).map((place) => place.Name)]
    .map((place) => place?.trim())
    .filter((place): place is string => Boolean(place));
  const joined = [...new Set(places)].join("; ") || "Unknown";
  return /remote/i.test(`${job.WorkplaceType ?? ""} ${job.WorkplaceTypeCode ?? ""}`) ? `Remote - ${joined}` : joined;
}

function mapJob(host: string, site: string, job: OracleRequisition): JobListing | null {
  const id = job.Id === null || job.Id === undefined ? "" : String(job.Id);
  const title = job.Title?.trim();
  if (!id || !title) return null;
  const posted = job.PostedDate && !Number.isNaN(Date.parse(job.PostedDate))
    ? new Date(job.PostedDate).toISOString()
    : null;
  return {
    externalId: id,
    title,
    url: jobUrl(host, site, id),
    location: jobLocation(job),
    department: job.JobFamily?.trim() || null,
    postedAt: posted,
    description: null,
    salary: null,
  };
}

export class OracleAdapter implements ATSAdapter {
  readonly name = "oracle";

  async fetchJobs(value: string): Promise<JobListing[]> {
    const { host, site } = parts(normalizeOracleSource(value));
    const everywhere = await search(host, site, 0);
    const us = (everywhere.locationsFacet ?? []).find((facet) => facet.Name?.trim() === "United States");
    if (us?.Id === null || us?.Id === undefined) return [];

    const usFacet = String(us.Id);
    const first = await search(host, site, 0, usFacet);
    const total = first.TotalJobsCount ?? first.requisitionList?.length ?? 0;
    if (total > ORACLE_RESULT_CAP) {
      throw new Error(`Oracle board exceeds the ${ORACLE_RESULT_CAP}-job result cap (${total})`);
    }

    const offsets: number[] = [];
    for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) offsets.push(offset);
    const pages = [first];
    for (let index = 0; index < offsets.length; index += PAGE_CONCURRENCY) {
      pages.push(...await Promise.all(
        offsets.slice(index, index + PAGE_CONCURRENCY).map((offset) => search(host, site, offset, usFacet))
      ));
    }

    const jobs = new Map<string, JobListing>();
    for (const page of pages) {
      for (const requisition of page.requisitionList ?? []) {
        const job = mapJob(host, site, requisition);
        if (job) jobs.set(job.externalId, job);
      }
    }
    // A short read would look like hundreds of postings closing at once.
    if (jobs.size < Math.floor(total * 0.9)) {
      throw new Error(`Oracle returned ${jobs.size} of ${total} jobs for ${host}`);
    }
    return [...jobs.values()];
  }

  async fetchJobContent(value: string, externalId: string): Promise<JobContent> {
    const { host, site } = parts(normalizeOracleSource(value));
    const [detail] = await api<OracleDetail>(
      host,
      `recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22${encodeURIComponent(externalId)}%22,siteNumber=${site}`
    );
    const description = [detail?.ExternalDescriptionStr, detail?.ExternalResponsibilitiesStr, detail?.ExternalQualificationsStr]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join("\n") || null;
    return { description, salary: extractSalaryFromHtml(description) };
  }
}
