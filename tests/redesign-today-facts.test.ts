import { describe, expect, test } from "bun:test";
import type { Application } from "../shared/application-stages";
import type { InboundEmail } from "../shared/email-tracking";
import { planToday } from "../apps/native/src/features/redesign/today-facts";

// Thursday, Oct 15, 2 PM where the tests run.
const now = new Date(2026, 9, 15, 14, 0);
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

const application = (patch: Partial<Application> = {}): Application => ({
  id: "a1",
  job_id: "j1",
  company_name: "Linear",
  title: "Product Engineer, Early Career",
  url: "https://linear.app/careers",
  stage: "applied",
  notes: "",
  applied_at: hoursAgo(200),
  stage_changed_at: hoursAgo(9),
  stage_date: null,
  created_at: hoursAgo(300),
  updated_at: hoursAgo(9),
  job: { location: "New York, NY", closed_at: null, company_domain: "linear.app" },
  ...patch,
});

const email = (patch: Partial<InboundEmail> = {}): InboundEmail => ({
  id: "e1",
  received_at: hoursAgo(8),
  sender_name: "Linear Recruiting",
  sender_address: "jobs@linear.app",
  subject: "Next steps",
  sent_at: hoursAgo(8),
  detected_stage: "interview",
  status: "applied",
  company_name: "Linear",
  application_id: "a1",
  candidates: [],
  ...patch,
});

describe("Today", () => {
  test("an offer and an interview with no date need you; an email that matched two asks which", () => {
    const plan = planToday([
      application({ id: "offer", company_name: "Plaid", stage: "offer", stage_date: "2026-10-20", stage_changed_at: hoursAgo(9) }),
      application({ id: "interview", company_name: "Ramp", stage: "interview", stage_changed_at: hoursAgo(1) }),
      application({ id: "dated", company_name: "Mercury", stage: "interview", stage_date: "2026-10-16T16:00:00Z" }),
    ], [email({ id: "choose", status: "needs_choice", application_id: null, company_name: "Stripe", received_at: hoursAgo(5),
      candidates: [{ id: "offer", title: "x", stage: "offer" }] })], now);
    expect(plan.needsYou.map((item) => item.headline)).toEqual(["Add the interview date", "Which application is this?", "Reply to the offer"]);
    expect(plan.needsYou[2]!.facts).toBe("Product Engineer, Early Career · by Oct 20");
    expect(plan.needsYou[1]!.target.kind).toBe("email");
  });

  test("what changed is news from email and saved postings that closed, not your own moves", () => {
    const plan = planToday([
      application({ id: "a1", company_name: "Faire", stage: "rejected" }),
      application({ id: "mine", company_name: "Brex", stage: "applied", stage_changed_at: hoursAgo(1) }),
      application({ id: "saved", company_name: "Airtable", stage: "saved", job: { location: "Remote", closed_at: hoursAgo(20), company_domain: "airtable.com" } }),
    ], [email({ detected_stage: "rejected", received_at: hoursAgo(9) })], now);
    expect(plan.changed.map((item) => [item.company, item.headline])).toEqual([["Faire", "Not moving forward"], ["Airtable", "Posting closed"]]);
    expect(plan.changed[1]!.target).toEqual({ kind: "job", id: "j1" });
  });

  test("news older than three days drops off, and a row in Needs you isn't repeated", () => {
    const plan = planToday([
      application({ id: "a1", stage: "offer" }),
      application({ id: "old", stage: "rejected" }),
    ], [
      email({ detected_stage: "offer" }),
      email({ id: "e2", application_id: "old", detected_stage: "rejected", received_at: hoursAgo(80) }),
    ], now);
    expect(plan.changed).toEqual([]);
  });

  test("coming up is the next two weeks of dated steps, soonest first", () => {
    const plan = planToday([
      application({ id: "assessment", company_name: "Duolingo", stage: "assessment", stage_date: "2026-10-19" }),
      application({ id: "interview", company_name: "Mercury", stage: "interview", stage_date: new Date(2026, 9, 16, 11, 0).toISOString() }),
      application({ id: "past", company_name: "Retool", stage: "interview", stage_date: "2026-10-14" }),
      application({ id: "far", company_name: "Notion", stage: "assessment", stage_date: "2026-11-30" }),
      application({ id: "ended", company_name: "Asana", stage: "rejected", stage_date: "2026-10-17" }),
    ], [], now);
    expect(plan.comingUp.map((item) => [item.company, item.headline, item.trailing])).toEqual([
      ["Tomorrow", "Mercury interview", "11:00 AM"],
      ["Monday", "Duolingo assessment due", "All day"],
    ]);
    expect(plan.comingUp[0]!.date).toEqual({ month: "OCT", day: "16" });
  });
});
