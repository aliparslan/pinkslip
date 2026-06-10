import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  normalizeRipplingSource,
  RipplingAdapter,
} from "@worker/adapters/rippling";

function jsonResponse(json: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => json };
}

function textResponse(text: string, ok = true, status = 200) {
  return { ok, status, text: async () => text };
}

function posting(id: string) {
  return {
    id,
    name: "Software Engineer",
    url: `https://ats.rippling.com/acme/jobs/${id}`,
    department: { name: "Engineering" },
    locations: [{
      name: "United States",
      country: "United States",
      countryCode: "US",
      workplaceType: "REMOTE",
    }],
  };
}

describe("RipplingAdapter", () => {
  beforeEach(() => mock.restore());

  it("normalizes board slugs and URLs", () => {
    expect(normalizeRipplingSource("acme")).toBe("acme");
    expect(normalizeRipplingSource("https://ats.rippling.com/acme/jobs"))
      .toBe("acme");
    expect(normalizeRipplingSource("https://ats.rippling.com/acme/jobs/123"))
      .toBe("acme");
  });

  it("paginates complete board snapshots", async () => {
    const fetchMock = mock()
      .mockResolvedValueOnce(jsonResponse({
        items: [posting("one")],
        page: 0,
        pageSize: 1000,
        totalItems: 2,
        totalPages: 2,
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [posting("two")],
        page: 1,
        pageSize: 1000,
        totalItems: 2,
        totalPages: 2,
      }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const jobs = await new RipplingAdapter().fetchJobs("acme");

    expect(jobs).toHaveLength(2);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/v2/board/acme/jobs");
    expect(fetchMock.mock.calls[0][0]).toContain("pageSize=1000");
    expect(fetchMock.mock.calls[1][0]).toContain("page=1");
    expect(jobs[0]).toEqual(expect.objectContaining({
      externalId: "one",
      location: "Remote, United States",
      department: "Engineering",
    }));
  });

  it("parses structured detail content from Next data", async () => {
    const payload = {
      props: {
        pageProps: {
          apiData: {
            jobPost: {
              uuid: "one",
              description: {
                company: "<p>Acme builds tools.</p>",
                role: "<p>Salary is $150,000 - $190,000.</p>",
              },
              workLocations: ["New York, NY"],
              createdOn: "2026-06-01T12:00:00Z",
            },
          },
        },
      },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>`;
    globalThis.fetch = mock()
      .mockResolvedValue(textResponse(html)) as unknown as typeof fetch;

    const content = await new RipplingAdapter().fetchJobContent(
      "acme",
      "one",
      "https://ats.rippling.com/acme/jobs/one"
    );

    expect(content.description).toContain("Acme builds tools");
    expect(content.salary).toBe("$150,000 - $190,000");
    expect(content.location).toBe("New York, NY");
    expect(content.postedAt).toBe("2026-06-01T12:00:00Z");
  });

  it("rejects incomplete board snapshots", async () => {
    globalThis.fetch = mock().mockResolvedValue(jsonResponse({
      items: [posting("one")],
      page: 0,
      pageSize: 1000,
      totalItems: 2,
      totalPages: 1,
    })) as unknown as typeof fetch;

    await expect(new RipplingAdapter().fetchJobs("acme"))
      .rejects.toThrow("1 of 2 expected jobs");
  });
});
