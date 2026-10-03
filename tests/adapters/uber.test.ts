import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";
import {
  UberAdapter,
  mapUberJobDetail,
  normalizeUberSource,
  parseUberSearchPage,
  readBoundedUberJsonText,
  uberRetryDelayMs,
} from "@worker/adapters/uber";

const PUBLIC_ORIGIN = "https://jobs.uber.com";
const originalFetch = globalThis.fetch;

interface SummaryOptions {
  title?: string;
  location?: string;
  country?: string;
  postedDate?: string | null;
  department?: string | null;
}

function summary(id: number | string, options: SummaryOptions = {}) {
  return {
    Id: String(id),
    Title: options.title ?? `Software Engineer I ${id}`,
    PrimaryLocation: options.location ?? "New York City, NY, United States",
    PrimaryLocationCountry: options.country ?? "US",
    PostedDate: options.postedDate === undefined ? "2026-08-28" : options.postedDate,
    Department: options.department ?? "Software Engineering",
    JobFunction: null,
    JobFamily: null,
  };
}

function searchPayload(
  total: number,
  offset: number,
  jobs: unknown[],
  overrides: Record<string, unknown> = {}
) {
  return {
    items: [{
      SearchId: 1,
      SiteNumber: "UberCareers",
      Location: "United States",
      SortBy: "POSTING_DATES_DESC",
      Offset: offset,
      Limit: 100,
      TotalJobsCount: total,
      requisitionList: jobs,
      ...overrides,
    }],
    count: 1,
    hasMore: false,
    limit: 200,
    offset: 0,
  };
}

interface DetailOptions {
  title?: string;
  category?: string | null;
  postedAt?: string;
  description?: string;
  responsibilities?: string | null;
  qualifications?: string | null;
  primaryLocation?: string;
  primaryCountry?: string;
  secondaryLocations?: unknown[];
  workplaceType?: string | null;
  workplaceTypeCode?: string | null;
}

function detail(id: number | string, options: DetailOptions = {}) {
  return {
    Id: String(id),
    Title: options.title ?? "Software Engineer I",
    Category: options.category === undefined ? "Engineer" : options.category,
    Department: null,
    JobFunction: null,
    ExternalPostedStartDate: options.postedAt ?? "2026-08-24T21:31:20+00:00",
    ExternalDescriptionStr: options.description
      ?? "<p>Build reliable services.</p><p>USD $120,000 - USD $180,000 per year.</p>",
    ExternalResponsibilitiesStr: options.responsibilities === undefined
      ? "<ul><li>Ship production software.</li></ul>"
      : options.responsibilities,
    ExternalQualificationsStr: options.qualifications === undefined
      ? "<ul><li>Bachelor's or master's degree.</li></ul>"
      : options.qualifications,
    ShortDescriptionStr: null,
    PrimaryLocation: options.primaryLocation
      ?? "New York City, NY, United States",
    PrimaryLocationCountry: options.primaryCountry ?? "US",
    secondaryLocations: options.secondaryLocations ?? [],
    WorkplaceType: options.workplaceType ?? "",
    WorkplaceTypeCode: options.workplaceTypeCode ?? null,
  };
}

function jsonResponse(
  payload: unknown,
  init: ResponseInit = {}
) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

function installFetch(
  handler: (url: URL, init: RequestInit | undefined) => Response | Promise<Response>
) {
  const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(input)), init)
  );
  const installedFetch: typeof fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      await fetchMock(input, init),
    { preconnect: originalFetch.preconnect }
  );
  globalThis.fetch = installedFetch;
  return fetchMock;
}

function finderOffset(url: URL) {
  const finder = url.searchParams.get("finder") ?? "";
  const match = /(?:^|,)offset=(\d+)(?:,|$)/.exec(finder);
  if (!match) throw new Error("test request omitted an offset");
  return Number(match[1]);
}

function jobsForOffset(offset: number, count: number) {
  return Array.from({ length: count }, (_, index) => summary(offset + index + 1));
}

function currentPage(total: number, offset: number) {
  return searchPayload(
    total,
    offset,
    jobsForOffset(offset, Math.min(100, Math.max(0, total - offset)))
  );
}

function cancellableErrorResponse(onCancel: () => void) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("temporary error"));
    },
    cancel() {
      onCancel();
    },
  }), {
    status: 503,
    headers: { "content-type": "text/plain", "retry-after": "0" },
  });
}

