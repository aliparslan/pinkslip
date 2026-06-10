import { beforeEach, describe, expect, it, mock } from "bun:test";
import { GemAdapter, normalizeGemSource } from "@worker/adapters/gem";

function response(json: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => json };
}

const JOBS = [{
  id: 42,
  title: "Software Engineer",
  absolute_url: "https://jobs.gem.com/acme/42",
  content: "<p>Compensation is $140,000 - $180,000 annually.</p>",
  first_published_at: "2026-06-01T12:00:00Z",
  departments: [{ name: "Engineering" }],
  location: { name: "San Francisco, United States" },
}];

describe("GemAdapter", () => {
  beforeEach(() => mock.restore());

  it("normalizes slugs and public board URLs", () => {
    expect(normalizeGemSource("acme")).toBe("acme");
    expect(normalizeGemSource("https://jobs.gem.com/acme/42")).toBe("acme");
    expect(normalizeGemSource("https://api.gem.com/job_board/v0/acme/job_posts/"))
      .toBe("acme");
  });

  it("maps the complete public board payload", async () => {
    const fetchMock = mock().mockResolvedValue(response(JOBS));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const jobs = await new GemAdapter().fetchJobs("acme");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.gem.com/job_board/v0/acme/job_posts/",
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(jobs).toEqual([{
      externalId: "42",
      title: "Software Engineer",
      url: "https://jobs.gem.com/acme/42",
      location: "San Francisco, United States",
      department: "Engineering",
      postedAt: "2026-06-01T12:00:00Z",
      description: "<p>Compensation is $140,000 - $180,000 annually.</p>",
      salary: "$140,000 - $180,000",
    }]);
  });

  it("retrieves content from the same board payload", async () => {
    globalThis.fetch = mock()
      .mockResolvedValue(response(JOBS)) as unknown as typeof fetch;

    expect(await new GemAdapter().fetchJobContent("acme", "42")).toEqual({
      description: "<p>Compensation is $140,000 - $180,000 annually.</p>",
      salary: "$140,000 - $180,000",
      location: "San Francisco, United States",
      postedAt: "2026-06-01T12:00:00Z",
    });
  });
});
