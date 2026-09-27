import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  TeslaAdapter,
  mapTeslaJobDetail,
  normalizeTeslaSource,
  parseTeslaState,
  readBoundedTeslaJson,
  teslaRetryDelayMs,
  teslaTitleSlug,
} from "@worker/adapters/tesla";

const originalFetch = globalThis.fetch;
const ORIGIN = "https://www.tesla.com";

function statePayload(overrides: Record<string, unknown> = {}) {
  return {
    listings: [
      {
        id: "221961",
        t: "Software Engineer, Generalist, AI Inference",
        dp: "10",
        l: "100",
        y: 1,
        pb: "2026-08-29",
      },
      {
        id: "222222",
        t: "Software Engineer, Charging",
        dp: "20",
        l: "200",
        y: 1,
        pb: "2026-08-28T17:30:05-07:00",
      },
      {
        id: "333333",
        t: "Software Engineering Intern",
        dp: "20",
        l: "101",
        y: 2,
        pb: "2026-08-27",
      },
    ],
    lookup: {
      departments: {
        "10": "Tesla AI",
        "20": "Vehicle Software",
      },
      locations: {
        "100": "Palo Alto, California",
        "101": "Austin, Texas",
        "200": "Toronto, Ontario",
      },
      types: {
        "1": "fulltime",
        "2": "intern",
      },
      regions: { "1": "North America" },
      sites: { US: "United States of America", CA: "Canada" },
    },
    departments: { "10": true, "20": true },
    geo: [{
      id: "1",
      sites: [
        {
          id: "US",
          states: [
            { id: "CA", name: "California", cities: { "Palo Alto": ["100"] } },
            { id: "TX", name: "Texas", cities: { Austin: "101" } },
          ],
        },
        {
          id: "CA",
          cities: { Toronto: ["200"] },
        },
      ],
    }],
    ...overrides,
  };
}

function detailPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "221961",
    title: "Software Engineer, Generalist, AI Inference",
    url: "/careers/search/job/software-engineer-generalist-ai-inference-221961",
    location: "Palo Alto, California",
    department: "Tesla AI",
    timeType: "Full-time",
    country: "US",
    datePosted: "2026-08-29T10:15:30-07:00",
    jobDescription: "<p>Build reliable AI inference software.</p>",
    jobResponsibilities: "<ul><li>Ship production systems.</li></ul>",
    jobRequirements: "<ul><li>Bachelor's or master's degree.</li></ul>",
    jobCompensationAndBenefits:
      "<p>Expected compensation is $120,000 - $180,000 per year plus benefits.</p>",
    postUntilDate: "2026-09-30",
    ...overrides,
  };
}

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
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

