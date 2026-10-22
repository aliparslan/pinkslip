import { describe, expect, test } from "bun:test";
import type { Company, FetchRun, JobReview, PollTierLatency, RecruiterCandidate } from "../packages/core/src/api";
import {
  ago, companySearchLine, exampleName, failingSources, flagEvidence, formatEvidence, lastDay, needsYou, recruiterEmail, recruiterFacts, recruiterQueue,
  recruiterTally, runLength, runLine, sourceProblem, sourceStatus, tierRow, writeAddress,
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

describe("recruiters", () => {
  const person = (id: string, patch: Partial<RecruiterCandidate> = {}): RecruiterCandidate => ({
    id, company_id: "stripe", company: "Stripe", profile_url: "", name: id, headline: "Recruiter at Stripe", current_title: "University Recruiter",
    current_employer: "Stripe", location: null, kind: "early_career", kind_from_snippet: false, employer_evidence: "current employer",
    left_out_reason: null, email_guess: null, email_confidence: null, works_there: null, actual_role: null, reviewed_at: null, ...patch,
  });

  test("the queue is the kept, then left-out people worth a second look, until both questions are answered", () => {
    const queue = recruiterQueue([
      person("left", { left_out_reason: "company not confirmed" }),
      person("based abroad", { left_out_reason: "based outside the US" }),
      person("half", { works_there: "yes" }),
      person("done", { works_there: "yes", actual_role: "early_career" }),
      person("kept"),
    ]);
    expect(queue.map((row) => row.id)).toEqual(["half", "kept", "left"]);
  });

  test("Skip sends someone to the back, and a namesake's people get a second look", () => {
    const rows = [person("a"), person("b"), person("c"), person("weave", { left_out_reason: "may work at another Weave" })];
    expect(recruiterQueue(rows).map((row) => row.id)).toEqual(["a", "b", "c", "weave"]);
    expect(recruiterQueue(rows, ["a"]).map((row) => row.id)).toEqual(["b", "c", "weave", "a"]);
    expect(recruiterQueue(rows, ["a", "c", "gone"]).map((row) => row.id)).toEqual(["b", "weave", "a", "c"]);
  });

  test("facts say how the search read them, with where they are", () => {
    expect(recruiterFacts(person("a", { kind: "technical", kind_from_snippet: true, location: "Seattle", email_guess: "a@stripe.com" }))).toEqual([
      ["Title", "University Recruiter"], ["Location", "Seattle"], ["Kept as", "Technical recruiter, from their summary"],
    ]);
    expect(recruiterFacts(person("b", { left_out_reason: "not a recruiter" }))[1]).toEqual(["Left out", "Not a recruiter"]);
  });

  test("the email row warns when the address isn't at the company's site", () => {
    const stripe = { site: "stripe.com", pattern_source: "pages" as const };
    expect(recruiterEmail(person("a", { email_guess: "dana.kim@stripe.com", email_confidence: "format likely" }), stripe))
      .toEqual({ detail: "dana.kim@stripe.com · format likely", warning: null });
    expect(recruiterEmail(person("b", { email_guess: "dana@mail.stripe.com" }), stripe).warning).toBeNull();
    expect(recruiterEmail(person("c", { company: "Weave", email_guess: "jordan@weaveinc.org" }), { site: "weaveos.com", pattern_source: "pages" }).warning)
      .toBe("Not at weaveos.com: maybe another Weave.");
    // Your own format is trusted, even at another domain (Notion's mail is at makenotion.com).
    expect(recruiterEmail(person("d", { email_guess: "dkim@makenotion.com" }), { site: "notion.so", pattern_source: "owner" }).warning).toBeNull();
    expect(recruiterEmail(person("e", { email_confidence: "no pattern found" }), stripe)).toEqual({ detail: "no pattern found", warning: null });
  });

  test("choosing companies and setting a format read plainly", () => {
    expect(companySearchLine({ searched_at: null, kept: 0, pattern: null })).toBe("Not searched yet");
    expect(companySearchLine({ searched_at: null, kept: 0, pattern: "{first}.{last}" })).toBe("Not searched yet · first.last@");
    expect(companySearchLine({ searched_at: "2026-10-14T10:00:00.000Z", kept: 5, pattern: "{f}{last}" })).toBe("Searched Oct 14 · 5 kept · flast@");
    expect(companySearchLine({ searched_at: "2026-10-14T10:00:00.000Z", kept: 1, pattern: null })).toBe("Searched Oct 14 · 1 kept · no format yet");
    const dana = exampleName("Dana Whitfield");
    expect(dana).toEqual({ first: "Dana", last: "Whitfield" });
    expect(["{first}.{last}", "{first}", "{f}{last}", "{first}{l}"].map((template) => writeAddress(template, dana)))
      .toEqual(["dana.whitfield", "dana", "dwhitfield", "danaw"]);
    expect(formatEvidence(undefined)).toBeNull();
    expect(formatEvidence({
      company_id: "weave", company: "Weave", site: "weaveos.com", mail_domain: "weaveos.com", mail_domain_source: "website", pattern: "{first}.{last}",
      pattern_votes: 1, pattern_sources: 3, pattern_source: "pages", linkedin_slug: "weave-dev", linkedin_name: "Weave", name_shared: true,
      github_org: "weave", github_pattern: "{first}", github_votes: 3, github_total: 4, error: null, ran_at: "2026-10-19T00:00:00Z",
    })).toBe("GitHub: 3 of 4 addresses are first. Format pages: first.last, 1 of 3. Another company is called Weave too.");
  });

  test("the tally is one sentence", () => {
    expect(recruiterTally(undefined)).toBe("Label a few to see how the search is doing.");
    expect(recruiterTally({ works_there: { yes: 21, labelled: 24 }, role: { right: 17, labelled: 21 }, early_career: { right: 6, labelled: 7 }, wrongly_left_out: 1, left_out_labelled: 5 }))
      .toBe("So far: 21 of 24 work there now, kind right 17 of 21, early-career right 6 of 7, 1 of 5 wrongly left out.");
  });
});
