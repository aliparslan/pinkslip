import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  APPLE_DISCOVERY_PAGE_LIMIT,
  AppleJobsAdapter,
  normalizeAppleJobsSource,
} from "@worker/adapters/apple-jobs";
import { diffJobs } from "@worker/poller";

function response(
  json: unknown,
  ok = true,
  status = 200,
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify(json), {
    status: ok ? status : status === 200 ? 500 : status,
    headers,
  });
}

function installFetch(value: unknown) {
  globalThis.fetch = value as typeof fetch;
}

function posting(index: number, overrides: Record<string, unknown> = {}) {
  const positionId = String(200_000_000 + index);
  return {
    id: `${positionId}-0836`,
    reqId: `${positionId}-0836`,
    positionId,
    postingTitle: `Software Engineer ${index}`,
    transformedPostingTitle: `software-engineer-${index}`,
    postDateInGMT: "2026-08-27T18:30:00.000Z",
    locations: [{
      postLocationId: "postLocation-CUP",
      name: "Cupertino",
      countryID: "iso-country-USA",
      countryName: "United States of America",
    }],
    team: { teamName: "Software and Services", teamCode: "SFTWR" },
    homeOffice: false,
    ...overrides,
  };
}

function searchPayload(total: number, jobs: Record<string, unknown>[]) {
  return { res: { totalRecords: total, searchResults: jobs } };
}

function installSearchFetch(
  handler: (
    page: number,
    init: RequestInit,
    call: number
  ) => unknown | Promise<unknown>
) {
  let call = 0;
  const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe("https://jobs.apple.com/api/v1/search");
    const options = init ?? {};
    const body = JSON.parse(String(options.body));
    call += 1;
    return handler(body.page, options, call);
  });
  installFetch(fetchMock);
  return fetchMock;
}

function pageOne() {
  return Array.from({ length: 20 }, (_, index) => posting(index + 1));
}

