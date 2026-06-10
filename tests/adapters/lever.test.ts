import { describe, it, expect, mock, beforeEach } from "bun:test";
import { LeverAdapter } from "@worker/adapters/lever";
import { stubFetchRejected, stubFetchResolved } from "../mock-fetch";

const MOCK_RESPONSE = [
  {
    id: "abc-123-def",
    text: "Software Engineer, Growth",
    categories: {
      location: "New York, NY",
      department: "Engineering",
    },
    hostedUrl: "https://jobs.lever.co/robinhood/abc-123-def",
    createdAt: 1746100800000,
  },
  {
    id: "xyz-456-ghi",
    text: "Data Scientist",
    categories: {
      location: "Remote",
      department: null,
    },
    hostedUrl: "https://jobs.lever.co/robinhood/xyz-456-ghi",
    createdAt: 1745000000000,
  },
];

describe("LeverAdapter", () => {
  let adapter: LeverAdapter;

  beforeEach(() => {
    adapter = new LeverAdapter();
    mock.restore();
  });

  it("has the correct name", () => {
    expect(adapter.name).toBe("lever");
  });

  it("fetches from the correct URL", async () => {
    const fetchMock = stubFetchResolved({
      ok: true,
      json: async () => MOCK_RESPONSE,
    });

    await adapter.fetchJobs("robinhood");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lever.co/v0/postings/robinhood?mode=json",
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it("correctly maps job fields", async () => {
    stubFetchResolved({
      ok: true,
      json: async () => MOCK_RESPONSE,
    });

    const jobs = await adapter.fetchJobs("robinhood");

    expect(jobs).toHaveLength(2);

    const first = jobs[0];
    expect(first.externalId).toBe("abc-123-def");
    expect(first.title).toBe("Software Engineer, Growth");
    expect(first.location).toBe("New York, NY");
    expect(first.department).toBe("Engineering");
    expect(first.url).toBe("https://jobs.lever.co/robinhood/abc-123-def");
    // createdAt 1746100800000 ms → ISO string
    expect(first.postedAt).toBe(new Date(1746100800000).toISOString());
  });

  it("maps null department when department is missing", async () => {
    stubFetchResolved({
      ok: true,
      json: async () => MOCK_RESPONSE,
    });

    const jobs = await adapter.fetchJobs("robinhood");
    expect(jobs[1].department).toBeNull();
  });

  it("throws on non-ok HTTP response", async () => {
    stubFetchResolved({
      ok: false,
      status: 403,
    });

    await expect(adapter.fetchJobs("unknown")).rejects.toThrow("Lever API 403");
  });

  it("throws on network error", async () => {
    stubFetchRejected(new Error("Network failure"));

    await expect(adapter.fetchJobs("robinhood")).rejects.toThrow("Network failure");
  });
});
