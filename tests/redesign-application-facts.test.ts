import { describe, expect, test } from "bun:test";
import type { ApplicationDetail, ApplicationEvent } from "../shared/application-stages";
import {
  daysSinceApplied, nextRowFacts, sentStub, stageDateToSend, stageDateValue, stubStamps,
} from "../apps/native/src/features/redesign/application-facts";

const event = (stage: ApplicationEvent["stage"], occurred_at: string, email?: { id: string; subject: string }): ApplicationEvent => ({
  id: `${stage}-${occurred_at}`, stage, occurred_at,
  source: email ? "email" : "user",
  inbound_email_id: email?.id ?? null,
  email_subject: email?.subject ?? null,
});

const detail = (events: ApplicationEvent[], patch: Partial<ApplicationDetail> = {}): ApplicationDetail => ({
  id: "a1", job_id: "j1", company_name: "Mercury", title: "Software Engineer, New Grad", url: "",
  stage: events.at(-1)?.stage ?? "applied", notes: "",
  applied_at: "2026-09-28T15:00:00", stage_changed_at: "2026-10-12T15:00:00", stage_date: null,
  created_at: "2026-09-26T15:00:00", updated_at: "2026-10-12T15:00:00", job: null,
  events, ...patch,
});

describe("the application's stub", () => {
  test("stamps each step after Saved, marking the ones an email made", () => {
    const stamps = stubStamps(detail([
      event("saved", "2026-09-26T15:00:00"),
      event("applied", "2026-09-28T15:00:00"),
      event("interview", "2026-10-12T09:00:00", { id: "mail", subject: "Next steps with Mercury" }),
    ]));
    expect(stamps.map((stamp) => [stamp.label, stamp.date, stamp.email?.subject ?? null])).toEqual([
      ["APPLIED", "SEP 28", null],
      ["INTERVIEWING", "OCT 12", "Next steps with Mercury"],
    ]);
  });

  test("moving back drops what came after, and old applications get one stamp", () => {
    const back = stubStamps(detail([
      event("applied", "2026-09-28T15:00:00"),
      event("offer", "2026-10-01T15:00:00"),
      event("applied", "2026-10-01T15:05:00"),
      event("interview", "2026-10-12T15:00:00"),
    ]));
    expect(back.map((stamp) => stamp.label)).toEqual(["APPLIED", "INTERVIEWING"]);
    expect(back[0]!.date).toBe("OCT 1");
    expect(stubStamps(detail([], { stage: "applied" })).map((stamp) => stamp.label)).toEqual(["APPLIED"]);
  });
});

describe("the stage's date", () => {
  const now = new Date(2026, 9, 13, 9, 0); // Tuesday, Oct 13

  test("a day stays that day where you are; a time is an instant", () => {
    expect(stageDateValue("2026-10-15").getDate()).toBe(15);
    expect(stageDateToSend(new Date(2026, 9, 15, 11, 0), false)).toBe("2026-10-15");
    expect(stageDateToSend(new Date(2026, 9, 15, 11, 0), true)).toBe(new Date(2026, 9, 15, 11, 0).toISOString());
  });

  test("the Next row says the day the way you'd say it", () => {
    expect(nextRowFacts(new Date(2026, 9, 15, 11, 0).toISOString(), now)).toEqual({ month: "OCT", day: "15", when: "Thursday", time: "11:00 AM" });
    expect(nextRowFacts("2026-10-13", now)).toMatchObject({ when: "Today", time: null });
    expect(nextRowFacts("2026-10-14", now).when).toBe("Tomorrow");
    expect(nextRowFacts("2026-10-22", now).when).toBe("Thursday, Oct 22");
  });

  test("days since you applied, once a day has passed", () => {
    expect(daysSinceApplied(new Date(2026, 8, 28, 9, 0).toISOString(), now)).toBe("15 days");
    expect(daysSinceApplied(new Date(2026, 9, 12, 8, 0).toISOString(), now)).toBe("1 day");
    expect(daysSinceApplied(new Date(2026, 9, 13, 8, 0).toISOString(), now)).toBeNull();
  });
});

describe("an application Pinkslip sent", () => {
  const sent = detail([event("applied", "2026-10-14T09:52:00")], { company_name: "Ramp", applied_at: "2026-10-14T09:52:00" });
  const stamps = stubStamps(sent);

  test("waits, dashed, until something confirms it", () => {
    expect(sentStub(sent, { via: "Ashby", confirmed: null }, stamps)).toEqual({
      waiting: true,
      aside: { title: "Waiting for Ramp", detail: "to confirm it arrived" },
      foot: "Sent by Pinkslip · via Ashby",
    });
  });

  test("says what confirmed it, with the day only when it's another day", () => {
    const sameDay = sentStub(sent, { via: "Ashby", confirmed: { by: "email", at: "2026-10-14T09:58:00" } }, stamps);
    expect(sameDay.waiting).toBe(false);
    expect(sameDay.aside).toEqual({ title: "Confirmed", detail: "by Ramp's email, 9:58 AM" });
    expect(sentStub(sent, { via: "Ashby", confirmed: { by: "board", at: "2026-10-15T08:10:00" } }, stamps).aside?.detail)
      .toBe("by Ashby, Oct 15, 8:10 AM");
  });

  test("a later step is proof enough", () => {
    const later = detail([event("applied", "2026-10-14T09:52:00"), event("interview", "2026-10-20T09:00:00")]);
    expect(sentStub(later, { via: "Ashby", confirmed: null }, stubStamps(later))).toMatchObject({ waiting: false, aside: null });
  });
});
