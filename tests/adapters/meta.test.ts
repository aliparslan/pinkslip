import { afterEach, beforeEach, describe, expect, it, mock, setSystemTime } from "bun:test";
import {
  MetaAdapter,
  extractMetaJobPosting,
  mapMetaJobPosting,
  metaRetryDelayMs,
  normalizeMetaSource,
  parseMetaJobSitemap,
} from "@worker/adapters/meta";

const originalFetch = globalThis.fetch;
const ORIGIN = "https://www.metacareers.com";

function sitemap(...ids: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${
    ids.map((id) => `<url><loc>${ORIGIN}/profile/job_details/${id}/</loc><lastmod>2026-08-28T18:12:26-07:00</lastmod></url>`).join("")
  }</urlset>`;
}

function jobPosting(_id: string, overrides: Record<string, unknown> = {}) {
  return {
    "@context": "http://schema.org/",
    "@type": "JobPosting",
    title: "Software Engineer",
    description: "Build reliable products used around the world.",
    responsibilities: "Write code&nbsp;Review code",
    qualifications: "Bachelor's degree or equivalent practical experience",
    hiringOrganization: {
      "@type": "Organization",
      name: "Meta",
      sameAs: "https://www.meta.com/",
    },
    datePosted: "2026-08-27T17:30:05-07:00",
    validThrough: "2026-09-27T18:14:06-07:00",
    jobLocation: [{
      "@type": "Place",
      name: "Menlo Park, CA",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Menlo Park",
        addressRegion: "CA",
        addressCountry: "US",
      },
    }],
    employmentType: "Full-time",
    ...overrides,
  };
}

function jobPage(id: string, overrides: Record<string, unknown> = {}) {
  const posting = jobPosting(id, overrides);
  return `<!doctype html><html><head><link rel="canonical" href="${ORIGIN}/profile/job_details/${id}/"><script nonce="test" type="application/ld+json">${
    JSON.stringify(posting)
  }</script></head><body></body></html>`;
}

function xmlResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    ...init,
    headers: { "content-type": "application/xml; charset=utf-8", ...init.headers },
  });
}

function htmlResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    ...init,
    headers: { "content-type": "text/html; charset=utf-8", ...init.headers },
  });
}

function installFetch(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>
) {
  const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new URL(String(input)), init))
  );
  globalThis.fetch = Object.assign(fetchMock, {
    preconnect: originalFetch.preconnect,
  });
  return fetchMock;
}

afterEach(() => {
  setSystemTime();
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("MetaAdapter", () => {
  beforeEach(() => setSystemTime(new Date("2026-08-29T12:00:00Z")));
  it("normalizes only the canonical source and official HTTPS hosts", () => {
    expect(normalizeMetaSource("meta")).toBe("meta");
    expect(normalizeMetaSource(" META ")).toBe("meta");
    expect(normalizeMetaSource("https://www.metacareers.com/jobsearch/"))
      .toBe("meta");
    expect(normalizeMetaSource(
      "https://www.metacareers.com/profile/job_details/998357492128826/"
    )).toBe("meta");

    expect(() => normalizeMetaSource(""))
      .toThrow("Meta Careers source is required");
    expect(() => normalizeMetaSource("metacareers"))
      .toThrow('must be "meta" or a metacareers.com URL');
    expect(() => normalizeMetaSource("http://www.metacareers.com/jobsearch/"))
      .toThrow("must use HTTPS metacareers.com");
    expect(() => normalizeMetaSource("https://metacareers.com.example.com/"))
      .toThrow("must use HTTPS metacareers.com");
    expect(() => normalizeMetaSource("https://user@www.metacareers.com/"))
      .toThrow("must use HTTPS metacareers.com");
  });

  it("parses a strict, duplicate-free public job sitemap", () => {
    expect(parseMetaJobSitemap(sitemap("101", "202"))).toEqual([
      {
        externalId: "101",
        url: `${ORIGIN}/profile/job_details/101/`,
      },
      {
        externalId: "202",
        url: `${ORIGIN}/profile/job_details/202/`,
      },
    ]);

    expect(() => parseMetaJobSitemap(sitemap("101", "101")))
      .toThrow("repeated public ID 101");
    expect(() => parseMetaJobSitemap("<urlset></urlset>"))
      .toThrow("empty job sitemap");
    expect(() => parseMetaJobSitemap(
      "<urlset><url><loc>https://evil.example/jobs/101</loc></url></urlset>"
    )).toThrow("outside its public job path");
  });

  it("discovers the complete ID manifest without requesting job details", async () => {
    const fetchMock = installFetch((url, init) => {
      expect(url.pathname).toBe("/jobsearch/sitemap.xml");
      expect(new Headers(init?.headers).get("user-agent"))
        .toBe("Mozilla/5.0 (compatible; PinkslipJobs/1.0; +https://pinkslip.work/support)");
      return xmlResponse(sitemap("101", "202"));
    });
    const adapter = new MetaAdapter();

    expect(adapter.name).toBe("meta");
    expect(await adapter.fetchDiscoveryJobReferences("meta")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts Meta's XML sitemap when its edge labels it as text/html", async () => {
    installFetch(() => htmlResponse(sitemap("101")));
    expect(await new MetaAdapter().fetchDiscoveryJobReferences("meta"))
      .toEqual([{
        externalId: "101",
        url: `${ORIGIN}/profile/job_details/101/`,
      }]);

    installFetch(() => htmlResponse("<!doctype html><title>Challenge</title>"));
    await expect(new MetaAdapter().fetchDiscoveryJobReferences("meta"))
      .rejects.toThrow("invalid job sitemap");
  });

  it("maps original dates, US locations, remote eligibility, and full requirements", async () => {
    installFetch((url) => htmlResponse(jobPage("101", {
      qualifications: "Bachelor's degree. Salary range is $120,000 - $180,000 per year.",
      jobLocation: [
        {
          "@type": "Place",
          name: "London, UK",
          address: { "@type": "PostalAddress", addressCountry: "GB" },
        },
        {
          "@type": "Place",
          name: "Menlo Park, CA",
          address: { "@type": "PostalAddress", addressCountry: "US" },
        },
      ],
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: [{
        "@type": "Country",
        name: "United States of America",
      }],
    })));

    const listing = await new MetaAdapter().fetchJobListing(
      "meta",
      "101",
      `${ORIGIN}/profile/job_details/101/`
    );
    expect(listing).toMatchObject({
      externalId: "101",
      title: "Software Engineer",
      url: `${ORIGIN}/profile/job_details/101/`,
      location: "Remote, US / Menlo Park, CA",
      postedAt: "2026-08-28T00:30:05.000Z",
    });
    expect(listing.description).toContain("<h2>Responsibilities</h2>");
    expect(listing.description).toContain("<h2>Qualifications</h2>");
    expect(listing.salary).toContain("$120,000");
  });

  it("retains description evidence so PhD and clearance rules can reject a role", () => {
    const posting = jobPosting("101", {
      qualifications: "PhD in Computer Science required. Active security clearance required.",
    });
    const listing = mapMetaJobPosting(posting, {
      externalId: "101",
      url: `${ORIGIN}/profile/job_details/101/`,
    });
    expect(listing.description).toContain("PhD in Computer Science required");
    expect(listing.description).toContain("security clearance required");
  });

  it("drops large descriptions early for non-US rows while preserving their location", () => {
    const posting = jobPosting("101", {
      jobLocation: [{
        "@type": "Place",
        name: "Singapore",
        address: { "@type": "PostalAddress", addressCountry: "SG" },
      }],
    });
    expect(mapMetaJobPosting(posting, {
      externalId: "101",
      url: `${ORIGIN}/profile/job_details/101/`,
    })).toMatchObject({
      location: "Singapore",
      description: null,
      salary: null,
    });
  });

  it("validates canonical identity and structured-data cardinality", () => {
    expect(() => extractMetaJobPosting(jobPage("202"), "101"))
      .toThrow("did not match public ID 101");
    expect(() => extractMetaJobPosting(
      `<html><head><link rel="canonical" href="${ORIGIN}/profile/job_details/101/"></head></html>`,
      "101"
    )).toThrow("returned 0 JobPosting records");
  });

  it("safely represents an out-of-scope page that omits JobPosting data", async () => {
    installFetch(() => htmlResponse(
      `<html><head><meta name="title" content="Senior Strategy &amp; Ops Manager"><link rel="canonical" href="${ORIGIN}/profile/job_details/101/"></head></html>`
    ));
    expect(await new MetaAdapter().fetchJobListing("meta", "101")).toEqual({
      externalId: "101",
      title: "Senior Strategy & Ops Manager",
      url: `${ORIGIN}/profile/job_details/101/`,
      location: "Unspecified",
      department: null,
      postedAt: null,
      description: null,
      salary: null,
    });
  });

  it("also skips a no-JSON role whose title explicitly requires a PhD", async () => {
    installFetch(() => htmlResponse(
      `<html><head><meta name="title" content="Research Scientist, AI &amp; Systems Co-Design (PhD)"><link rel="canonical" href="${ORIGIN}/profile/job_details/101/"></head></html>`
    ));
    expect(await new MetaAdapter().fetchJobListing("meta", "101"))
      .toMatchObject({
        title: "Research Scientist, AI & Systems Co-Design (PhD)",
        description: null,
      });
  });

  it("still fails closed when an eligible-looking page loses JobPosting data", async () => {
    installFetch(() => htmlResponse(
      `<html><head><meta name="title" content="Software Engineer"><link rel="canonical" href="${ORIGIN}/profile/job_details/101/"></head></html>`
    ));
    await expect(new MetaAdapter().fetchJobListing("meta", "101"))
      .rejects.toThrow("returned 0 JobPosting records");
  });

  it("uses the public summary to reject a hidden staff-level requisition", async () => {
    installFetch(() => htmlResponse(
      `<html><head><meta name="title" content="Software Engineer, Core Machine Learning"><meta name="description" content="Meta is seeking a Staff Software Engineer to join the Core Machine Learning team."><link rel="canonical" href="${ORIGIN}/profile/job_details/101/"></head></html>`
    ));
    expect(await new MetaAdapter().fetchJobListing("meta", "101"))
      .toMatchObject({
        title: "Software Engineer, Core Machine Learning",
        description: null,
      });
  });

  it("keeps a conservative union when the live sitemap changes during a full pass", async () => {
    let sitemapCalls = 0;
    const requestedJobs: string[] = [];
    installFetch((url) => {
      if (url.pathname === "/jobsearch/sitemap.xml") {
        sitemapCalls += 1;
        return xmlResponse(sitemapCalls === 1
          ? sitemap("101", "202")
          : sitemap("202", "303"));
      }
      const id = /\/profile\/job_details\/(\d+)\//.exec(url.pathname)?.[1];
      if (!id) return htmlResponse("missing", { status: 404 });
      requestedJobs.push(id);
      return htmlResponse(jobPage(id));
    });

    const jobs = await new MetaAdapter().fetchJobs("meta");
    expect(jobs.map((job) => job.externalId).sort()).toEqual(["101", "202", "303"]);
    expect(requestedJobs.sort()).toEqual(["101", "202", "303"]);
    expect(sitemapCalls).toBe(2);
  });

  it("returns empty content for a removed role and rejects unsafe identity input", async () => {
    const fetchMock = installFetch(() => htmlResponse("gone", { status: 404 }));
    const adapter = new MetaAdapter();
    expect(await adapter.fetchJobContent("meta", "101")).toEqual({
      description: null,
      salary: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(adapter.fetchJobContent("meta", "101/../../bad"))
      .rejects.toThrow("unsafe public ID");
    await expect(adapter.fetchJobListing(
      "meta",
      "101",
      `${ORIGIN}/profile/job_details/202/`
    )).rejects.toThrow("did not match public ID 101");
  });

  it("rejects unexpected response types and advertised oversized pages", async () => {
    installFetch(() => new Response("{}", {
      headers: { "content-type": "application/json" },
    }));
    await expect(new MetaAdapter().fetchDiscoveryJobReferences("meta"))
      .rejects.toThrow("returned application/json for job sitemap");

    installFetch(() => htmlResponse(jobPage("101"), {
      headers: { "content-length": String(1024 * 1024 + 1) },
    }));
    await expect(new MetaAdapter().fetchJobListing("meta", "101"))
      .rejects.toThrow("exceeded 1048576 bytes");
  });

  it("retries one throttled public request while honoring Retry-After", async () => {
    let calls = 0;
    installFetch(() => {
      calls += 1;
      if (calls === 1) {
        return new Response("slow down", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return xmlResponse(sitemap("101"));
    });

    expect(await new MetaAdapter().fetchDiscoveryJobReferences("meta"))
      .toHaveLength(1);
    expect(calls).toBe(2);
    expect(metaRetryDelayMs("2", 1)).toBe(2_000);
    expect(metaRetryDelayMs("60", 1)).toBe(5_000);
  });
});
