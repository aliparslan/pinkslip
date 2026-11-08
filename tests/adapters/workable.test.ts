import { beforeEach, describe, expect, it, mock } from "bun:test";
import { normalizeWorkableSource, WorkableAdapter } from "@worker/adapters/workable";

const board = {
  name: "Acme",
  jobs: [
    {
      shortcode: "ABC123",
      title: " Software Engineer ",
      url: "https://apply.workable.com/j/ABC123",
      department: "Engineering",
      published_on: "2026-05-29",
      telecommuting: true,
      country: "United States",
      city: "New York",
      state: "New York",
      description: "<p>Build things. $100,000 - $120,000</p>",
      locations: [
        { country: "United States", city: "New York", region: "New York", hidden: false },
        { country: "Canada", city: "Toronto", region: "Ontario", hidden: true },
      ],
    },
    {
      shortcode: "DEF456",
      title: "Wild Card",
      telecommuting: false,
      country: "France",
      city: "Paris",
      state: "",
      locations: [],
    },
  ],
};

function stubBoard(ok = true, status = 200) {
  globalThis.fetch = mock().mockResolvedValue({
    ok,
    status,
    json: async () => board,
  }) as unknown as typeof fetch;
}

describe("WorkableAdapter", () => {
  beforeEach(() => mock.restore());

  it("normalizes account slugs and board URLs", () => {
    expect(normalizeWorkableSource("huggingface")).toBe("huggingface");
    expect(normalizeWorkableSource("https://apply.workable.com/huggingface/")).toBe("huggingface");
    expect(() => normalizeWorkableSource("https://example.com/huggingface")).toThrow();
  });

  it("maps visible locations, remote work and dates", async () => {
    stubBoard();
    const [remote, onsite] = await new WorkableAdapter().fetchJobs("acme");
    expect(remote).toEqual(expect.objectContaining({
      externalId: "ABC123",
      title: "Software Engineer",
      location: "Remote - New York, New York, United States",
      department: "Engineering",
      postedAt: "2026-05-29T00:00:00.000Z",
    }));
    expect(onsite!.location).toBe("Paris, France");
    expect(onsite!.url).toBe("https://apply.workable.com/j/DEF456");
  });

  it("fails on an error response rather than returning an empty board", async () => {
    stubBoard(false, 404);
    await expect(new WorkableAdapter().fetchJobs("acme")).rejects.toThrow("Workable API 404");
  });

  it("finds one job's content on the board", async () => {
    stubBoard();
    const content = await new WorkableAdapter().fetchJobContent("acme", "ABC123");
    expect(content.description).toContain("Build things");
    expect((await new WorkableAdapter().fetchJobContent("acme", "NOPE")).description).toBeNull();
  });
});
