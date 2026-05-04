import { describe, it, expect, vi, beforeEach } from "vitest";
import { GreenhouseAdapter } from "@worker/adapters/greenhouse";

const MOCK_RESPONSE = {
  jobs: [
    {
      id: 4567890,
      title: "Software Engineer, Backend",
      location: { name: "San Francisco, CA" },
      departments: [{ name: "Engineering" }],
      absolute_url: "https://boards.greenhouse.io/anthropic/jobs/4567890",
      updated_at: "2026-05-01T12:00:00Z",
    },
    {
      id: 9999999,
      title: "Product Designer",
      location: { name: "Remote" },
      departments: [],
      absolute_url: "https://boards.greenhouse.io/anthropic/jobs/9999999",
      updated_at: "2026-04-20T08:00:00Z",
    },
  ],
};

describe("GreenhouseAdapter", () => {
  let adapter: GreenhouseAdapter;

  beforeEach(() => {
    adapter = new GreenhouseAdapter();
    vi.resetAllMocks();
  });

  it("has the correct name", () => {
    expect(adapter.name).toBe("greenhouse");
  });

  it("fetches from the correct URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    });
    vi.stubGlobal("fetch", fetchMock);

    await adapter.fetchJobs("anthropic");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true"
    );
  });

  it("correctly maps job fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    }));

    const jobs = await adapter.fetchJobs("anthropic");

    expect(jobs).toHaveLength(2);

    const first = jobs[0];
    expect(first.externalId).toBe("4567890");
    expect(first.title).toBe("Software Engineer, Backend");
    expect(first.location).toBe("San Francisco, CA");
    expect(first.department).toBe("Engineering");
    expect(first.url).toBe("https://boards.greenhouse.io/anthropic/jobs/4567890");
    expect(first.postedAt).toBe("2026-05-01T12:00:00Z");
  });

  it("maps null department when departments array is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    }));

    const jobs = await adapter.fetchJobs("anthropic");
    expect(jobs[1].department).toBeNull();
  });

  it("throws on non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }));

    await expect(adapter.fetchJobs("unknown-company")).rejects.toThrow("Greenhouse API 404");
  });

  it("throws on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failure")));

    await expect(adapter.fetchJobs("anthropic")).rejects.toThrow("Network failure");
  });
});
