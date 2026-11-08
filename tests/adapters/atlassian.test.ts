import { beforeEach, describe, expect, it, mock } from "bun:test";
import { AtlassianAdapter, normalizeAtlassianSource } from "@worker/adapters/atlassian";

const listings = [
  {
    id: 26070,
    title: " Software Engineer, 2027 Graduate U.S. ",
    locations: [
      "San Francisco - United States -   San Francisco, California 94104 United States",
      "Mountain View - United States or Remote -   Mountain View, California 94041 United States",
    ],
    category: "Graduates",
    overview: "<p>Working at Atlassian</p>",
    responsibilities: "<p>Build things</p>",
    qualifications: "<p>Currently enrolled in a Bachelors program</p>",
    portalJobPost: { updatedDate: "2026-10-30 04:03 PM" },
  },
  {
    id: 27339,
    title: "Account Executive",
    locations: ["Remote - UK - Remote", "Remote - Remote", "Canada -     Canada"],
    category: "Sales",
    overview: "",
    responsibilities: "",
    qualifications: "",
    portalJobPost: { updatedDate: "not a date" },
  },
];

function stub(body: unknown = listings, ok = true, status = 200) {
  globalThis.fetch = mock().mockResolvedValue({ ok, status, json: async () => body }) as unknown as typeof fetch;
}

describe("AtlassianAdapter", () => {
  beforeEach(() => mock.restore());

  it("accepts its name or careers URL only", () => {
    expect(normalizeAtlassianSource("Atlassian")).toBe("atlassian");
    expect(normalizeAtlassianSource("https://www.atlassian.com/company/careers/all-jobs")).toBe("atlassian");
    expect(() => normalizeAtlassianSource("https://example.com/careers")).toThrow();
    expect(() => normalizeAtlassianSource("stripe")).toThrow();
  });

  it("sends a user agent, without which Atlassian answers 403", async () => {
    stub();
    await new AtlassianAdapter().fetchJobs("atlassian");
    const [, init] = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("user-agent")).toContain("Pinkslip");
  });

  it("maps listings, tidying places and combining the description", async () => {
    stub();
    const [graduate, sales] = await new AtlassianAdapter().fetchJobs("atlassian");
    expect(graduate).toEqual(expect.objectContaining({
      externalId: "26070",
      title: "Software Engineer, 2027 Graduate U.S.",
      url: "https://www.atlassian.com/company/careers/details/26070",
      location: "San Francisco, United States / Mountain View, United States",
      department: "Graduates",
      postedAt: "2026-10-30T16:03:00.000Z",
    }));
    expect(graduate!.description).toContain("<h3>Requirements</h3>");
    expect(sales).toEqual(expect.objectContaining({
      location: "Remote - UK / Canada",
      postedAt: null,
      description: null,
    }));
  });

  it("keeps one copy of a role listed on two portals", async () => {
    stub([listings[0], { ...listings[0] }, listings[1]]);
    const jobs = await new AtlassianAdapter().fetchJobs("atlassian");
    expect(jobs.map((job) => job.externalId)).toEqual(["26070", "27339"]);
  });

  it("fails rather than returning an empty board", async () => {
    stub(listings, false, 503);
    await expect(new AtlassianAdapter().fetchJobs("atlassian")).rejects.toThrow("Atlassian listings 503");
    stub({ jobs: [] });
    await expect(new AtlassianAdapter().fetchJobs("atlassian")).rejects.toThrow("unexpected payload");
  });

  it("finds one job's content", async () => {
    stub();
    const content = await new AtlassianAdapter().fetchJobContent("atlassian", "26070");
    expect(content.description).toContain("Build things");
    expect((await new AtlassianAdapter().fetchJobContent("atlassian", "1")).description).toBeNull();
  });
});
