import { describe, expect, test } from "bun:test";
import type { Company, FetchRun, JobReview, PollTierLatency } from "../packages/core/src/api";
import {
  ago, failingSources, flagEvidence, lastDay, needsYou, runLength, runLine, sourceProblem, sourceStatus, tierRow,
} from "../apps/native/src/features/redesign/admin/admin-facts";

const now = new Date(2026, 9, 16, 12, 0).getTime();
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

const run = (minutes: number, patch: Partial<FetchRun> = {}): FetchRun => ({
  id: String(minutes), scope: "all", status: "ok", companies_attempted: 215, companies_succeeded: 215, companies_failed: 0,
  new_jobs_found: 5, notifications_sent: 100, errors_json: null, started_at: minutesAgo(minutes), finished_at: null, duration_ms: 112_000, ...patch,
});

const company = (patch: Partial<Company> = {}): Company => ({
  id: "c", name: "Ramp", ats_type: "ashby", ats_slug: "ramp", website: "https://ramp.com", enabled: 1,
  last_poll_status: "ok", last_poll_error: null, last_polled_at: minutesAgo(4), ...patch,
});

describe("admin facts", () => {
  test("times read the way people say them", () => {
    expect(ago(minutesAgo(12), now)).toBe("12 min ago");
    expect(ago(minutesAgo(180), now)).toBe("3 hr ago");
    expect(ago(minutesAgo(60 * 30), now)).toBe("yesterday");
  });

  test("the home card counts only the last 24 hours", () => {
    expect(lastDay([run(10), run(60), run(60 * 25)], now)).toEqual({ newJobs: 10, alerts: 200, runs: 2 });
  });

  test("a run with failed sources is bad, and says how many came back", () => {
    expect(runLine(run(12, { companies_succeeded: 212, companies_failed: 3 }), now)).toEqual({ health: "bad", text: "Last run 12 min ago · 212 of 215 sources" });
    expect(runLine(run(12), now)?.health).toBe("good");
    expect(runLine(undefined, now)).toBeNull();
  });

  test("a failing source says what went wrong in a few words", () => {
    expect(sourceProblem(company({ last_poll_status: "error", last_poll_error: "404 Not Found" }))).toBe("Board moved");
    expect(sourceProblem(company({ last_poll_status: "error", last_poll_error: "Request timed out after 30000ms" }))).toBe("Timed out");
    expect(sourceProblem(company({ quarantined_at: new Date(2026, 9, 14).toISOString(), poll_failure_count: 5 }))).toBe("Paused after 5 failures · since Oct 14");
  });

  test("source rows say what's wrong, that it's off, or when it was checked", () => {
    expect(sourceStatus(company({ last_poll_status: "error", last_poll_error: "404" }), now)).toEqual({ text: "Board moved", tone: "bad" });
    expect(sourceStatus(company({ enabled: 0 }), now)).toEqual({ text: "Off", tone: "quiet" });
    expect(sourceStatus(company(), now)).toEqual({ text: "Checked 4 min ago", tone: "normal" });
    expect(failingSources([company(), company({ id: "x", last_poll_status: "error" })]).map((item) => item.id)).toEqual(["x"]);
  });

  test("Needs you leads with a verb and leaves out what's empty", () => {
    const rows = needsYou({
      failing: [company({ last_poll_status: "error", last_poll_error: "404" })],
      flagged: { total: 12 },
      feedback: [],
      reports: [],
      jevOpen: 1,
      toLabel: { count: 9, companies: ["Stripe", "Ramp", "Notion"] },
    });
    expect(rows.map((row) => row.title)).toEqual(["Fix 1 source", "Review 12 flagged jobs", "Judge 1 Jev call", "Label 9 recruiters"]);
    expect(rows[0]?.detail).toBe("Ramp · board moved");
    expect(rows[3]?.detail).toBe("Stripe, Ramp and 1 more");
  });

  test("a flagged job shows what the posting said for each reason", () => {
    const review = { reason_codes: ["ambiguous_title_level", "experience_requirement_unparsed"], evidence: { seniority: "Engineer II" }, title: "Software Engineer II" } as JobReview;
    expect(flagEvidence(review)).toEqual([["Level unclear", "Engineer II"], ["Experience unclear", "Not stated"]]);
  });

  test("tiers read as how often and the worst case, or how many are overdue", () => {
    const tier = (patch: Partial<PollTierLatency>): PollTierLatency => ({
      tier: 1, mode: "queue", target_interval_minutes: 5, sources: 60, overdue_sources: 0,
      poll_gap: { p50_minutes: 5, p95_minutes: 7, samples: 1 }, alert_delay: { p50_minutes: 4, p95_minutes: 7, samples: 1 }, estimated_p95_minutes: 7, ...patch,
    });
    expect(tierRow(tier({}))).toEqual({ label: "Every 5 minutes", value: "7 min", bad: false });
    expect(tierRow(tier({ target_interval_minutes: 120, overdue_sources: 4 }))).toEqual({ label: "Every 2 hours", value: "4 overdue", bad: true });
    expect(runLength(112_000)).toBe("1:52");
  });
});