describe("UberAdapter", () => {
  beforeEach(() => {
    mock.restore();
    setSystemTime(new Date("2026-08-29T12:00:00Z"));
  });

  afterEach(() => {
    setSystemTime();
    globalThis.fetch = originalFetch;
  });

  it("normalizes only Uber's canonical slug and official public jobs path", () => {
    expect(normalizeUberSource("uber")).toBe("uber");
    expect(normalizeUberSource(" UBER ")).toBe("uber");
    expect(normalizeUberSource("https://jobs.uber.com/en/jobs/")).toBe("uber");
    expect(normalizeUberSource("https://jobs.uber.com/en/jobs/301141/")).toBe("uber");
    expect(normalizeUberSource(
      "https://jobs.uber.com/en/jobs/?query=Software"
    )).toBe("uber");

    expect(() => normalizeUberSource("http://jobs.uber.com/en/jobs/"))
      .toThrow("HTTPS jobs.uber.com");
    expect(() => normalizeUberSource("https://user@jobs.uber.com/en/jobs/"))
      .toThrow("HTTPS jobs.uber.com");
    expect(() => normalizeUberSource("https://jobs.uber.com:8443/en/jobs/"))
      .toThrow("HTTPS jobs.uber.com");
    expect(() => normalizeUberSource("https://jobs.uber.com/en/locations/"))
      .toThrow("/en/jobs");
    expect(() => normalizeUberSource("https://jobs.uber.example/en/jobs/"))
      .toThrow("HTTPS jobs.uber.com");
  });

  it("caps Retry-After and applies bounded exponential fallback", () => {
    expect(uberRetryDelayMs("999", 1)).toBe(2_000);
    expect(uberRetryDelayMs(
      new Date("2026-08-28T12:01:00Z").toUTCString(),
      1,
      Date.parse("2026-08-28T12:00:00Z")
    )).toBe(2_000);
    expect(uberRetryDelayMs("invalid", 1)).toBe(250);
    expect(uberRetryDelayMs(null, 2)).toBe(500);
  });

  it("parses strict US summary metadata and exact advertised page sizes", () => {
    const parsed = parseUberSearchPage(searchPayload(1, 0, [summary("301141")]), 0);
    expect(parsed).toEqual({
      total: 1,
      offset: 0,
      jobs: [{
        externalId: "301141",
        title: "Software Engineer I 301141",
        location: "New York City, NY, United States",
        locationCountry: "US",
        department: "Software Engineering",
        postedAt: "2026-08-28T00:00:00.000Z",
      }],
    });

    expect(() => parseUberSearchPage(
      searchPayload(1, 0, [summary("301141", {
        location: "Toronto, Canada",
        country: "CA",
      })]),
      0
    )).toThrow("US search returned non-US job 301141");
    expect(() => parseUberSearchPage(
      searchPayload(2, 0, [summary("1")]),
      0
    )).toThrow("returned 1 of 2 expected jobs");
    expect(() => parseUberSearchPage(
      searchPayload(2, 0, [summary("1"), summary("1")]),
      0
    )).toThrow("repeated public ID 1");
    expect(() => parseUberSearchPage(
      searchPayload(2_001, 0, jobsForOffset(0, 100)),
      0
    )).toThrow("2000-job safety limit");
  });

  it("discovers two matching complete newest-first US identity scans", async () => {
    const fetchMock = installFetch((url, init) => {
      expect(url.origin).toBe("https://iaziqy.fa.ocs.oraclecloud.com");
      expect(url.pathname).toEndWith("/recruitingCEJobRequisitions");
      expect(url.searchParams.get("expand")).toBe("requisitionList");
      expect(url.searchParams.get("onlyData")).toBe("true");
      const finder = url.searchParams.get("finder") ?? "";
      expect(finder).toContain("siteNumber=UberCareers");
      expect(finder).toContain("location=United States");
      expect(finder).toContain("sortBy=POSTING_DATES_DESC");
      expect(new Headers(init?.headers).get("accept")).toBe("application/json");
      const offset = finderOffset(url);
      return jsonResponse(currentPage(101, offset));
    });

    const references = await new UberAdapter().fetchDiscoveryJobReferences("uber");

    expect(references).toHaveLength(101);
    expect(references[0]).toEqual({
      externalId: "1",
      url: `${PUBLIC_ORIGIN}/en/jobs/1/`,
    });
    expect(references[100].externalId).toBe("101");
    expect(fetchMock.mock.calls.map((call) =>
      finderOffset(new URL(String(call[0])))
    )).toEqual([0, 100, 0, 100]);
  });

  it("accepts a changed board only after two consecutive identity scans match", async () => {
    let call = 0;
    installFetch((url) => {
      const scan = Math.floor(call / 2);
      call += 1;
      const offset = finderOffset(url);
      const firstId = scan === 0 ? 1 : 2;
      const ids = Array.from({ length: 101 }, (_, index) => firstId + index);
      const rows = ids.slice(offset, offset + 100).map((id) => summary(id));
      return jsonResponse(searchPayload(101, offset, rows));
    });

    const references = await new UberAdapter().fetchDiscoveryJobReferences("uber");
    expect(references).toHaveLength(101);
    expect(references[0].externalId).toBe("2");
    expect(references.at(-1)?.externalId).toBe("102");
    expect(call).toBe(6);
  });

  it("retries and fails closed when the result count drifts during pagination", async () => {
    const fetchMock = installFetch((url) => {
      const offset = finderOffset(url);
      return jsonResponse(offset === 0
        ? currentPage(101, 0)
        : searchPayload(100, 100, []));
    });

    await expect(new UberAdapter().fetchDiscoveryJobReferences("uber"))
      .rejects.toThrow("snapshot did not stabilize after 3 attempts");
    await expect(new UberAdapter().fetchDiscoveryJobReferences("uber"))
      .rejects.toThrow("result count changed during pagination (101 to 100)");
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });

  it("fails closed on duplicate identities crossing a page boundary", async () => {
    const fetchMock = installFetch((url) => {
      const offset = finderOffset(url);
      return jsonResponse(offset === 0
        ? currentPage(101, 0)
        : searchPayload(101, 100, [summary(100)]));
    });

    await expect(new UberAdapter().fetchDiscoveryJobReferences("uber"))
      .rejects.toThrow("repeated public ID 100 across search pages");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("maps original dates, US locations, full requirements, and salary", async () => {
    const fetchMock = installFetch((url) => {
      expect(url.pathname).toEndWith("/recruitingCEJobRequisitionDetails/301141");
      expect(url.searchParams.get("expand")).toBe("all");
      return jsonResponse(detail("301141", {
        title: "Software Engineer, Early Career",
        workplaceTypeCode: "ORA_REMOTE",
        secondaryLocations: [
          {
            Name: "San Francisco, CA, United States",
            CountryCode: "US",
          },
          { Name: "Toronto, Canada", CountryCode: "CA" },
        ],
        qualifications:
          "<p>Master's degree accepted. Active security clearance required.</p>",
      }));
    });

    const listing = await new UberAdapter().fetchJobListing(
      "uber",
      "301141",
      `${PUBLIC_ORIGIN}/en/jobs/301141/`
    );
    expect(listing).toMatchObject({
      externalId: "301141",
      title: "Software Engineer, Early Career",
      url: `${PUBLIC_ORIGIN}/en/jobs/301141/`,
      location:
        "Remote, US / New York City, NY, United States / San Francisco, CA, United States",
      department: "Engineer",
      postedAt: "2026-08-24T21:31:20.000Z",
      salary: "USD $120,000 - USD $180,000",
    });
    expect(listing.description).toContain("Ship production software");
    expect(listing.description).toContain("Master's degree accepted");
    expect(listing.description).toContain("security clearance required");
    expect(listing.description).not.toContain("Toronto");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains degree evidence and validates canonical detail identity", () => {
    const reference = {
      externalId: "301141",
      url: `${PUBLIC_ORIGIN}/en/jobs/301141/`,
    };
    const listing = mapUberJobDetail(detail("301141", {
      qualifications: "<p>PhD in Computer Science required.</p>",
    }), reference);
    expect(listing.description).toContain("PhD in Computer Science required");

    expect(() => mapUberJobDetail(detail("301142"), reference))
      .toThrow("did not match public ID 301141");
    expect(() => mapUberJobDetail(detail("301141"), {
      ...reference,
      url: "https://evil.example/en/jobs/301141/",
    })).toThrow("outside its official public path");
  });

  it("drops rich content early for an obviously out-of-scope role", () => {
    const listing = mapUberJobDetail(detail("158663", {
      title: "Lead Product Manager, Merchant Growth",
      category: "Product",
    }), {
      externalId: "158663",
      url: `${PUBLIC_ORIGIN}/en/jobs/158663/`,
    });
    expect(listing).toMatchObject({
      title: "Lead Product Manager, Merchant Growth",
      department: "Product",
      description: null,
      salary: null,
    });
  });

  it("hydrates only potential catalog titles during a complete backfill", async () => {
    const fetchMock = installFetch((url) => {
      if (url.pathname.endsWith("/recruitingCEJobRequisitions")) {
        return jsonResponse(searchPayload(2, 0, [
          summary("301141", { title: "Software Engineer I" }),
          summary("158663", {
            title: "Lead Product Manager, Merchant Growth",
            department: "Product",
          }),
        ]));
      }
      return jsonResponse(detail("301141"));
    });

    const jobs = await new UberAdapter().fetchJobs("uber");
    expect(jobs).toHaveLength(2);
    expect(jobs[0].description).toContain("Build reliable services");
    expect(jobs[1]).toMatchObject({
      externalId: "158663",
      description: null,
      salary: null,
    });
    expect(fetchMock.mock.calls.filter((call) =>
      new URL(String(call[0])).pathname.includes("JobRequisitionDetails/")
    )).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retains content on explicit detail hydration even for an out-of-scope title", async () => {
    installFetch(() => jsonResponse(detail("158663", {
      title: "Lead Product Manager, Merchant Growth",
      category: "Product",
    })));

    const content = await new UberAdapter().fetchJobContent(
      "uber",
      "158663",
      `${PUBLIC_ORIGIN}/en/jobs/158663/`
    );
    expect(content.description).toContain("Build reliable services");
    expect(content.location).toBe("New York City, NY, United States");
    expect(content.postedAt).toBe("2026-08-24T21:31:20.000Z");
  });

  it("cancels and retries transient detail statuses", async () => {
    let canceled = 0;
    const fetchMock = installFetch(() => fetchMock.mock.calls.length === 1
      ? cancellableErrorResponse(() => { canceled += 1; })
      : jsonResponse(detail("301141")));

    await expect(new UberAdapter().fetchJobListing("uber", "301141"))
      .resolves.toMatchObject({ externalId: "301141" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(canceled).toBe(1);
  });

  it("treats missing details as closed without inventing content", async () => {
    installFetch(() => new Response(null, { status: 404 }));

    await expect(new UberAdapter().fetchJobListing("uber", "301141"))
      .rejects.toThrow("is no longer available");
    await expect(new UberAdapter().fetchJobContent("uber", "301141"))
      .resolves.toEqual({ description: null, salary: null });
  });

  it("bounds and times out streamed JSON bodies", async () => {
    let oversizedCanceled = false;
    const oversized = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("12345"));
      },
      cancel() {
        oversizedCanceled = true;
      },
    }), { headers: { "content-type": "application/json" } });
    await expect(readBoundedUberJsonText(oversized, "oversized", 1_000, 4))
      .rejects.toThrow("exceeded 4 bytes");
    expect(oversizedCanceled).toBe(true);

    let stalledCanceled = false;
    const stalled = new Response(new ReadableStream<Uint8Array>({
      cancel() {
        stalledCanceled = true;
      },
    }), { headers: { "content-type": "application/json" } });
    await expect(readBoundedUberJsonText(stalled, "stalled", 10, 100))
      .rejects.toThrow("body timed out after 10ms");
    expect(stalledCanceled).toBe(true);
  });

  it("rejects mislabeled and advertised-oversized JSON before buffering", async () => {
    let wrongTypeCanceled = false;
    const wrongType = new Response(new ReadableStream<Uint8Array>({
      cancel() {
        wrongTypeCanceled = true;
      },
    }), { headers: { "content-type": "text/html" } });
    await expect(readBoundedUberJsonText(wrongType, "wrong type", 1_000, 100))
      .rejects.toThrow("returned text/html");
    expect(wrongTypeCanceled).toBe(true);

    let advertisedCanceled = false;
    const advertised = new Response(new ReadableStream<Uint8Array>({
      cancel() {
        advertisedCanceled = true;
      },
    }), {
      headers: {
        "content-type": "application/json",
        "content-length": "101",
      },
    });
    await expect(readBoundedUberJsonText(advertised, "advertised", 1_000, 100))
      .rejects.toThrow("exceeded 100 bytes");
    expect(advertisedCanceled).toBe(true);
  });
});
