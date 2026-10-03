import { afterEach, beforeEach, describe, expect, it, mock, setSystemTime } from "bun:test";
import {
  AmazonAdapter,
  normalizeAmazonSource,
} from "@worker/adapters/amazon";
import { diffJobs } from "@worker/poller";

function response(json: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => json };
}

function installFetch(value: unknown) {
  globalThis.fetch = value as typeof fetch;
}

const AMAZON_TECH_CATEGORIES = [
  "Software Development",
  "Applied Science",
  "Machine Learning Science",
  "Data Science",
  "Research Science",
  "Business Intelligence",
  "Database Administration",
  "Systems, Quality, & Security Engineering",
  "Solutions Architect",
] as const;

const SOFTWARE_DEVELOPMENT = AMAZON_TECH_CATEGORIES[0];

function installCategoryFetch(
  handler: (request: {
    category: string;
    offset: number;
    url: URL;
  }) => unknown | Promise<unknown>
) {
  const fetchMock = mock(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const categories = url.searchParams.getAll("category[]");
    if (categories.length !== 1) {
      throw new Error(`Expected one Amazon category, received ${categories.length}`);
    }
    return handler({
      category: categories[0],
      offset: Number(url.searchParams.get("offset") ?? "0"),
      url,
    });
  });
  installFetch(fetchMock);
  return fetchMock;
}

function installSoftwareSnapshot(payload: unknown, ok = true, status = 200) {
  return installCategoryFetch(({ category }) => response(
    category === SOFTWARE_DEVELOPMENT
      ? payload
      : { hits: 0, jobs: [] },
    ok,
    status
  ));
}

function posting(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `opaque-${id}`,
    id_icims: String(id),
    title: `Software Development Engineer ${id}`,
    job_path: `/en/jobs/${id}/software-development-engineer-${id}`,
    country_code: "USA",
    normalized_location: "Seattle, Washington, USA",
    locations: [JSON.stringify({
      countryIso3a: "USA",
      location: "US, WA, Seattle",
      normalizedLocation: "Seattle, Washington, USA",
    })],
    job_category: "Software Development",
    posted_date: "August 27, 2026",
    description: "<p>Build reliable services.</p>",
    basic_qualifications: "<p>Bachelor's or master's degree.</p>",
    preferred_qualifications:
      "<p>Compensation: 129,300.00 - 223,600.00 USD annually.</p>",
    ...overrides,
  };
}

