import { describe, it, expect, vi, beforeEach } from "vitest";
import { AshbyAdapter } from "@worker/adapters/ashby";

const MOCK_RESPONSE = {
  jobs: [
    {
      id: "ashby-001",
      title: "Fullstack Engineer",
      location: "San Francisco, CA",
      department: "Engineering",
      publishedAt: "2026-05-01T00:00:00.000Z",
      jobUrl: "https://jobs.ashbyhq.com/cursor/ashby-001",
      applyUrl: "https://jobs.ashbyhq.com/cursor/apply/ashby-001",
      descriptionHtml: "<p>Build stuff</p>",
      compensation: {
        compensationTierSummary: "$150k - $200k",
      },
    },
    {
      id: "ashby-002",
      title: "ML Research Scientist",
      location: "Remote",
      team: "Research",
      publishedAt: null,
      jobUrl: "https://jobs.ashbyhq.com/cursor/ashby-002",
      descriptionHtml: null,
      descriptionPlain: "Compensation: $180k - $220k",
      compensation: null,
    },
  ],
  apiVersion: "1",
};

const BOARD_URL =
  "https://api.ashbyhq.com/posting-api/job-board/cursor?includeCompensation=true";

describe("AshbyAdapter", () => {
  let adapter: AshbyAdapter;

  beforeEach(() => {
    adapter = new AshbyAdapter();
    vi.resetAllMocks();
  });

  it("has the correct name", () => {
    expect(adapter.name).toBe("ashby");
  });

  it("fetches the Ashby public job board endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    });
    vi.stubGlobal("fetch", fetchMock);

    await adapter.fetchJobs("cursor");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(BOARD_URL);
  });

  it("correctly maps job fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    }));

    const jobs = await adapter.fetchJobs("cursor");

    expect(jobs).toHaveLength(2);

    const first = jobs[0];
    expect(first.externalId).toBe("ashby-001");
    expect(first.title).toBe("Fullstack Engineer");
    expect(first.location).toBe("San Francisco, CA");
    expect(first.department).toBe("Engineering");
    expect(first.url).toBe("https://jobs.ashbyhq.com/cursor/ashby-001");
    expect(first.postedAt).toBe("2026-05-01T00:00:00.000Z");
    expect(first.salary).toBe("$150k - $200k");
  });

  it("falls back to team and extracted salary when structured fields are missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    }));

    const jobs = await adapter.fetchJobs("cursor");

    expect(jobs[1].department).toBe("Research");
    expect(jobs[1].postedAt).toBeNull();
    expect(jobs[1].salary).toBe("$180k - $220k");
  });

  it("fetches job content from the same public job board endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    }));

    const content = await adapter.fetchJobContent("cursor", "ashby-001");

    expect(content).toEqual({
      description: "<p>Build stuff</p>",
      salary: "$150k - $200k",
    });
  });

  it("returns empty job content when a posting is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    }));

    const content = await adapter.fetchJobContent("cursor", "missing");
    expect(content).toEqual({ description: null, salary: null });
  });

  it("throws on non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));

    await expect(adapter.fetchJobs("cursor")).rejects.toThrow("Ashby API 500");
  });

  it("throws on unexpected payload shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    }));

    await expect(adapter.fetchJobs("cursor")).rejects.toThrow(
      "Ashby API returned an unexpected payload for cursor"
    );
  });

  it("throws on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failure")));

    await expect(adapter.fetchJobs("cursor")).rejects.toThrow("Network failure");
  });
});
