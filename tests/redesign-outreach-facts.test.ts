import { describe, expect, test } from "bun:test";
import type { OutreachThread } from "../shared/outreach";
import { emailRows, firstName, initials, nextFollowUp, trackerOutreachLine, unsentFirst } from "../apps/native/src/features/redesign/outreach/outreach-facts";
import { planToday } from "../apps/native/src/features/redesign/today-facts";

const now = new Date(2026, 9, 15, 14, 0);
const at = (days: number, hour = 9) => { const date = new Date(now); date.setDate(date.getDate() + days); date.setHours(hour, 0, 0, 0); return date.toISOString(); };

const thread = (patch: Partial<OutreachThread> = {}): OutreachThread => ({
  id: "t1", status: "active", job_id: "j1", job_title: "Software Engineer, New Grad", company_id: "c1", company_name: "Mercury",
  contact: { name: "Marcus Ito", email: "marcus@mercury.com", title: "Technical Recruiter", test: false },
  messages: [
    { id: "m0", step: 0, subject: "s", body: "b", status: "sent", due_at: null, sent_at: at(-3, 10) },
    { id: "m1", step: 1, subject: "", body: "", status: "scheduled", due_at: at(2), sent_at: null },
    { id: "m2", step: 2, subject: "", body: "", status: "scheduled", due_at: at(9), sent_at: null },
  ],
  created_at: at(-4), updated_at: at(-3), ...patch,
});

describe("Outreach", () => {
  test("a person reads by initials and first name", () => {
    expect(initials("Dana Whitfield")).toBe("DW");
    expect(firstName("Dana Whitfield")).toBe("Dana");
  });

  test("the emails: sent first, then the planned follow-ups", () => {
    const rows = emailRows(thread(), now);
    expect(rows.map((row) => [row.label, row.sent])).toEqual([["Sent", true], ["Follow-up", false], ["Last follow-up", false]]);
    expect(rows[0]!.detail).toBe("Software Engineer, New Grad");
    expect(rows[1]!.when).toBe("Sat, Oct 17");
  });

  test("Tracker's line names who you emailed and the next follow-up", () => {
    expect(trackerOutreachLine(thread(), now)).toBe("Emailed Marcus Ito · follow-up Oct 17");
    expect(trackerOutreachLine(thread({ status: "replied" }), now)).toBe("Marcus Ito replied");
    expect(trackerOutreachLine(thread({ status: "draft" }), now)).toBeNull();
  });

  test("the first email waits until sent; follow-ups stop with the thread", () => {
    expect(unsentFirst(thread({ messages: [{ id: "d", step: 0, subject: "", body: "", status: "draft", due_at: null, sent_at: null }] }))?.id).toBe("d");
    expect(nextFollowUp(thread({ status: "stopped" }))).toBeUndefined();
  });

  test("Today: a due follow-up needs you; a planned one is coming up", () => {
    const due = thread({ messages: [
      { id: "m0", step: 0, subject: "s", body: "b", status: "sent", due_at: null, sent_at: at(-3, 10) },
      { id: "m1", step: 1, subject: "", body: "", status: "scheduled", due_at: at(0, 9), sent_at: null },
    ] });
    const plan = planToday([], [], now, [due, thread({ id: "t2", contact: { name: "Dana Whitfield", email: "d@s.com", title: "", test: false } })]);
    expect(plan.needsYou.map((item) => item.headline)).toEqual(["Follow up with Marcus Ito"]);
    expect(plan.needsYou[0]!.facts).toBe("No reply since Oct 12 · the note is ready");
    expect(plan.comingUp.map((item) => [item.company, item.headline])).toEqual([["Saturday", "Follow up with Dana Whitfield"]]);
  });
});