describe("AmazonAdapter", () => {
  let adapter: AmazonAdapter;

  beforeEach(() => {
    adapter = new AmazonAdapter();
    mock.restore();
    setSystemTime(new Date("2026-08-29T12:00:00Z"));
  });
  afterEach(() => setSystemTime());

  it("normalizes only the canonical source and official HTTPS URLs", () => {
    expect(normalizeAmazonSource("amazon")).toBe("amazon");
    expect(normalizeAmazonSource(" AMAZON ")).toBe("amazon");
    expect(normalizeAmazonSource("https://www.amazon.jobs/en/search?country=USA"))
      .toBe("amazon");
    expect(() => normalizeAmazonSource("https://amazon.com/jobs"))
      .toThrow("HTTPS amazon.jobs");
    expect(() => normalizeAmazonSource("http://www.amazon.jobs/en/search"))
      .toThrow("HTTPS amazon.jobs");
  });

  it("uses the exact US category filters and maps inline job content", async () => {
    const fetchMock = installSoftwareSnapshot({
      hits: 1,
      jobs: [posting(123, {
        locations: [
          JSON.stringify({
            countryIso3a: "USA",
            location: "US, WA, Seattle",
            normalizedLocation: "Seattle, Washington, USA",
          }),
          JSON.stringify({
            countryIso3a: "USA",
            location: "US, VA, Arlington",
            normalizedLocation: "Arlington, Virginia, USA",
          }),
          JSON.stringify({
            countryIso3a: "CAN",
            normalizedLocation: "Toronto, Ontario, CAN",
          }),
        ],
      })],
    });

    const jobs = await adapter.fetchJobs("amazon");

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(expect.objectContaining({
      externalId: "123",
      title: "Software Development Engineer 123",
      url: "https://www.amazon.jobs/en/jobs/123/software-development-engineer-123",
      location: "US, WA, Seattle / US, VA, Arlington",
      department: "Software Development",
      postedAt: "2026-08-27T00:00:00.000Z",
      salary: "129,300.00 - 223,600.00 USD annually",
    }));
    expect(jobs[0].description).toContain("Build reliable services");
    expect(jobs[0].description).toContain("Basic qualifications");
    expect(jobs[0].description).toContain("Bachelor's or master's degree");
    expect(jobs[0].description).toContain("Preferred qualifications");

    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.searchParams.getAll("normalized_country_code[]")).toEqual(["USA"]);
    expect(requested.searchParams.has("country")).toBe(false);
    expect(requested.searchParams.has("country[]")).toBe(false);
    expect(requested.searchParams.getAll("category[]"))
      .toEqual([SOFTWARE_DEVELOPMENT]);
    expect(requested.searchParams.has("category")).toBe(false);
    expect(requested.searchParams.get("result_limit")).toBe("100");

    const categoryRequests = fetchMock.mock.calls.map((call) =>
      new URL(String(call[0])).searchParams.get("category[]")
    );
    expect(categoryRequests).toEqual([...AMAZON_TECH_CATEGORIES]);
    const systemsRequest = String(fetchMock.mock.calls[7][0]);
    expect(systemsRequest).toContain("%26");
  });

  it("paginates until the advertised result count is complete", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => posting(index + 1));
    const fetchMock = installCategoryFetch(({ category, offset }) => {
      if (category === "Applied Science") {
        return response({
          hits: 1,
          jobs: [posting(201, {
            title: "Applied Scientist 201",
            job_category: "Applied Science",
          })],
        });
      }
      if (category === SOFTWARE_DEVELOPMENT) {
        return offset === 0
          ? response({ hits: 101, jobs: firstPage })
          : response({ hits: 101, jobs: [posting(101)] });
      }
      return response({ hits: 0, jobs: [] });
    });

    const jobs = await adapter.fetchJobs("amazon");

    expect(jobs).toHaveLength(102);
    expect(jobs.find((job) => job.externalId === "201")?.department)
      .toBe("Applied Science");
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("offset"))
      .toBe("100");
  });

  it("accepts a schema-valid zero-job snapshot", async () => {
    installCategoryFetch(() => response({ hits: 0, jobs: [] }));
    expect(await adapter.fetchJobs("amazon")).toEqual([]);
  });

  it("retries a category after live result-count drift", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => posting(index + 1));
    const softwareOffsets: number[] = [];
    let finalPageRequests = 0;
    installCategoryFetch(({ category, offset }) => {
      if (category !== SOFTWARE_DEVELOPMENT) {
        return response({ hits: 0, jobs: [] });
      }
      softwareOffsets.push(offset);
      if (offset === 0) return response({ hits: 101, jobs: firstPage });
      finalPageRequests += 1;
      return response({
        hits: finalPageRequests === 1 ? 100 : 101,
        jobs: [posting(101)],
      });
    });

    const jobs = await adapter.fetchJobs("amazon");

    expect(jobs).toHaveLength(101);
    expect(softwareOffsets).toEqual([0, 100, 0, 100]);
  });

  it("fails closed after three unstable category snapshots", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => posting(index + 1));
    const categoryRequests: string[] = [];
    const softwareOffsets: number[] = [];
    installCategoryFetch(({ category, offset }) => {
      categoryRequests.push(category);
      if (category !== SOFTWARE_DEVELOPMENT) {
        return response({ hits: 0, jobs: [] });
      }
      softwareOffsets.push(offset);
      return offset === 0
        ? response({ hits: 101, jobs: firstPage })
        : response({ hits: 100, jobs: [posting(101)] });
    });

    const unstableSnapshot = adapter.fetchJobs("amazon");
    await expect(unstableSnapshot)
      .rejects.toThrow("snapshot did not stabilize after 3 attempts");
    await expect(unstableSnapshot)
      .rejects.toThrow("result count changed during pagination (101 to 100)");
    expect(softwareOffsets).toEqual([
      0, 100, 0, 100, 0, 100,
    ]);
    expect(categoryRequests.every((category) => category === SOFTWARE_DEVELOPMENT))
      .toBe(true);
  });

  it("rejects capped, truncated, malformed, and failed snapshots", async () => {
    installSoftwareSnapshot({ hits: 10_000, jobs: [] });
    await expect(adapter.fetchJobs("amazon")).rejects.toThrow("result cap");

    const firstPage = Array.from({ length: 100 }, (_, index) => posting(index + 1));
    installCategoryFetch(({ category, offset }) => {
      if (category !== SOFTWARE_DEVELOPMENT) {
        return response({ hits: 0, jobs: [] });
      }
      return offset === 0
        ? response({ hits: 101, jobs: firstPage })
        : response({ hits: 101, jobs: [] });
    });
    await expect(adapter.fetchJobs("amazon")).rejects.toThrow("100 of 101");

    installSoftwareSnapshot({ hits: "1", jobs: [] });
    await expect(adapter.fetchJobs("amazon")).rejects.toThrow("unexpected payload");

    installSoftwareSnapshot({}, false, 503);
    await expect(adapter.fetchJobs("amazon")).rejects.toThrow("API 503");
  });

  it("rejects a nonempty zero-result snapshot", async () => {
    const fetchMock = installSoftwareSnapshot({ hits: 0, jobs: [posting(123)] });

    await expect(adapter.fetchJobs("amazon"))
      .rejects.toThrow("returned 1 jobs for a zero-result snapshot");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects duplicate public IDs that can hide a shifted pagination gap", async () => {
    const fetchMock = installSoftwareSnapshot({
      hits: 2,
      jobs: [posting(321), posting(321, { id: "changed-opaque-id" })],
    });
    await expect(adapter.fetchJobs("amazon")).rejects.toThrow("duplicate public ID 321");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects a duplicate public ID across category partitions", async () => {
    const fetchMock = installCategoryFetch(({ category }) => {
      if (category === SOFTWARE_DEVELOPMENT) {
        return response({ hits: 1, jobs: [posting(321)] });
      }
      if (category === "Applied Science") {
        return response({
          hits: 1,
          jobs: [posting(321, { job_category: "Applied Science" })],
        });
      }
      return response({ hits: 0, jobs: [] });
    });

    await expect(adapter.fetchJobs("amazon"))
      .rejects.toThrow("duplicate public ID 321 across categories");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps identity stable across opaque-ID, title, and path updates", async () => {
    let softwareScans = 0;
    installCategoryFetch(({ category }) => {
      if (category !== SOFTWARE_DEVELOPMENT) {
        return response({ hits: 0, jobs: [] });
      }
      softwareScans += 1;
      return response(softwareScans === 1
        ? { hits: 1, jobs: [posting(321)] }
        : {
          hits: 1,
          jobs: [posting(321, {
            id: "another-opaque-id",
            title: "Software Development Engineer, Updated",
            job_path: "/en/jobs/321/a-new-title-slug",
          })],
        });
    });
    const first = await adapter.fetchJobs("amazon");
    const second = await adapter.fetchJobs("amazon");

    expect(diffJobs(second, new Set(first.map((job) => job.externalId))))
      .toEqual([]);
  });

  it("selects the exact public ID when refreshing content", async () => {
    const fetchMock = mock().mockResolvedValue(response({
      hits: 2,
      jobs: [posting(999), posting(123)],
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const content = await adapter.fetchJobContent("amazon", "123");

    expect(content.description).toContain("Build reliable services");
    expect(content.location).toBe("US, WA, Seattle");
    expect(content.postedAt).toBe("2026-08-27T00:00:00.000Z");
    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.searchParams.get("base_query")).toBe("123");
  });

  it("rejects unsafe job paths and missing stable IDs", async () => {
    installSoftwareSnapshot({
      hits: 1,
      jobs: [posting(123, { job_path: "https://example.com/jobs/123" })],
    });
    await expect(adapter.fetchJobs("amazon")).rejects.toThrow("unsafe job path");

    installSoftwareSnapshot({
      hits: 1,
      jobs: [posting(123, { id_icims: null })],
    });
    await expect(adapter.fetchJobs("amazon")).rejects.toThrow("missing id_icims");
  });

  it("retains closure metadata without eager HTML for out-of-scope titles", async () => {
    installSoftwareSnapshot({
      hits: 1,
      jobs: [posting(123, { title: "Technical Recruiter" })],
    });

    const jobs = await adapter.fetchJobs("amazon");

    expect(jobs[0]).toEqual(expect.objectContaining({
      externalId: "123",
      title: "Technical Recruiter",
      description: null,
      salary: null,
    }));
  });

  it("retains stale job identity without keeping its full HTML", async () => {
    installSoftwareSnapshot({
      hits: 1,
      jobs: [posting(123, { posted_date: "January 1, 2020" })],
    });

    const jobs = await adapter.fetchJobs("amazon");

    expect(jobs[0]).toEqual(expect.objectContaining({
      externalId: "123",
      postedAt: "2020-01-01T00:00:00.000Z",
      description: null,
      salary: null,
    }));
  });

  it("does not retain HTML for titles already outside the fixed seniority band", async () => {
    installSoftwareSnapshot({
      hits: 1,
      jobs: [posting(123, { title: "Senior Software Development Engineer" })],
    });

    const jobs = await adapter.fetchJobs("amazon");

    expect(jobs[0]).toEqual(expect.objectContaining({
      externalId: "123",
      description: null,
      salary: null,
    }));
  });

  it("rejects API errors and ignored category or country filters", async () => {
    installSoftwareSnapshot({
      error: "Result window is too large",
      hits: 1,
      jobs: [posting(123)],
    });
    await expect(adapter.fetchJobs("amazon")).rejects.toThrow("unexpected payload");

    installSoftwareSnapshot({
      hits: 1,
      jobs: [posting(123, { job_category: "Human Resources" })],
    });
    await expect(adapter.fetchJobs("amazon"))
      .rejects.toThrow("escaped the configured category filter Software Development");

    installSoftwareSnapshot({
      hits: 1,
      jobs: [posting(123, {
        country_code: "CAN",
        normalized_location: "Toronto, Ontario, CAN",
        locations: [JSON.stringify({
          countryIso3a: "CAN",
          normalizedLocation: "Toronto, Ontario, CAN",
        })],
      })],
    });
    await expect(adapter.fetchJobs("amazon")).rejects.toThrow("escaped the configured US filter");
  });
});
