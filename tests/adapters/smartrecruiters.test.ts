import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  normalizeSmartRecruitersSource,
  SmartRecruitersAdapter,
} from "@worker/adapters/smartrecruiters";

function response(json: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => json };
}

function posting(id: number) {
  return {
    id: String(id),
    name: `Software Engineer ${id}`,
    releasedDate: "2026-06-01T00:00:00Z",
    location: {
      country: "us",
      remote: true,
      fullLocation: "United States",
    },
    department: { label: "Engineering" },
  };
}

describe("SmartRecruitersAdapter", () => {
  beforeEach(() => mock.restore());

  it("normalizes company identifiers and URLs", () => {
    expect(normalizeSmartRecruitersSource("acme")).toBe("acme");
    expect(normalizeSmartRecruitersSource("https://jobs.smartrecruiters.com/acme"))
      .toBe("acme");
    expect(normalizeSmartRecruitersSource(
      "https://api.smartrecruiters.com/v1/companies/acme/postings"
    )).toBe("acme");
  });

  it("paginates the US-only posting endpoint", async () => {
    const first = Array.from({ length: 100 }, (_, index) => posting(index));
    const fetchMock = mock()
      .mockResolvedValueOnce(response({
        offset: 0,
        limit: 100,
        totalFound: 101,
        content: first,
      }))
      .mockResolvedValueOnce(response({
        offset: 100,
        limit: 100,
        totalFound: 101,
        content: [posting(100)],
      }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const jobs = await new SmartRecruitersAdapter().fetchJobs("acme");

    expect(jobs).toHaveLength(101);
    expect(fetchMock.mock.calls[0][0]).toContain("country=us");
    expect(fetchMock.mock.calls[1][0]).toContain("offset=100");
    expect(jobs[0]).toEqual(expect.objectContaining({
      externalId: "0",
      location: "Remote, United States",
      department: "Engineering",
      url: "https://jobs.smartrecruiters.com/acme/0-software-engineer-0",
    }));
  });

  it("combines detail sections and extracts salary", async () => {
    globalThis.fetch = mock().mockResolvedValue(response({
      id: "123",
      name: "Software Engineer",
      releasedDate: "2026-06-01T00:00:00Z",
      location: { city: "Austin", region: "TX", country: "us" },
      jobAd: {
        sections: {
          jobDescription: { text: "<p>Build products.</p>" },
          qualifications: { text: "<p>Salary $120,000 - $160,000.</p>" },
        },
      },
    })) as unknown as typeof fetch;

    const content = await new SmartRecruitersAdapter()
      .fetchJobContent("acme", "123");

    expect(content.description).toContain("Build products");
    expect(content.description).toContain("Salary");
    expect(content.salary).toBe("$120,000 - $160,000");
    expect(content.location).toBe("Austin, TX, us");
  });
});