describe("TeslaAdapter", () => {
  let adapter: TeslaAdapter;

  beforeEach(() => {
    adapter = new TeslaAdapter();
    mock.restore();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  it("normalizes only the canonical token and official careers search URLs", () => {
    expect(normalizeTeslaSource("tesla")).toBe("tesla");
    expect(normalizeTeslaSource(" TESLA ")).toBe("tesla");
    expect(normalizeTeslaSource(
      "https://www.tesla.com/careers/search/?site=US&type=fulltime"
    )).toBe("tesla");
    expect(normalizeTeslaSource(
      "https://tesla.com/careers/search/job/software-engineer-221961"
    )).toBe("tesla");

    expect(() => normalizeTeslaSource(""))
      .toThrow("Tesla source is required");
    expect(() => normalizeTeslaSource("tesla-careers"))
      .toThrow('must be "tesla"');
    expect(() => normalizeTeslaSource("http://www.tesla.com/careers/search/"))
      .toThrow("official HTTPS careers search path");
    expect(() => normalizeTeslaSource("https://tesla.com.example/careers/search/"))
      .toThrow("official HTTPS careers search path");
    expect(() => normalizeTeslaSource("https://www.tesla.com/support"))
      .toThrow("official HTTPS careers search path");
    expect(() => normalizeTeslaSource("https://user@www.tesla.com/careers/search/"))
      .toThrow("official HTTPS careers search path");
  });

  it("matches Tesla's public slug algorithm", () => {
    expect(teslaTitleSlug("Software Engineer, AI Platform / Vehicle Software"))
      .toBe("software-engineer-ai-platform-vehicle-software");
    expect(teslaTitleSlug("Software Engineer - "))
      .toBe("software-engineer-");
  });

  it("maps US full-time and internship postings without admitting other employment types", () => {
    expect(parseTeslaState(statePayload())).toEqual([
      {
        externalId: "221961",
        title: "Software Engineer, Generalist, AI Inference",
        url: `${ORIGIN}/careers/search/job/software-engineer-generalist-ai-inference-221961`,
        location: "Palo Alto, California",
        department: "Tesla AI",
        postedAt: "2026-08-29T00:00:00.000Z",
        description: null,
        salary: null,
      },
      {
        externalId: "333333",
        title: "Software Engineering Intern",
        url: `${ORIGIN}/careers/search/job/software-engineering-intern-333333`,
        location: "Austin, Texas",
        department: "Vehicle Software",
        postedAt: "2026-08-27T00:00:00.000Z",
        description: null,
        salary: null,
      },
    ]);

    const base = statePayload();
    const withContract = statePayload({
      listings: [
        ...base.listings,
        {
          id: "444444",
          t: "Contract Software Engineer",
          dp: "20",
          l: "101",
          y: 3,
          pb: "2026-08-27",
        },
      ],
      lookup: {
        ...base.lookup,
        types: { ...base.lookup.types, "3": "Contract" },
      },
    });
    expect(parseTeslaState(withContract).map((job) => job.externalId)).toEqual([
      "221961",
      "333333",
    ]);
  });

  it("accepts Tesla's country-level city shape and preserves a missing posted date", () => {
    const payload = statePayload({
      listings: [{
        id: 444444,
        t: "Firmware Engineer",
        dp: 20,
        l: 101,
        y: "1",
      }],
      geo: [{
        id: "1",
        sites: [{ id: "US", cities: { Austin: [101] } }],
      }],
    });
    expect(parseTeslaState(payload)).toEqual([expect.objectContaining({
      externalId: "444444",
      location: "Austin, Texas",
      department: "Vehicle Software",
      postedAt: null,
    })]);
  });

  it("fetches Tesla's atomic state with an identifiable bounded request", async () => {
    const fetchMock = installFetch((url, init) => {
      expect(url.toString()).toBe(`${ORIGIN}/cua-api/apps/careers/state`);
      const headers = new Headers(init?.headers);
      expect(headers.get("accept")).toBe("application/json, text/plain, */*");
      expect(headers.get("referer")).toBe(`${ORIGIN}/careers/search/`);
      expect(headers.get("user-agent")).toContain("Chrome/139.0.0.0");
      expect(headers.get("sec-fetch-site")).toBe("same-origin");
      expect(headers.get("sec-fetch-mode")).toBe("cors");
      expect(headers.get("sec-fetch-dest")).toBe("empty");
      return jsonResponse(statePayload());
    });

    expect(adapter.name).toBe("tesla");
    expect(await adapter.fetchJobs("tesla")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed or suspiciously incomplete state snapshots", () => {
    expect(() => parseTeslaState({})).toThrow("missing listings");
    expect(() => parseTeslaState(statePayload({ listings: [] })))
      .toThrow("empty global listing snapshot");
    expect(() => parseTeslaState(statePayload({
      listings: [
        statePayload().listings[0],
        statePayload().listings[0],
      ],
    }))).toThrow("repeated requisition ID 221961");
    expect(() => parseTeslaState(statePayload({
      listings: [{
        ...statePayload().listings[0] as Record<string, unknown>,
        pb: "08/29/2026",
      }],
    }))).toThrow("invalid posted date");
    expect(() => parseTeslaState(statePayload({
      listings: [{
        ...statePayload().listings[0] as Record<string, unknown>,
        dp: "999",
      }],
    }))).toThrow("unknown department 999");
    expect(() => parseTeslaState(statePayload({
      listings: [statePayload().listings[1]],
    }))).toThrow("empty eligible US snapshot");
  });

  it("hydrates the official detail fields without mistaking the close date for posting time", async () => {
    const fetchMock = installFetch((url) => {
      expect(url.toString()).toBe(`${ORIGIN}/cua-api/careers/job/221961`);
      return jsonResponse(detailPayload());
    });
    const content = await adapter.fetchJobContent(
      "tesla",
      "221961",
      `${ORIGIN}/careers/search/job/software-engineer-generalist-ai-inference-221961`
    );

    expect(content.location).toBe("Palo Alto, California");
    expect(content.postedAt).toBe("2026-08-29T17:15:30.000Z");
    expect(content.description).toContain("Build reliable AI inference software");
    expect(content.description).toContain("<h2>What you’ll do</h2>");
    expect(content.description).toContain("<h2>What you’ll bring</h2>");
    expect(content.description).toContain("Bachelor's or master's degree");
    expect(content.description).toContain("Compensation and benefits");
    expect(content.salary).toBe("$120,000 - $180,000");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const withoutPostedDate = mapTeslaJobDetail(detailPayload({
      datePosted: undefined,
      postUntilDate: "2026-10-31",
    }), "221961");
    expect(withoutPostedDate.postedAt).toBeNull();
  });

  it("uses Tesla's legacy description field when split sections are absent", () => {
    const listing = mapTeslaJobDetail(detailPayload({
      jobDescription: null,
      jobResponsibilities: null,
      jobRequirements: null,
      jobCompensationAndBenefits: null,
      description: "<p>Build embedded vehicle software.</p>",
    }), "221961");
    expect(listing.description).toBe("<p>Build embedded vehicle software.</p>");
    expect(listing.salary).toBeNull();
  });

  it("validates detail identity, scope, canonical URL, and required content", () => {
    expect(() => mapTeslaJobDetail(detailPayload({ id: "999999" }), "221961"))
      .toThrow("did not match requisition ID 221961");
    expect(mapTeslaJobDetail(
      detailPayload({ timeType: "Intern/Apprentice" }),
      "221961"
    ).externalId).toBe("221961");
    expect(() => mapTeslaJobDetail(detailPayload({ timeType: "Part-time" }), "221961"))
      .toThrow("escaped the employment-type filter");
    expect(() => mapTeslaJobDetail(detailPayload({ country: "CA" }), "221961"))
      .toThrow("escaped the US filter");
    expect(() => mapTeslaJobDetail(detailPayload({
      url: "/careers/search/job/software-engineer-generalist-ai-inference-999999",
    }), "221961")).toThrow("did not match requisition ID 221961");
    expect(() => mapTeslaJobDetail(detailPayload({
      url: "https://evil.example/careers/search/job/software-engineer-generalist-ai-inference-221961",
    }), "221961")).toThrow("did not match requisition ID 221961");
    expect(() => mapTeslaJobDetail(detailPayload({
      jobDescription: null,
      jobResponsibilities: null,
      jobRequirements: null,
      jobCompensationAndBenefits: null,
    }), "221961")).toThrow("returned no description");
    expect(() => mapTeslaJobDetail(detailPayload({
      pb: "2026-08-28",
    }), "221961")).toThrow("conflicting posted dates");
  });

  it("represents removed jobs safely and rejects unsafe content requests", async () => {
    const fetchMock = installFetch(() => jsonResponse(
      { message: "This job is no longer available" },
      { status: 404 }
    ));
    expect(await adapter.fetchJobContent("tesla", "221961")).toEqual({
      description: null,
      salary: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(adapter.fetchJobContent("tesla", "221961/../../bad"))
      .rejects.toThrow("unsafe requisition ID");
    await expect(adapter.fetchJobContent(
      "tesla",
      "221961",
      `${ORIGIN}/careers/search/job/software-engineer-999999`
    )).rejects.toThrow("did not match requisition ID 221961");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient responses but never retries a definitive access denial", async () => {
    let calls = 0;
    const retryFetch = installFetch(() => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ error: "busy" }, {
            status: 503,
            headers: { "retry-after": "0" },
          })
        : jsonResponse(statePayload());
    });
    expect(await adapter.fetchJobs("tesla")).toHaveLength(2);
    expect(retryFetch).toHaveBeenCalledTimes(2);

    const deniedFetch = installFetch(() => new Response("denied", {
      status: 403,
      headers: { "content-type": "text/html" },
    }));
    await expect(adapter.fetchJobs("tesla"))
      .rejects.toThrow("state API 403");
    expect(deniedFetch).toHaveBeenCalledTimes(1);
  });

  it("caps retry delays from seconds, dates, and exponential fallback", () => {
    const now = Date.parse("2026-08-30T12:00:00.000Z");
    expect(teslaRetryDelayMs("1.5", 1, now)).toBe(1_500);
    expect(teslaRetryDelayMs("Sun, 30 Aug 2026 12:00:02 GMT", 1, now))
      .toBe(2_000);
    expect(teslaRetryDelayMs(null, 1, now)).toBe(250);
    expect(teslaRetryDelayMs(null, 3, now)).toBe(1_000);
    expect(teslaRetryDelayMs("999", 1, now)).toBe(5_000);
  });

  it("bounds and validates JSON response bodies", async () => {
    await expect(readBoundedTeslaJson(new Response("{}", {
      headers: {
        "content-type": "application/json",
        "content-length": "100",
      },
    }), "test", 10)).rejects.toThrow("exceeded 10 bytes");

    await expect(readBoundedTeslaJson(new Response("<html></html>", {
      headers: { "content-type": "text/html" },
    }), "test", 100)).rejects.toThrow("returned text/html");

    await expect(readBoundedTeslaJson(new Response("not-json", {
      headers: { "content-type": "application/json" },
    }), "test", 100)).rejects.toThrow("invalid JSON");

    await expect(readBoundedTeslaJson(new Response(JSON.stringify({
      value: "a".repeat(100),
    }), {
      headers: { "content-type": "application/problem+json" },
    }), "test", 20)).rejects.toThrow("exceeded 20 bytes");
  });
});
