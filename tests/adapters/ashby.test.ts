import { describe, it, expect, vi, beforeEach } from "vitest";
import { AshbyAdapter } from "@worker/adapters/ashby";

const MOCK_RESPONSE = {
  data: {
    jobBoard: {
      jobPostings: [
        {
          id: "ashby-001",
          title: "Fullstack Engineer",
          locationName: "San Francisco, CA",
          departmentName: "Engineering",
          publishedDate: "2026-05-01T00:00:00.000Z",
          externalLink: "https://jobs.ashbyhq.com/cursor/ashby-001",
        },
        {
          id: "ashby-002",
          title: "ML Research Scientist",
          locationName: "Remote",
          departmentName: null,
          publishedDate: null,
          externalLink: "https://jobs.ashbyhq.com/cursor/ashby-002",
        },
      ],
    },
  },
};

const EXPECTED_GRAPHQL_BODY = {
  operationName: "ApiJobBoardWithTeams",
  variables: { organizationHostedJobsPageName: "cursor" },
  query:
    "query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) { jobPostings { id title locationName departmentName publishedDate externalLink } } }",
};

describe("AshbyAdapter", () => {
  let adapter: AshbyAdapter;

  beforeEach(() => {
    adapter = new AshbyAdapter();
    vi.resetAllMocks();
  });

  it("has the correct name", () => {
    expect(adapter.name).toBe("ashby");
  });

  it("sends a POST to the correct URL with GraphQL body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    });
    vi.stubGlobal("fetch", fetchMock);

    await adapter.fetchJobs("cursor");

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams"
    );
    expect(init.method).toBe("POST");
    expect(init.headers?.["Content-Type"]).toBe("application/json");

    const sentBody = JSON.parse(init.body);
    expect(sentBody).toEqual(EXPECTED_GRAPHQL_BODY);
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
  });

  it("maps null department and postedAt when absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    }));

    const jobs = await adapter.fetchJobs("cursor");
    expect(jobs[1].department).toBeNull();
    expect(jobs[1].postedAt).toBeNull();
  });

  it("returns [] on non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));

    const jobs = await adapter.fetchJobs("cursor");
    expect(jobs).toEqual([]);
  });

  it("returns [] on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failure")));

    const jobs = await adapter.fetchJobs("cursor");
    expect(jobs).toEqual([]);
  });
});
