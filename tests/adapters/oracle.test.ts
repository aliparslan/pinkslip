import { afterEach, describe, expect, it, mock } from "bun:test";
import { normalizeOracleSource, OracleAdapter } from "@worker/adapters/oracle";
import { applicationUrl } from "@worker/apply/forms";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const SOURCE = "acme.fa.us2.oraclecloud.com/CX_1";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function board(handler: (url: string) => Response) {
  const calls: string[] = [];
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  }) as unknown as typeof fetch;
  return calls;
}

const requisition = (id: number, extra: Record<string, unknown> = {}) => ({
  Id: String(id),
  Title: ` Software Engineer ${id} `,
  PostedDate: "2026-11-01",
  PrimaryLocation: "New York, NY, United States",
  JobFamily: "Software Engineering",
  secondaryLocations: [],
  ...extra,
});

describe("normalizeOracleSource", () => {
  it("reads a host and site, or a careers page address", () => {
    expect(normalizeOracleSource(SOURCE)).toBe(SOURCE);
    expect(normalizeOracleSource("https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/requisitions"))
      .toBe("jpmc.fa.oraclecloud.com/CX_1001");
  });

  it("refuses anything that isn't an Oracle tenant", () => {
    expect(() => normalizeOracleSource("https://example.com/CX_1")).toThrow(/oraclecloud/);
    expect(() => normalizeOracleSource("acme.fa.us2.oraclecloud.com")).toThrow(/career site/);
  });
});

describe("OracleAdapter", () => {
  it("asks for the United States and reads every page", async () => {
    const calls = board((url) => {
      if (!url.includes("selectedLocationsFacet")) {
        return json({ items: [{ TotalJobsCount: 900, requisitionList: [], locationsFacet: [{ Id: 42, Name: "United States" }, { Id: 7, Name: "India" }] }] });
      }
      const offset = Number(url.match(/offset=(\d+)/)?.[1] ?? 0);
      const list = offset === 0 ? [requisition(1), requisition(2, { WorkplaceType: "Remote", secondaryLocations: [{ Name: "Austin, TX, United States" }] })] : [requisition(3 + offset)];
      return json({ items: [{ TotalJobsCount: 3 + (offset ? 0 : 0), requisitionList: list }] });
    });

    const jobs = await new OracleAdapter().fetchJobs(SOURCE);

    expect(calls[1]).toContain("selectedLocationsFacet=42");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      externalId: "1",
      title: "Software Engineer 1",
      url: "https://acme.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/1",
      location: "New York, NY, United States",
      department: "Software Engineering",
      postedAt: "2026-11-01T00:00:00.000Z",
      description: null,
    });
    expect(jobs[1]!.location).toBe("Remote - New York, NY, United States; Austin, TX, United States");
  });

  it("pages through a large board", async () => {
    const calls = board((url) => {
      if (!url.includes("selectedLocationsFacet")) return json({ items: [{ requisitionList: [], locationsFacet: [{ Id: 42, Name: "United States" }] }] });
      const offset = Number(url.match(/offset=(\d+)/)?.[1] ?? 0);
      return json({ items: [{ TotalJobsCount: 450, requisitionList: Array.from({ length: offset === 400 ? 50 : 200 }, (_, index) => requisition(offset + index)) }] });
    });
    expect(await new OracleAdapter().fetchJobs(SOURCE)).toHaveLength(450);
    expect(calls.filter((url) => url.includes("selectedLocationsFacet"))).toHaveLength(3);
  });

  it("returns nothing for a board with no US jobs", async () => {
    board(() => json({ items: [{ requisitionList: [], locationsFacet: [{ Id: 9, Name: "United Kingdom" }] }] }));
    expect(await new OracleAdapter().fetchJobs(SOURCE)).toEqual([]);
  });

  it("fails rather than report half a board as closed", async () => {
    board((url) => url.includes("selectedLocationsFacet")
      ? json({ items: [{ TotalJobsCount: 100, requisitionList: [requisition(1)] }] })
      : json({ items: [{ requisitionList: [], locationsFacet: [{ Id: 42, Name: "United States" }] }] }));
    await expect(new OracleAdapter().fetchJobs(SOURCE)).rejects.toThrow(/1 of 100/);
  });

  it("surfaces an API error", async () => {
    board(() => json({}, 503));
    await expect(new OracleAdapter().fetchJobs(SOURCE)).rejects.toThrow("Oracle API 503");
  });

  it("joins a posting's description parts and reads its pay", async () => {
    const calls = board(() => json({ items: [{
      ExternalDescriptionStr: "<p>Build systems.</p>",
      ExternalResponsibilitiesStr: "<p>Own services.</p>",
      ExternalQualificationsStr: "<p>$120,000 - $150,000</p>",
    }] }));
    const content = await new OracleAdapter().fetchJobContent(SOURCE, "77");
    expect(calls[0]).toContain("finder=ById;Id=%2277%22,siteNumber=CX_1");
    expect(content.description).toContain("Own services.");
    expect(content.salary).toContain("120,000");
  });
});

describe("applying on Oracle", () => {
  it("opens the application itself, a step past the posting", () => {
    expect(applicationUrl({ ats: "oracle", slug: "jpmc.fa.oraclecloud.com/CX_1001", externalId: "210762543" }))
      .toBe("https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210762543/apply/email");
  });
});
