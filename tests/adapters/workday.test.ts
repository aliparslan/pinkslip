import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  normalizeWorkdaySource,
  parseWorkdaySource,
  WorkdayAdapter,
} from "@worker/adapters/workday";
import { isEligibleJobListing } from "@worker/job-scope";

const SOURCE_URL =
  "https://example.wd5.myworkdayjobs.com/en-US/ExternalCareerSite";
const API_URL =
  "https://example.wd5.myworkdayjobs.com/wday/cxs/example/ExternalCareerSite/jobs";

function response(json: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => json };
}

const US_COUNTRY_FACET = [{
  facetParameter: "locationMainGroup",
  values: [{
    facetParameter: "locationCountry",
    descriptor: "Country",
    values: [{
      descriptor: "United States of America",
      id: "country-us",
      count: 100,
    }],
  }],
}];

describe("WorkdayAdapter", () => {
  let adapter: WorkdayAdapter;

  beforeEach(() => {
    adapter = new WorkdayAdapter();
    mock.restore();
  });

  it("parses and normalizes a public Workday board URL", () => {
    expect(parseWorkdaySource(`${SOURCE_URL}/job/Austin/Test_R123`).site)
      .toBe("ExternalCareerSite");
    expect(normalizeWorkdaySource(`${SOURCE_URL}/job/Austin/Test_R123?country=US`))
      .toBe(`${SOURCE_URL}?country=US`);
    expect(normalizeWorkdaySource(SOURCE_URL)).toBe(`${SOURCE_URL}?country=US`);
    expect(normalizeWorkdaySource(`${SOURCE_URL}?country=CA`)).toBe(`${SOURCE_URL}?country=US`);
  });

  it("fetches and maps a single page of jobs", async () => {
    const fetchMock = mock()
      .mockResolvedValueOnce(response({
        total: 100,
        jobPostings: [],
        facets: US_COUNTRY_FACET,
      }))
      .mockResolvedValueOnce(response({
        total: 2,
        jobPostings: [
          {
            title: "Software Engineer",
            externalPath: "/job/Austin/Software-Engineer_R123",
            locationsText: "Austin, TX",
            postedOn: "Posted Today",
            bulletFields: ["R123"],
          },
          {
            title: "Product Designer",
            externalPath: "/job/Remote/Product-Designer_R456",
            locationsText: "2 Locations",
            postedOn: "Posted 4 Days Ago",
            bulletFields: ["R456"],
          },
        ],
        facets: [],
      }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const jobs = await adapter.fetchJobs(SOURCE_URL);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(API_URL, expect.objectContaining({
      method: "POST",
    }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      appliedFacets: { locationCountry: ["country-us"] },
      limit: 20,
      offset: 0,
      searchText: "",
    });
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual(expect.objectContaining({
      externalId: "R123",
      title: "Software Engineer",
      location: "Austin, TX",
      url: "https://example.wd5.myworkdayjobs.com/ExternalCareerSite/job/Austin/Software-Engineer_R123",
      description: null,
    }));
    expect(jobs[1].location).toBe("2 US locations");
  });

  it("never relabels an explicit foreign location as United States", async () => {
    globalThis.fetch = mock()
      .mockResolvedValueOnce(response({ total: 1, jobPostings: [], facets: US_COUNTRY_FACET }))
      .mockResolvedValueOnce(response({
        total: 1,
        jobPostings: [{
          title: "Mechanical Product Engineer",
          externalPath: "/job/Vietnam/Mechanical-Product-Engineer_R789",
          locationsText: "Vietnam, Remote",
          bulletFields: ["R789"],
        }],
        facets: [],
      })) as unknown as typeof fetch;

    const jobs = await adapter.fetchJobs(SOURCE_URL);
    expect(jobs[0].location).toBe("Vietnam, Remote");
  });

  it("marks the \"Posted 30+ Days Ago\" bucket as stale", async () => {
    // Workday buckets anything older than a month as "Posted 30+ Days Ago".
    // The optional "+" used to fall through to null, leaving 53% of open
    // Workday jobs undated while every other source had none missing.
    const fetchMock = mock()
      .mockResolvedValueOnce(response({ total: 1, jobPostings: [], facets: US_COUNTRY_FACET }))
      .mockResolvedValueOnce(response({
        total: 2,
        jobPostings: [
          {
            title: "Old Engineer",
            externalPath: "/job/Austin/Old-Engineer_R900",
            locationsText: "Austin, TX",
            postedOn: "Posted 30+ Days Ago",
            bulletFields: ["R900"],
          },
          {
            title: "Unparseable Engineer",
            externalPath: "/job/Austin/Unparseable_R901",
            locationsText: "Austin, TX",
            postedOn: "Sometime last quarter",
            bulletFields: ["R901"],
          },
        ],
        facets: [],
      }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const jobs = await adapter.fetchJobs(SOURCE_URL);

    // Lower bound, not an exact date: at least 30 days old.
    expect(jobs[0].postedAt).not.toBeNull();
    const ageDays =
      (Date.now() - new Date(jobs[0].postedAt as string).getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThanOrEqual(29.5);
    expect(ageDays).toBeLessThan(31.5);
    expect(isEligibleJobListing(jobs[0])).toBe(false);

    // A genuinely unrecognised label must still yield null rather than a guess.
    expect(jobs[1].postedAt).toBeNull();
  });

  it("paginates in 20-job pages", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      title: `Job ${index}`,
      externalPath: `/job/Test/Job-${index}_R${index}`,
      locationsText: "Remote",
      bulletFields: [`R${index}`],
    }));
    const fetchMock = mock()
      .mockResolvedValueOnce(response({
        total: 100,
        jobPostings: [],
        facets: US_COUNTRY_FACET,
      }))
      .mockResolvedValueOnce(response({
        total: 21,
        jobPostings: firstPage,
        facets: [],
      }))
      .mockResolvedValueOnce(response({
        total: 0,
        jobPostings: [{
          title: "Job 20",
          externalPath: "/job/Test/Job-20_R20",
          locationsText: "Remote",
          bulletFields: ["R20"],
        }],
        facets: [],
      }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const jobs = await adapter.fetchJobs(SOURCE_URL);

    expect(jobs).toHaveLength(21);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).offset).toBe(20);
  });

  it("applies an explicit country facet before pagination", async () => {
    const fetchMock = mock()
      .mockResolvedValueOnce(response({
        total: 2000,
        jobPostings: [],
        facets: [{
          facetParameter: "locationMainGroup",
          values: [{
            facetParameter: "locationCountry",
            descriptor: "Country",
            values: [{
              descriptor: "United States of America",
              id: "country-us",
              count: 1,
            }],
          }],
        }],
      }))
      .mockResolvedValueOnce(response({
        total: 1,
        jobPostings: [{
          title: "US Engineer",
          externalPath: "/job/Remote/US-Engineer_R1",
          locationsText: "US, Remote",
          bulletFields: ["R1"],
        }],
        facets: [],
      }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const jobs = await adapter.fetchJobs(SOURCE_URL);

    expect(jobs).toHaveLength(1);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).appliedFacets)
      .toEqual({ locationCountry: ["country-us"] });
  });

  it("falls back to US location values when a country facet is unavailable", async () => {
    const fetchMock = mock()
      .mockResolvedValueOnce(response({
        total: 200,
        jobPostings: [],
        facets: [{
          facetParameter: "locations",
          descriptor: "Locations",
          values: [
            { descriptor: "Los Gatos", id: "los-gatos" },
            { descriptor: "London", id: "london" },
            { descriptor: "Remote", id: "global-remote" },
            { descriptor: "USA - Remote", id: "us-remote" },
          ],
        }],
      }))
      .mockResolvedValueOnce(response({
        total: 0,
        jobPostings: [],
        facets: [],
      }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await adapter.fetchJobs(SOURCE_URL);

    expect(JSON.parse(fetchMock.mock.calls[1][1].body).appliedFacets)
      .toEqual({ locations: ["los-gatos", "us-remote"] });
  });

  it("rejects a US-filtered board at Workday's result cap", async () => {
    globalThis.fetch = mock()
      .mockResolvedValueOnce(response({
        total: 3000,
        jobPostings: [],
        facets: US_COUNTRY_FACET,
      }))
      .mockResolvedValueOnce(response({
        total: 2000,
        jobPostings: [],
        facets: [],
      })) as unknown as typeof fetch;

    await expect(adapter.fetchJobs(SOURCE_URL)).rejects.toThrow(
      "United States result cap"
    );
  });

  it("fetches detail content and structured metadata", async () => {
    const detailUrl =
      "https://example.wd5.myworkdayjobs.com/wday/cxs/example/ExternalCareerSite/job/Austin/Software-Engineer_R123";
    const fetchMock = mock().mockResolvedValue(response({
      jobPostingInfo: {
        jobDescription: "<p>Expected pay is $120,000 - $160,000 annually.</p>",
        location: "Austin, TX",
        additionalLocations: ["US, Remote"],
        startDate: "2026-06-08",
      },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const content = await adapter.fetchJobContent(
      SOURCE_URL,
      "R123",
      `${SOURCE_URL}/job/Austin/Software-Engineer_R123`
    );

    expect(fetchMock).toHaveBeenCalledWith(
      detailUrl,
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(content).toEqual({
      description: "<p>Expected pay is $120,000 - $160,000 annually.</p>",
      salary: "$120,000 - $160,000",
      location: "Austin, TX / US, Remote",
      postedAt: "2026-06-08T00:00:00.000Z",
    });
  });

  it("rejects non-Workday URLs", () => {
    expect(() => parseWorkdaySource("https://example.com/jobs"))
      .toThrow("myworkdayjobs.com");
  });
});
