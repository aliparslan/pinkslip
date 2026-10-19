import { describe, expect, test } from "bun:test";
import type { CompanyEvent } from "../shared/company-events";
import { eventHours, eventLength, toEventView } from "../apps/native/src/features/redesign/event-facts";
import { planFromToday } from "../apps/native/src/features/redesign/today-facts";

// Thursday, Oct 15, 2 PM where the tests run.
const now = new Date(2026, 9, 15, 14, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

const event = (patch: Partial<CompanyEvent> = {}): CompanyEvent => ({
  id: "ev1",
  company_id: "stripe",
  company_name: "Stripe",
  company_domain: "https://stripe.com",
  title: "New grad info session",
  starts_at: at(22, 17),
  ends_at: at(22, 17, 45),
  location: "Online",
  online: true,
  url: "https://stripe.com/events/new-grad",
  signup_closes_at: at(21, 23, 59),
  audience: "New grads",
  host: "the payments team",
  about: "Engineers on their first year.",
  points: ["What the first 90 days look like"],
  reminded: false,
  ...patch,
});

describe("event facts", () => {
  test("reads like Paper's E1 row and E2 ticket", () => {
    expect(toEventView(event(), now)).toMatchObject({
      month: "OCT", day: "22", when: "Thursday, Oct 22", time: "5:00 PM", name: "New grad info session",
      facts: "Online · 45 min", date: "Thu, Oct 22",
      hours: "5:00–5:45 PM", where: "Online", signupsClose: "Oct 21", forWhom: "New grads",
      stub: "Hosted by the payments team · via stripe.com",
    });
  });

  test("says how long, else when sign-ups close, else in person", () => {
    expect(eventLength(event({ ends_at: at(22, 19) }))).toBe("2 hr");
    expect(eventLength(event({ ends_at: at(22, 18, 30) }))).toBe("1 hr 30 min");
    expect(eventLength(event({ ends_at: null }))).toBeNull();
    expect(toEventView(event({ ends_at: null }), now).facts).toBe("Online · Sign-up closes Oct 21");
    expect(toEventView(event({ ends_at: null, signup_closes_at: null, online: false, location: "San Francisco office" }), now).facts)
      .toBe("San Francisco office · In person");
    expect(toEventView(event({ ends_at: null, signup_closes_at: null }), now).facts).toBe("Online");
  });

  test("writes the time across noon in full, and the host once", () => {
    expect(eventHours(event({ starts_at: at(22, 11, 30), ends_at: at(22, 12, 30) }))).toBe("11:30 AM–12:30 PM");
    expect(eventHours(event({ ends_at: null }))).toBe("5:00 PM");
    expect(toEventView(event({ host: "Hosted by Women at Stripe" }), now).stub).toBe("Hosted by Women at Stripe · via stripe.com");
    expect(toEventView(event({ host: "" }), now).stub).toBe("via stripe.com");
  });

  test("joins Today's Coming up with the event leading (E3c)", () => {
    const plan = planFromToday({
      needs_you: [],
      changed: [],
      coming_up: [{ kind: "upcoming_event", key: "event-ev1", at: event().starts_at, event: event() }],
      badge: 0,
      seen_at: null,
      tracking: 0,
    }, now);
    expect(plan.comingUp).toEqual([expect.objectContaining({
      company: "Thursday, Oct 22", headline: "New grad info session", facts: "Stripe · Online · 45 min", trailing: "5:00 PM",
      date: { month: "OCT", day: "22" }, target: { kind: "event", id: "ev1" },
    })]);
  });
});
