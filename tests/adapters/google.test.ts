import { afterEach, beforeEach, describe, expect, it, mock, setSystemTime } from "bun:test";
import {
  GOOGLE_DISCOVERY_PAGE_LIMIT,
  GOOGLE_MAX_HTML_BYTES,
  GoogleCareersAdapter,
  googleRetryDelayMs,
  normalizeGoogleCareersSource,
  readBoundedGoogleCareersHtml,
} from "@worker/adapters/google";
import { diffJobs } from "@worker/poller";

const POSTED_SECONDS = 1_787_950_000;
const originalFetch = globalThis.fetch;

interface PostingOptions {
  title?: string;
  organization?: string | null;
  locations?: unknown[];
  posted?: [number, number];
  updated?: [number, number];
  indexed?: [number, number];
  about?: string | null;
  responsibilities?: string | null;
  qualifications?: string | null;
}

function posting(id: number | string, options: PostingOptions = {}) {
  const value: unknown[] = Array.from({ length: 21 }, () => null);
  value[0] = String(id);
  value[1] = options.title ?? `Software Engineer I ${id}`;
  value[2] = "https://www.google.com/about/careers/applications/signin?jobId=opaque";
  value[3] = [null, options.responsibilities
    ?? "<ul><li>Build reliable software.</li></ul>"];
  value[4] = [null, options.qualifications
    ?? "<h3>Minimum qualifications:</h3><ul><li>Bachelor's or master's degree.</li></ul>"];
  value[5] = "projects/example/companies/google";
  value[7] = options.organization === undefined ? "Google" : options.organization;
  value[8] = "en-US";
  value[9] = options.locations ?? [
    ["Mountain View, CA, USA", ["Mountain View, CA, USA"], "Mountain View", null, "CA", "US"],
  ];
  value[10] = [null, options.about
    ?? "<p>Build products for users.</p><p>US: $120,000 - $180,000 (USD) + benefits</p>"];
  value[11] = [1];
  value[12] = options.posted ?? [POSTED_SECONDS, 123_000_000];
  value[13] = options.updated ?? [POSTED_SECONDS, 123_000_000];
  value[14] = options.indexed ?? [POSTED_SECONDS, 456_000_000];
  value[15] = [null, ""];
  value[18] = [null, ""];
  value[19] = [null, "<ul><li>Bachelor's degree.</li></ul>"];
  value[20] = 1;
  return value;
}

function searchHtml(jobs: unknown[][], total = jobs.length, pageSize = 20) {
  const data = [jobs, null, total, pageSize];
  return `<!doctype html><html><body>
    <script nonce="test">unrelated()</script>
    <script nonce="test" class='ds:1'>
      AF_initDataCallback({key: 'ds:1', hash: '2', data:${JSON.stringify(data)}, sideChannel: {}});
    </script>
  </body></html>`;
}

function detailHtml(value: unknown[]) {
  return `<!doctype html><html><body>
    <script class="ds:0" nonce="test">
      AF_initDataCallback({key: 'ds:0', hash: '1', data:${JSON.stringify([value])}, sideChannel: {}});
    </script>
  </body></html>`;
}

function missingDetailHtml() {
  return `<!doctype html><html><body>
    <script class="ds:0">
      AF_initDataCallback({key: 'ds:0', data:[5,null,[]], errorHasStatus: true,});
    </script>
  </body></html>`;
}

