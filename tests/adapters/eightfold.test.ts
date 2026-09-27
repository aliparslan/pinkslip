import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  EightfoldAdapter,
  eightfoldRetryDelayMs,
  normalizeEightfoldSource,
  parseEightfoldSource,
  readBoundedEightfoldText,
} from "@worker/adapters/eightfold";

const SOURCE = "https://acme.eightfold.ai/careers?domain=acme.com";

function jsonResponse(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function pcsxPage(count: number, positions: unknown[]) {
  return { status: 200, error: { message: "", body: "" }, data: { count, positions } };
}

function position(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Software Engineer ${id}`,
    standardizedLocations: ["San Francisco, CA, US"],
    locations: ["San Francisco, California, United States"],
    department: "Engineering",
    postedTs: 1_787_875_550,
    workLocationOption: "hybrid",
    positionUrl: `/careers/job/${id}`,
    ...overrides,
  };
}

function installFetch(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>
) {
  const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(input)), init)
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("EightfoldAdapter", () => {
  beforeEach(() => mock.restore());

  it("normalizes only explicit HTTPS Eightfold tenant boards", () => {
    expect(normalizeEightfoldSource(
      " https://PayPal.eightfold.ai/careers/search?domain=PayPal.com&query=x "
    )).toBe("https://paypal.eightfold.ai/careers?domain=paypal.com");
    expect(parseEightfoldSource(SOURCE)).toEqual({
      origin: "https://acme.eightfold.ai",
      tenant: "acme",
      groupId: "acme.com",
      boardUrl: SOURCE,
    });

    expect(() => normalizeEightfoldSource("acme"))
      .toThrow("full HTTPS tenant board URL");
    expect(() => normalizeEightfoldSource("http://acme.eightfold.ai/careers?domain=acme.com"))
      .toThrow("HTTPS {tenant}.eightfold.ai");
    expect(() => normalizeEightfoldSource("https://eightfold.ai.evil.com/careers?domain=acme.com"))
      .toThrow("HTTPS {tenant}.eightfold.ai");
    expect(() => normalizeEightfoldSource("https://acme.eightfold.ai/jobs?domain=acme.com"))
      .toThrow("/careers board");
    expect(() => normalizeEightfoldSource("https://acme.eightfold.ai/careers"))
      .toThrow("exactly one valid domain");
    expect(() => normalizeEightfoldSource(
      "https://acme.eightfold.ai/careers?domain=acme.com&domain=evil.com"
    )).toThrow("exactly one valid domain");
  });

  it("honors Retry-After within a bounded delay", () => {
    expect(eightfoldRetryDelayMs("0")).toBe(0);
    expect(eightfoldRetryDelayMs("999")).toBe(250);
    expect(eightfoldRetryDelayMs(
      new Date("2026-08-28T12:01:00Z").toUTCString(),
      Date.parse("2026-08-28T12:00:00Z")
    )).toBe(250);
    expect(eightfoldRetryDelayMs(null)).toBe(100);
  });

  it("sends only the required Accept header and no Referer", async () => {
    const outbound: Array<{ pathname: string; headers: [string, string][] }> = [];
    const fetchMock = installFetch((url, init) => {
      outbound.push({
        pathname: url.pathname,
        headers: [...new Headers(init?.headers).entries()],
      });
      if (url.pathname === "/api/pcsx/search") {
        return jsonResponse(pcsxPage(0, []));
      }
      return jsonResponse({
        status: 200,
        data: {
          ...position(42),
          jobDescription: "<p>Build reliable systems.</p>",
        },
      });
    });

    const adapter = new EightfoldAdapter();
    await adapter.fetchJobs(SOURCE);
    await adapter.fetchJobContent(SOURCE, "42");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(outbound).toEqual([
      { pathname: "/api/pcsx/search", headers: [["accept", "application/json"]] },
      { pathname: "/api/pcsx/search", headers: [["accept", "application/json"]] },
      { pathname: "/api/pcsx/position_details", headers: [["accept", "application/json"]] },
    ]);
  });

  it("maps metadata and paginates the complete PCSX snapshot", async () => {
    const first = Array.from({ length: 10 }, (_, index) => position(index + 1));
    const fetchMock = installFetch((url) => {
      expect(url.pathname).toBe("/api/pcsx/search");
      expect(url.searchParams.get("domain")).toBe("acme.com");
      expect(url.searchParams.get("sort_by")).toBe("relevance");
      expect(url.searchParams.get("filter_include_remote")).toBe("1");
      return jsonResponse(
        Number(url.searchParams.get("start")) === 0
          ? pcsxPage(11, first)
          : pcsxPage(11, [position(11, {
            standardizedLocations: ["US"],
            locations: ["United States"],
            workLocationOption: "remote_local",
          })])
      );
    });

    const jobs = await new EightfoldAdapter().fetchJobs(SOURCE);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(jobs).toHaveLength(11);
    expect(jobs[0]).toEqual({
      externalId: "1",
      title: "Software Engineer 1",
      url: "https://acme.eightfold.ai/careers/job/1?domain=acme.com",
      location: "San Francisco, California, United States",
      department: "Engineering",
      postedAt: "2026-08-28T00:05:50.000Z",
      description: null,
      salary: null,
    });
    expect(jobs[10].location).toBe("Remote — United States");
  });

  it("keeps page fetches within the six-connection Workers limit", async () => {
    let active = 0;
    let maxActive = 0;
    const first = Array.from({ length: 10 }, (_, index) => position(index + 1));
    const fetchMock = installFetch(async (url) => {
      const start = Number(url.searchParams.get("start"));
      if (start === 0) return jsonResponse(pcsxPage(61, first));

      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      active -= 1;
      const length = start === 60 ? 1 : 10;
      return jsonResponse(pcsxPage(
        61,
        Array.from({ length }, (_, index) => position(start + index + 1))
      ));
    });

    await expect(new EightfoldAdapter().fetchJobs(SOURCE)).resolves.toHaveLength(61);
    expect(maxActive).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(14);
  });

  it("retries a PCSX snapshot after result-count drift", async () => {
    const first = Array.from({ length: 10 }, (_, index) => position(index + 1));
    let finalPageCalls = 0;
    const fetchMock = installFetch((url) => {
      if (url.searchParams.get("start") === "0") {
        return jsonResponse(pcsxPage(11, first));
      }
      finalPageCalls += 1;
      return jsonResponse(pcsxPage(
        finalPageCalls === 1 ? 10 : 11,
        [position(11)]
      ));
    });

    await expect(new EightfoldAdapter().fetchJobs(SOURCE)).resolves.toHaveLength(11);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("rejects a constant-count ID substitution and accepts a reordered equal set", async () => {
    const scans = [
      pcsxPage(2, [position(1), position(2)]),
      pcsxPage(2, [position(1), position(3)]),
      pcsxPage(2, [position(1), position(2)]),
      pcsxPage(2, [position(2), position(1)]),
    ];
    let call = 0;
    const fetchMock = installFetch(() => jsonResponse(scans[call++]));

    const jobs = await new EightfoldAdapter().fetchJobs(SOURCE);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(jobs.map((job) => job.externalId)).toEqual(["1", "2"]);
  });

  it("fails closed on duplicate IDs, truncation, and oversized boards", async () => {
    installFetch(() => jsonResponse(pcsxPage(2, [position(7), position(7)])));
    await expect(new EightfoldAdapter().fetchJobs(SOURCE))
      .rejects.toThrow("snapshot did not stabilize after 2 attempts");
    await expect(new EightfoldAdapter().fetchJobs(SOURCE))
      .rejects.toThrow("duplicate public ID 7");

    const first = Array.from({ length: 10 }, (_, index) => position(index + 1));
    installFetch((url) => jsonResponse(
      url.searchParams.get("start") === "0"
        ? pcsxPage(11, first)
        : pcsxPage(11, [])
    ));
    await expect(new EightfoldAdapter().fetchJobs(SOURCE))
      .rejects.toThrow("returned 10 of 11 expected jobs");

    installFetch(() => jsonResponse(pcsxPage(601, first)));
    await expect(new EightfoldAdapter().fetchJobs(SOURCE))
      .rejects.toThrow("600-job result cap (601)");
  });

  it("falls back only on the explicit classic-generation response", async () => {
    const classicFirst = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      name: `Engineer ${index + 1}`,
      locations: ["Los Gatos,California,United States of America"],
      department: "Engineering",
      t_update: 1_787_875_550,
    }));
    const fetchMock = installFetch((url) => {
      if (url.pathname === "/api/pcsx/search") {
        return jsonResponse({ message: "PCSX is not enabled for this user." }, 403);
      }
      expect(url.pathname).toBe("/api/apply/v2/jobs");
      const start = Number(url.searchParams.get("start"));
      return jsonResponse(start === 0
        ? { count: 10, positions: classicFirst }
        : {
            count: 11,
            positions: [{
              id: 11,
              name: "Engineer 11",
              location: "USA - Remote",
              t_update: 1_787_875_550,
              work_location_option: "onsite",
            }],
          });
    });

    const jobs = await new EightfoldAdapter().fetchJobs(SOURCE);
    expect(jobs).toHaveLength(11);
    expect(jobs[10].location).toBe("USA - Remote");
    // Each accepted classic snapshot is independently exhausted twice.
    expect(fetchMock).toHaveBeenCalledTimes(6);

    installFetch(() => jsonResponse({ message: "Forbidden" }, 403));
    await expect(new EightfoldAdapter().fetchJobs(SOURCE))
      .rejects.toThrow("Eightfold pcsx search API 403");
  });

  it("hydrates PCSX job content from the bounded detail endpoint", async () => {
    const fetchMock = installFetch((url) => {
      if (url.pathname === "/api/pcsx/search") {
        return jsonResponse(pcsxPage(0, []));
      }
      expect(url.pathname).toBe("/api/pcsx/position_details");
      expect(url.searchParams.get("position_id")).toBe("42");
      expect(url.searchParams.get("hl")).toBe("en");
      return jsonResponse({
        status: 200,
        data: {
          ...position(42, {
            locations: ["Austin, Texas, United States"],
            standardizedLocations: ["Austin, TX, US"],
          }),
          jobDescription: "<p>Salary range: $140,000 - $180,000 annually.</p>",
        },
      });
    });

    const content = await new EightfoldAdapter().fetchJobContent(
      SOURCE,
      "42",
      "https://acme.eightfold.ai/careers/job/42?domain=acme.com"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(content).toEqual({
      description: "<p>Salary range: $140,000 - $180,000 annually.</p>",
      salary: "$140,000 - $180,000",
      location: "Austin, Texas, United States",
      postedAt: "2026-08-28T00:05:50.000Z",
    });
  });

  it("hydrates classic detail after an explicit PCSX-disabled response", async () => {
    const fetchMock = installFetch((url) => {
      if (url.pathname === "/api/pcsx/search") {
        return jsonResponse({ message: "PCSX is not enabled for this user." }, 403);
      }
      expect(url.pathname).toBe("/api/apply/v2/jobs/42");
      return jsonResponse({
        id: 42,
        name: "Software Engineer",
        location: "USA - Remote",
        t_create: 1_700_000_000,
        t_update: 1_787_875_550,
        job_description: "<p>Build streaming systems.</p>",
      });
    });

    expect(await new EightfoldAdapter().fetchJobContent(SOURCE, "42"))
      .toEqual({
        description: "<p>Build streaming systems.</p>",
        salary: null,
        location: "USA - Remote",
        postedAt: "2023-11-14T22:13:20.000Z",
      });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not overwrite list metadata when detail omits its location", async () => {
    installFetch((url) => url.pathname === "/api/pcsx/search"
      ? jsonResponse(pcsxPage(0, []))
      : jsonResponse({
          status: 200,
          data: {
            id: 42,
            name: "Software Engineer",
            postedTs: 1_787_875_550,
            jobDescription: "<p>Build reliable systems.</p>",
          },
        }));

    expect(await new EightfoldAdapter().fetchJobContent(SOURCE, "42"))
      .toEqual({
        description: "<p>Build reliable systems.</p>",
        salary: null,
        location: null,
        postedAt: "2026-08-28T00:05:50.000Z",
      });
  });

  it("rejects mismatched job URLs before making a request", async () => {
    const fetchMock = installFetch(() => jsonResponse({}));
    await expect(new EightfoldAdapter().fetchJobContent(
      SOURCE,
      "42",
      "https://evil.example/careers/job/42"
    )).rejects.toThrow("does not match its configured tenant");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects list responses above the bounded body limit", async () => {
    installFetch(() => new Response("x".repeat(128 * 1024 + 1), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await expect(new EightfoldAdapter().fetchJobs(SOURCE))
      .rejects.toThrow("response exceeded 131072 bytes");
  });

  for (const status of [408, 425, 429, 503]) {
    it(`retries transient HTTP ${status} once`, async () => {
      let calls = 0;
      const fetchMock = installFetch(() => {
        calls += 1;
        return calls === 1
          ? jsonResponse({ message: "try later" }, status, { "retry-after": "0" })
          : jsonResponse(pcsxPage(0, []));
      });

      await expect(new EightfoldAdapter().fetchJobs(SOURCE)).resolves.toEqual([]);
      // One retry completes scan one; the third request is the verification scan.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  }

  it("retries a network failure once", async () => {
    let calls = 0;
    const fetchMock = installFetch(() => {
      calls += 1;
      if (calls === 1) throw new TypeError("connection reset");
      return jsonResponse(pcsxPage(0, []));
    });

    await expect(new EightfoldAdapter().fetchJobs(SOURCE)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("cancels a stalled response body at the overall read deadline", async () => {
    let cancellations = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
      },
      cancel() {
        cancellations += 1;
      },
    });
    const response = new Response(stream, {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(readBoundedEightfoldText(response, "stalled test body", 10))
      .rejects.toThrow("body did not complete within 10ms");
    expect(cancellations).toBe(1);
  });
});