describe("AppleJobsAdapter", () => {
  let adapter: AppleJobsAdapter;

  beforeEach(() => {
    adapter = new AppleJobsAdapter();
    mock.restore();
  });

  it("normalizes only the canonical source and official HTTPS host", () => {
    expect(normalizeAppleJobsSource("apple")).toBe("apple");
    expect(normalizeAppleJobsSource(" APPLE ")).toBe("apple");
    expect(normalizeAppleJobsSource(
      "https://jobs.apple.com/en-us/search?location=united-states-USA"
    )).toBe("apple");
    expect(normalizeAppleJobsSource(
      "https://jobs.apple.com/en-us/details/200000001-0836/software-engineer"
    )).toBe("apple");
    expect(() => normalizeAppleJobsSource("http://jobs.apple.com/en-us/search"))
      .toThrow("HTTPS jobs.apple.com");
    expect(() => normalizeAppleJobsSource("https://jobs.apple.com.example.com/search"))
      .toThrow("HTTPS jobs.apple.com");
    expect(() => normalizeAppleJobsSource("https://user@jobs.apple.com/en-us/search"))
      .toThrow("HTTPS jobs.apple.com");
  });

  it("uses Apple's exact US request metadata and maps a complete snapshot", async () => {
    const first = pageOne();
    const fetchMock = installSearchFetch((page) => response(
      page === 1
        ? searchPayload(21, first)
        : searchPayload(21, [posting(21, { homeOffice: true })])
    ));

    const jobs = await adapter.fetchJobs("apple");

    expect(jobs).toHaveLength(21);
    expect(jobs[0]).toEqual({
      externalId: "200000001",
      title: "Software Engineer 1",
      url: "https://jobs.apple.com/en-us/details/200000001/software-engineer-1",
      location: "Cupertino, United States of America",
      department: "Software and Services",
      postedAt: "2026-08-27T18:30:00.000Z",
      description: null,
      salary: null,
    });
    expect(jobs[20].location).toBe("Remote, Cupertino, United States of America");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const calls = fetchMock.mock.calls;
    expect(calls.map((call) => JSON.parse(String(call[1]?.body)).page))
      .toEqual([1, 2, 1]);
    const firstInit = calls[0]?.[1];
    expect(firstInit).toBeDefined();
    if (!firstInit) throw new Error("Expected an Apple search request");
    expect(firstInit.method).toBe("POST");
    expect(firstInit.headers).toEqual(expect.objectContaining({
      accept: "application/json",
      "content-type": "application/json",
      locale: "en_US",
      countrycode: "USA",
      roveremaillocalecode: "en_US",
    }));
    expect(JSON.parse(String(firstInit.body))).toEqual({
      query: "",
      filters: { locations: ["postLocation-USA"] },
      page: 1,
      locale: "en-us",
      sort: "newest",
      format: {
        longDate: "MMMM D, YYYY",
        mediumDate: "MMM D, YYYY",
      },
    });
  });

  it("accepts a schema-valid zero-job US snapshot", async () => {
    const fetchMock = installSearchFetch(() => response(searchPayload(0, [])));
    expect(await adapter.fetchJobs("apple")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds scheduled discovery to the newest catalog pages", async () => {
    const total = (APPLE_DISCOVERY_PAGE_LIMIT + 5) * 20;
    const pages: number[] = [];
    installSearchFetch((page) => {
      pages.push(page);
      return response(searchPayload(
        total,
        Array.from(
          { length: 20 },
          (_, index) => posting((page - 1) * 20 + index + 1)
        )
      ));
    });

    const jobs = await adapter.fetchDiscoveryJobs("apple");

    expect(jobs).toHaveLength(APPLE_DISCOVERY_PAGE_LIMIT * 20);
    expect(pages.sort((a, b) => a - b)).toEqual(
      Array.from({ length: APPLE_DISCOVERY_PAGE_LIMIT }, (_, index) => index + 1)
    );
  });

  it("tolerates a shifted boundary in newest-first discovery", async () => {
    const first = pageOne();
    installSearchFetch((page) => response(searchPayload(
      21,
      page === 1 ? first : [posting(20)]
    )));

    const jobs = await adapter.fetchDiscoveryJobs("apple");

    expect(jobs).toHaveLength(20);
  });

  it("honors Retry-After for rate-limited pages", async () => {
    let calls = 0;
    const fetchMock = installSearchFetch(() => {
      calls += 1;
      return calls === 1
        ? response({}, false, 429, { "retry-after": "0" })
        : response(searchPayload(1, [posting(1)]));
    });

    expect(await adapter.fetchJobs("apple")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries search transport failures within the absolute list budget", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    let calls = 0;
    const fetchMock = installSearchFetch(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("request timed out"))
        : response(searchPayload(1, [posting(1)]));
    });
    globalThis.setTimeout = ((
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (typeof delay === "number" && delay < 15_000) {
        queueMicrotask(() => callback(...args));
        return 1;
      }
      return originalSetTimeout(callback, delay, ...args);
    }) as typeof setTimeout;

    try {
      expect(await adapter.fetchJobs("apple")).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it("retries a snapshot after live result-count drift", async () => {
    const first = pageOne();
    const pages: number[] = [];
    let pageTwoCalls = 0;
    installSearchFetch((page) => {
      pages.push(page);
      if (page === 1) return response(searchPayload(21, first));
      pageTwoCalls += 1;
      return response(searchPayload(
        pageTwoCalls === 1 ? 20 : 21,
        pageTwoCalls === 1 ? [] : [posting(21)]
      ));
    });

    const jobs = await adapter.fetchJobs("apple");

    expect(jobs).toHaveLength(21);
    expect(pages).toEqual([1, 2, 1, 2, 1]);
  });

  it("retries when the leading sort boundary changes without a count change", async () => {
    const original = pageOne();
    const shifted = [posting(99), ...original.slice(0, 19)];
    let pageOneCalls = 0;
    const pages: number[] = [];
    installSearchFetch((page) => {
      pages.push(page);
      if (page === 2) return response(searchPayload(21, [posting(21)]));
      pageOneCalls += 1;
      return response(searchPayload(
        21,
        pageOneCalls === 2 ? shifted : original
      ));
    });

    const jobs = await adapter.fetchJobs("apple");

    expect(jobs).toHaveLength(21);
    expect(pages).toEqual([1, 2, 1, 1, 2, 1]);
  });

  it("fails closed after three unstable snapshots", async () => {
    const first = pageOne();
    const pages: number[] = [];
    installSearchFetch((page) => {
      pages.push(page);
      return response(page === 1
        ? searchPayload(21, first)
        : searchPayload(20, []));
    });

    await expect(adapter.fetchJobs("apple"))
      .rejects.toThrow("snapshot did not stabilize after 3 attempts");
    expect(pages).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it("rejects truncated, duplicate, capped, malformed, and failed snapshots", async () => {
    let fetchMock = installSearchFetch(() => response(searchPayload(21, posting(1) as never)));
    await expect(adapter.fetchJobs("apple")).rejects.toThrow("unexpected search payload");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock = installSearchFetch(() => response(searchPayload(21, [posting(1)])));
    await expect(adapter.fetchJobs("apple")).rejects.toThrow("page 1 returned 1 of 20");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const duplicateFirst = [posting(1), posting(1), ...pageOne().slice(2)];
    fetchMock = installSearchFetch(() => response(searchPayload(20, duplicateFirst)));
    await expect(adapter.fetchJobs("apple")).rejects.toThrow("duplicate public ID");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock = installSearchFetch(() => response(searchPayload(10_000, [])));
    await expect(adapter.fetchJobs("apple")).rejects.toThrow("safety limit");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock = installSearchFetch(() => response({ res: { totalRecords: "1" } }));
    await expect(adapter.fetchJobs("apple")).rejects.toThrow("unexpected search payload");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock = installSearchFetch(() => response({}, false, 400));
    await expect(adapter.fetchJobs("apple")).rejects.toThrow("API 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates location request variants into one base Apple position", async () => {
    installSearchFetch(() => response(searchPayload(2, [
      posting(1),
      posting(1, {
        id: "200000001-0357",
        reqId: "200000001-0357",
        locations: [{
          postLocationId: "postLocation-AUS",
          name: "Austin",
          countryID: "iso-country-USA",
          countryName: "United States of America",
        }],
      }),
    ])));

    const jobs = await adapter.fetchJobs("apple");

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(expect.objectContaining({
      externalId: "200000001",
      url: "https://jobs.apple.com/en-us/details/200000001/software-engineer-1",
      location: "Cupertino, United States of America / Austin, United States of America",
    }));
  });

  it("fails closed at its absolute list subrequest budget", async () => {
    const attemptsByPage = new Map<number, number>();
    const fetchMock = installSearchFetch((page) => {
      const attempts = (attemptsByPage.get(page) ?? 0) + 1;
      attemptsByPage.set(page, attempts);
      if (attempts % 2 === 1) {
        return response({}, false, 429, { "retry-after": "0" });
      }

      const total = page === 250 ? 4_998 : 4_999;
      const count = Math.min(20, Math.max(0, total - (page - 1) * 20));
      const jobs = Array.from(
        { length: count },
        (_, index) => posting((page - 1) * 20 + index + 1)
      );
      return response(searchPayload(total, jobs));
    });

    await expect(adapter.fetchJobs("apple"))
      .rejects.toThrow("exhausted its 800-subrequest list budget");
    expect(fetchMock).toHaveBeenCalledTimes(800);
  });

  it("bounds search responses before parsing JSON", async () => {
    const fetchMock = mock().mockResolvedValue(new Response("{}", {
      headers: { "content-length": String(256 * 1024 + 1) },
    }));
    installFetch(fetchMock);

    await expect(adapter.fetchJobs("apple"))
      .rejects.toThrow("search page 1 exceeded its response size limit");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects jobs that escape the US filter or carry unsafe identity metadata", async () => {
    installSearchFetch(() => response(searchPayload(1, [posting(1, {
      locations: [{ name: "Toronto", countryID: "iso-country-CAN", countryName: "Canada" }],
    })])));
    await expect(adapter.fetchJobs("apple"))
      .rejects.toThrow("escaped the configured US filter");

    installSearchFetch(() => response(searchPayload(1, [posting(1, {
      reqId: "https://example.com/role",
    })])));
    await expect(adapter.fetchJobs("apple")).rejects.toThrow("unsafe reqId");

    installSearchFetch(() => response(searchPayload(1, [posting(1, {
      positionId: "200000002",
    })])));
    await expect(adapter.fetchJobs("apple")).rejects.toThrow("mismatched positionId");

    installSearchFetch(() => response(searchPayload(1, [posting(1, {
      transformedPostingTitle: "../../unsafe",
    })])));
    await expect(adapter.fetchJobs("apple")).rejects.toThrow("unsafe title slug");

    installSearchFetch(() => response(searchPayload(1, [posting(1, {
      transformedPostingTitle: "software%2Fengineer",
    })])));
    await expect(adapter.fetchJobs("apple")).rejects.toThrow("unsafe title slug");
  });

  it("canonically preserves Apple's percent-encoded logo title segment", async () => {
    installSearchFetch(() => response(searchPayload(1, [posting(1, {
      postingTitle: " Acoustics Engineer",
      transformedPostingTitle: "%EF%A3%BF-acoustics-engineer",
    })])));

    const [job] = await adapter.fetchJobs("apple");
    expect(job.url).toBe(
      "https://jobs.apple.com/en-us/details/200000001/%EF%A3%BF-acoustics-engineer"
    );
  });

  it("keeps public identity stable across title and slug updates", async () => {
    let scan = 0;
    installSearchFetch(() => {
      scan += 1;
      return response(searchPayload(1, [posting(1, scan === 1 ? {} : {
        postingTitle: "Software Engineer, Updated",
        transformedPostingTitle: "software-engineer-updated",
      })]));
    });

    const first = await adapter.fetchJobs("apple");
    const second = await adapter.fetchJobs("apple");

    expect(diffJobs(second, new Set(first.map((job) => job.externalId))))
      .toEqual([]);
  });

  it("hydrates exact detail content, compensation, location, and posting date", async () => {
    const fetchMock = mock().mockResolvedValue(response({
      res: {
        jobNumber: "200000001",
        jobSummary: "Build reliable products.",
        description: "Own distributed services.",
        minimumQualifications: "Bachelor's degree or equivalent experience.",
        preferredQualifications: "Experience with Swift.",
        longPostingDate: "2026-08-27T18:30:00+00:00",
        homeOffice: true,
        locations: [{
          id: "postLocation-CUP",
          city: "Cupertino",
          stateProvince: "California",
          countryName: "United States",
          countryID: "iso-country-USA",
        }],
        postingFooters: [{
          localizations: {
            en_US: [{
              name: "Pay & Benefits",
              content: "The base pay range is between $146,800 and $220,900.",
            }],
          },
        }],
      },
    }));
    installFetch(fetchMock);

    const content = await adapter.fetchJobContent(
      "apple",
      "200000001",
      "https://jobs.apple.com/en-us/details/200000001/software-engineer-1?team=SFTWR"
    );

    expect(content.description).toContain("<h2>Summary</h2>Build reliable products.");
    expect(content.description).toContain("Minimum Qualifications");
    expect(content.description).toContain("Experience with Swift");
    expect(content.salary).toBe("$146,800 - $220,900");
    expect(content.location)
      .toBe("Remote, Cupertino, California, United States");
    expect(content.postedAt).toBe("2026-08-27T18:30:00.000Z");

    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.origin).toBe("https://jobs.apple.com");
    expect(requested.pathname)
      .toBe("/api/v1/jobDetails/200000001");
    expect(requested.searchParams.get("locale")).toBe("en-us");
    expect(fetchMock.mock.calls[0][1].headers).toEqual(expect.objectContaining({
      locale: "en_US",
      countrycode: "USA",
      roveremaillocalecode: "en_US",
    }));
  });

  it("validates detail identity, URL host, and response shape", async () => {
    installFetch(mock().mockResolvedValue(response({
      res: { jobNumber: "200000002" },
    })));
    await expect(adapter.fetchJobContent("apple", "200000001"))
      .rejects.toThrow("did not match public role ID");

    await expect(adapter.fetchJobContent(
      "apple",
      "200000001",
      "https://example.com/en-us/details/200000001/software-engineer"
    )).rejects.toThrow("does not match jobs.apple.com");

    installFetch(mock().mockResolvedValue(response({})));
    await expect(adapter.fetchJobContent("apple", "200000001"))
      .rejects.toThrow("unexpected detail payload");

    let canceled = false;
    const missingBody = new ReadableStream<Uint8Array>({
      cancel() {
        canceled = true;
      },
    });
    installFetch(mock().mockResolvedValue(new Response(missingBody, { status: 404 })));
    expect(await adapter.fetchJobContent("apple", "200000001"))
      .toEqual({ description: null, salary: null });
    expect(canceled).toBe(true);
  });

  it("spends only one detail subrequest per listing and surfaces failures", async () => {
    let fetchMock = mock().mockResolvedValue(response(
      {},
      false,
      429,
      { "retry-after": "0" }
    ));
    installFetch(fetchMock);
    await expect(adapter.fetchJobContent("apple", "200000001"))
      .rejects.toThrow("API 429 after 1 attempts");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock = mock().mockResolvedValue(response({}, false, 400));
    installFetch(fetchMock);
    await expect(adapter.fetchJobContent("apple", "200000001"))
      .rejects.toThrow("detail 200000001 API 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock = mock().mockResolvedValue(response(
      {},
      false,
      503,
      { "retry-after": "0" }
    ));
    installFetch(fetchMock);
    await expect(adapter.fetchJobContent("apple", "200000001"))
      .rejects.toThrow("API 503 after 1 attempts");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not multiply detail transport failures inside one poll", async () => {
    const fetchMock = mock().mockRejectedValue(new Error("connection reset"));
    installFetch(fetchMock);

    await expect(adapter.fetchJobContent("apple", "200000001"))
      .rejects.toThrow("request failed after 1 attempts");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds streamed detail responses before parsing JSON", async () => {
    const fetchMock = mock().mockResolvedValue(
      new Response("x".repeat(512 * 1024 + 1))
    );
    installFetch(fetchMock);

    await expect(adapter.fetchJobContent("apple", "200000001"))
      .rejects.toThrow("detail 200000001 exceeded its response size limit");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels a stalled detail body when its total read deadline expires", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    let canceled = false;
    const stalled = new ReadableStream<Uint8Array>({
      cancel() {
        canceled = true;
      },
    });
    globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
      queueMicrotask(callback);
      return 1;
    }) as typeof setTimeout;
    installFetch(mock().mockResolvedValue(new Response(stalled)));

    try {
      await expect(adapter.fetchJobContent("apple", "200000001"))
        .rejects.toThrow("response body timed out after 15000ms");
      expect(canceled).toBe(true);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it("maps managed pipeline roles to their public detail ID", async () => {
    installSearchFetch(() => response(searchPayload(1, [posting(1, {
      id: "PIPE-114438158",
      reqId: "PIPE-114438158",
      positionId: "114438158",
      postingTitle: "US Specialist",
      transformedPostingTitle: "us-specialist",
    })])));

    const [job] = await adapter.fetchJobs("apple");
    expect(job.externalId).toBe("114438158");
    expect(job.url)
      .toBe("https://jobs.apple.com/en-us/details/114438158/us-specialist");
  });
});