function htmlResponse(html: string, status = 200, headers: HeadersInit = {}) {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
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

function jobsForPage(page: number, count = 20) {
  const start = (page - 1) * 20 + 1;
  return Array.from({ length: count }, (_, index) => posting(start + index));
}

describe("GoogleCareersAdapter", () => {
  let adapter: GoogleCareersAdapter;

  beforeEach(() => {
    adapter = new GoogleCareersAdapter();
    mock.restore();
    // Fixtures represent live August postings; later wall time must not strip content.
    setSystemTime(new Date("2026-08-29T12:00:00Z"));
  });

  afterEach(() => {
    setSystemTime();
    globalThis.fetch = originalFetch;
  });

  it("normalizes only the canonical source and official HTTPS result URLs", () => {
    expect(normalizeGoogleCareersSource("google")).toBe("google");
    expect(normalizeGoogleCareersSource(" GOOGLE ")).toBe("google");
    expect(normalizeGoogleCareersSource(
      "https://www.google.com/about/careers/applications/jobs/results/?location=United+States"
    )).toBe("google");
    expect(normalizeGoogleCareersSource(
      "https://careers.google.com/jobs/results/123-software-engineer"
    )).toBe("google");
    expect(() => normalizeGoogleCareersSource("http://www.google.com/about/careers/applications/jobs/results/"))
      .toThrow("official HTTPS jobs results path");
    expect(() => normalizeGoogleCareersSource("https://www.google.com/search?q=jobs"))
      .toThrow("official HTTPS jobs results path");
    expect(() => normalizeGoogleCareersSource(
      "https://www.google.com/about/careers/applications/jobs/results-evil"
    )).toThrow("official HTTPS jobs results path");
    expect(() => normalizeGoogleCareersSource("https://google.example/jobs/results"))
      .toThrow("official HTTPS jobs results path");
  });

  it("uses the exact US newest-first search and maps stable identity and rich content", async () => {
    const originalPosted: [number, number] = [POSTED_SECONDS - 86_400, 987_000_000];
    const fetchMock = installFetch((url) => {
      expect(url.pathname).toBe("/about/careers/applications/jobs/results/");
      return htmlResponse(searchHtml([posting("123456789012345678", {
        title: "Software Engineer, Early Career, Frontend",
        organization: "Google DeepMind",
        locations: [
          ["Mountain View, CA, USA", [], "Mountain View", null, "CA", "US"],
          ["Toronto, ON, Canada", [], "Toronto", null, "ON", "CA"],
          ["New York, NY, USA", [], "New York", null, "NY", "US"],
          ["mountain view, ca, usa", [], "Mountain View", null, "CA", "US"],
        ],
        posted: originalPosted,
        updated: [POSTED_SECONDS, 100_000_000],
        indexed: [POSTED_SECONDS, 200_000_000],
        responsibilities: "<ul><li>Ship accessible web experiences with React.</li></ul>",
        qualifications: "<h3>Minimum qualifications:</h3><ul><li>Master's degree is accepted.</li></ul>",
        about: "<p>Join the frontend team.</p><p>US: $120,000 - $180,000 (USD)</p>",
      })]));
    });

    const jobs = await adapter.fetchDiscoveryJobs("google");

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(expect.objectContaining({
      externalId: "123456789012345678",
      title: "Software Engineer, Early Career, Frontend",
      url: "https://www.google.com/about/careers/applications/jobs/results/123456789012345678?hl=en_US",
      location: "Mountain View, CA, USA / New York, NY, USA",
      department: "Google DeepMind",
      postedAt: new Date(
        originalPosted[0] * 1_000 + Math.floor(originalPosted[1] / 1_000_000)
      ).toISOString(),
      salary: "$120,000 - $180,000",
    }));
    expect(jobs[0].description).toContain("About the job");
    expect(jobs[0].description).toContain("Responsibilities");
    expect(jobs[0].description).toContain("Qualifications");
    expect(jobs[0].description).toContain("Master's degree is accepted");

    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.searchParams.get("hl")).toBe("en_US");
    expect(requested.searchParams.get("location")).toBe("United States");
    expect(requested.searchParams.get("company")).toBe("Google");
    expect(requested.searchParams.get("sort_by")).toBe("date");
    expect(requested.searchParams.get("page")).toBe("1");
  });

  it("crawls and verifies a complete authoritative snapshot", async () => {
    const fetchMock = installFetch((url) => {
      const page = Number(url.searchParams.get("page"));
      return htmlResponse(searchHtml(
        page === 1 ? jobsForPage(1) : jobsForPage(2, 1),
        21
      ));
    });

    const jobs = await adapter.fetchJobs("google");

    expect(jobs).toHaveLength(21);
    expect(jobs[0].externalId).toBe("1");
    expect(jobs[20].externalId).toBe("21");
    expect(fetchMock.mock.calls.map((call) =>
      new URL(String(call[0])).searchParams.get("page")
    )).toEqual(["1", "2", "1"]);
  });

  it("reconciles complementary boundary shifts across complete passes", async () => {
    let calls = 0;
    const fetchMock = installFetch(() => {
      calls += 1;
      const firstPass = calls <= 3;
      const pageOne = firstPass
        ? Array.from({ length: 20 }, (_, index) => posting(index + 1))
        : Array.from({ length: 20 }, (_, index) => posting(index + 2));
      const pageTwo = firstPass
        ? [posting(20), ...Array.from({ length: 19 }, (_, index) => posting(index + 21))]
        : [posting(21), ...Array.from({ length: 19 }, (_, index) => posting(index + 22))];
      return htmlResponse(searchHtml(calls % 3 === 2 ? pageTwo : pageOne, 40));
    });

    const jobs = await adapter.fetchJobs("google");

    expect(jobs).toHaveLength(40);
    expect(new Set(jobs.map((job) => job.externalId)).size).toBe(40);
    expect(jobs.some((job) => job.externalId === "1")).toBeTrue();
    expect(jobs.some((job) => job.externalId === "40")).toBeTrue();
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("bounds normal discovery to the newest 100 results", async () => {
    const requestedPages: number[] = [];
    installFetch((url) => {
      const page = Number(url.searchParams.get("page"));
      requestedPages.push(page);
      return htmlResponse(searchHtml(jobsForPage(page), 121));
    });

    const jobs = await adapter.fetchDiscoveryJobs("google");

    expect(GOOGLE_DISCOVERY_PAGE_LIMIT).toBe(5);
    expect(jobs).toHaveLength(100);
    expect(requestedPages).toEqual([1, 2, 3, 4, 5]);
    expect(requestedPages).not.toContain(6);
  });

  it("tolerates a shifted page boundary only in incomplete discovery", async () => {
    installFetch((url) => {
      const page = Number(url.searchParams.get("page"));
      const jobs = page === 1
        ? jobsForPage(1)
        : [posting(20), ...Array.from({ length: 19 }, (_, index) => posting(21 + index))];
      return htmlResponse(searchHtml(jobs, 40));
    });

    const jobs = await adapter.fetchDiscoveryJobs("google");
    expect(jobs).toHaveLength(39);
    expect(new Set(jobs.map((job) => job.externalId)).size).toBe(39);
  });

  it("retries and then fails closed when the full result count drifts", async () => {
    const fetchMock = installFetch((url) => {
      const page = Number(url.searchParams.get("page"));
      return htmlResponse(searchHtml(
        page === 1 ? jobsForPage(1) : [posting(21)],
        page === 1 ? 21 : 20
      ));
    });

    await expect(adapter.fetchJobs("google"))
      .rejects.toThrow("snapshot did not stabilize after 3 attempts");
    await expect(adapter.fetchJobs("google"))
      .rejects.toThrow("result count changed during pagination (21 to 20)");
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });

  it("rejects truncation, duplicate IDs, unsafe IDs, and oversized catalogs", async () => {
    installFetch(() => htmlResponse(searchHtml([posting(1)], 2)));
    await expect(adapter.fetchJobs("google"))
      .rejects.toThrow("page 1 returned 1 of 2 expected jobs");

    installFetch(() => htmlResponse(searchHtml([posting(1), posting(1)], 2)));
    await expect(adapter.fetchJobs("google"))
      .rejects.toThrow("duplicate public ID 1");

    installFetch(() => htmlResponse(searchHtml([posting("1/../../bad")])));
    await expect(adapter.fetchDiscoveryJobs("google"))
      .rejects.toThrow("unsafe public ID");

    installFetch(() => htmlResponse(searchHtml([], 5_001)));
    await expect(adapter.fetchDiscoveryJobs("google"))
      .rejects.toThrow("5000-job safety limit");
  });

  it("rejects malformed init data and a non-US-only result", async () => {
    installFetch(() => htmlResponse(
      "<script class='ds:1'>AF_initDataCallback({key: 'ds:1', data:[[],null,\"one\",20], sideChannel:{}})</script>"
    ));
    await expect(adapter.fetchDiscoveryJobs("google"))
      .rejects.toThrow("unexpected search data");

    installFetch(() => htmlResponse(searchHtml([posting(123, {
      locations: [
        ["Toronto, ON, Canada", [], "Toronto", null, "ON", "CA"],
      ],
    })])));
    await expect(adapter.fetchDiscoveryJobs("google"))
      .rejects.toThrow("escaped the configured US filter");
  });

  it("requires a valid original posting timestamp", async () => {
    installFetch(() => htmlResponse(searchHtml([posting(123, {
      posted: [POSTED_SECONDS, 1_000_000_000],
    })])));
    await expect(adapter.fetchDiscoveryJobs("google"))
      .rejects.toThrow("invalid posted timestamp");
  });

  it("accepts protobuf timestamps that omit their zero nanoseconds", async () => {
    const value = posting(123);
    value[12] = [POSTED_SECONDS];
    installFetch(() => htmlResponse(searchHtml([value])));

    const [job] = await adapter.fetchDiscoveryJobs("google");
    expect(job.postedAt).toBe("2026-08-28T20:46:40.000Z");
  });

  it("keeps closure metadata without retaining rich HTML for out-of-scope titles", async () => {
    installFetch(() => htmlResponse(searchHtml([posting(123, {
      title: "Corporate Counsel, Commercial Litigation",
    })])));

    const [job] = await adapter.fetchDiscoveryJobs("google");
    expect(job).toEqual(expect.objectContaining({
      externalId: "123",
      title: "Corporate Counsel, Commercial Litigation",
      description: null,
      salary: null,
    }));
  });

  it("keeps identity stable across title updates", async () => {
    let calls = 0;
    installFetch(() => {
      calls += 1;
      return htmlResponse(searchHtml([posting(321, {
        title: calls === 1
          ? "Software Engineer I"
          : "Software Engineer I, Updated Team",
      })]));
    });

    const first = await adapter.fetchJobs("google");
    const second = await adapter.fetchJobs("google");
    expect(diffJobs(second, new Set(first.map((job) => job.externalId))))
      .toEqual([]);
  });

  it("hydrates a detail by numeric public ID and validates the returned identity", async () => {
    const fetchMock = installFetch(() => htmlResponse(detailHtml(posting(123))));

    const content = await adapter.fetchJobContent("google", "123");

    expect(content.description).toContain("Build reliable software");
    expect(content.salary).toBe("$120,000 - $180,000");
    expect(content.location).toBe("Mountain View, CA, USA");
    expect(content.postedAt).toBe("2026-08-28T20:46:40.123Z");
    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.pathname)
      .toBe("/about/careers/applications/jobs/results/123");
    expect(requested.searchParams.get("hl")).toBe("en_US");

    installFetch(() => htmlResponse(detailHtml(posting(999))));
    await expect(adapter.fetchJobContent("google", "123"))
      .rejects.toThrow("did not match public ID 123");
    await expect(adapter.fetchJobContent("google", "123/../../bad"))
      .rejects.toThrow("unsafe public ID");
  });

  it("returns empty content for HTTP and in-page missing-job responses", async () => {
    installFetch(() => htmlResponse("missing", 404));
    expect(await adapter.fetchJobContent("google", "123"))
      .toEqual({ description: null, salary: null });

    installFetch(() => htmlResponse(missingDetailHtml()));
    expect(await adapter.fetchJobContent("google", "123"))
      .toEqual({ description: null, salary: null });
  });

  it("retries transient statuses but fails immediately on permanent failures", async () => {
    let calls = 0;
    const fetchMock = installFetch(() => {
      calls += 1;
      return calls === 1
        ? htmlResponse("slow down", 429, { "retry-after": "0" })
        : htmlResponse(searchHtml([posting(123)]));
    });
    await expect(adapter.fetchDiscoveryJobs("google")).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const permanentFetch = installFetch(() => htmlResponse("forbidden", 403));
    await expect(adapter.fetchDiscoveryJobs("google"))
      .rejects.toThrow("HTTP 403");
    expect(permanentFetch).toHaveBeenCalledTimes(1);
  });

  it("parses Retry-After defensively", () => {
    const now = Date.parse("2026-08-28T20:00:00.000Z");
    expect(googleRetryDelayMs("1.5", 1, now)).toBe(1_500);
    expect(googleRetryDelayMs("Fri, 28 Aug 2026 20:00:03 GMT", 1, now)).toBe(3_000);
    expect(googleRetryDelayMs(null, 1, now)).toBe(250);
    expect(googleRetryDelayMs(null, 20, now)).toBe(5_000);
  });

  it("bounds and type-checks upstream HTML before parsing", async () => {
    await expect(readBoundedGoogleCareersHtml(
      new Response("{}", { headers: { "content-type": "application/json" } }),
      "test"
    )).rejects.toThrow("returned application/json");

    await expect(readBoundedGoogleCareersHtml(
      new Response("", {
        headers: {
          "content-type": "text/html",
          "content-length": String(GOOGLE_MAX_HTML_BYTES + 1),
        },
      }),
      "test"
    )).rejects.toThrow(`exceeded ${GOOGLE_MAX_HTML_BYTES} bytes`);

    await expect(readBoundedGoogleCareersHtml(
      new Response(new Uint8Array(GOOGLE_MAX_HTML_BYTES + 1), {
        headers: { "content-type": "text/html" },
      }),
      "test"
    )).rejects.toThrow(`exceeded ${GOOGLE_MAX_HTML_BYTES} bytes`);
  });
});
