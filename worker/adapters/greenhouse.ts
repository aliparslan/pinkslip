import type { ATSAdapter, JobListing, JobContent } from "./types";
import { extractSalaryFromHtml, formatGreenhouseSalary, greenhousePayRanges } from "./salary";
import { fetchWithTimeout } from "../http";
import { REAL_POSTED_DATES_FROM } from "../../shared/job-policy";

interface GreenhouseJob {
  id: number;
  title: string;
  location: { name: string };
  departments: { name: string }[];
  absolute_url: string;
  /** The last edit, which moves whenever anyone touches the posting. */
  updated_at: string;
  first_published?: string | null;
  content: string;
  pay_input_ranges?: { min_cents: number; max_cents: number; currency_type: string; title: string }[];
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

// Greenhouse returns `content` as entity-encoded HTML (e.g. "&lt;p&gt;…"), so it
// must be decoded once or it renders as literal "<p>" text. The worker has no DOM,
// so decode the common entities by hand. `&amp;` is decoded last so a literal
// ampersand encoded as "&amp;amp;" survives as "&amp;".
function decodeGreenhouseContent(content: string | null): string | null {
  if (!content || !/&(?:lt|gt|quot|apos|nbsp|#\d|#x[0-9a-f]);/i.test(content)) {
    return content;
  }
  return content
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#0*160;/g, " ")
    .replace(/&#(\d{1,7});/g, (_, code) => {
      const point = Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, code) => {
      const point = parseInt(code, 16);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(/&amp;/g, "&");
}

export class GreenhouseAdapter implements ATSAdapter {
  readonly name = "greenhouse";

  /** Whether postings carry `first_published` rather than the last edit:
   * 72% of postings that looked under 30 days old by their last edit were
   * first published earlier (docs/age-filter-eval-2026-11-09.md). */
  constructor(private readonly firstPublished = REAL_POSTED_DATES_FROM !== null) {}

  async fetchJobs(slug: string): Promise<JobListing[]> {
    try {
      // Pay ranges come only when asked for (pay by place, 2026-10-19).
      const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true&pay_transparency=true`;
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`Greenhouse API ${response.status}`);
      }

      const data: GreenhouseResponse = await response.json();

      return data.jobs.map((job) => {
        const salary = formatGreenhouseSalary(job.pay_input_ranges?.[0]) ?? extractSalaryFromHtml(job.content);
        return {
          externalId: String(job.id),
          title: job.title,
          url: job.absolute_url,
          location: job.location.name,
          department: job.departments[0]?.name ?? null,
          postedAt: this.firstPublished ? job.first_published ?? null : job.updated_at,
          description: decodeGreenhouseContent(job.content) || null,
          salary,
          payRanges: greenhousePayRanges(job.pay_input_ranges),
        };
      });
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  async fetchJobContent(slug: string, externalId: string): Promise<JobContent> {
    // One job's page lists its pay ranges only when asked for them.
    const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${externalId}?pay_transparency=true`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { description: null, salary: null };
    const job: GreenhouseJob = await res.json();
    return {
      description: decodeGreenhouseContent(job.content) || null,
      salary: formatGreenhouseSalary(job.pay_input_ranges?.[0]) ?? extractSalaryFromHtml(job.content),
      payRanges: greenhousePayRanges(job.pay_input_ranges),
    };
  }
}
