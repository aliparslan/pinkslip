import { describe, expect, it } from "bun:test";
import type { InboundEmail, Inbox } from "../packages/core/src/api";
import {
  emailHeadline, jobEmailsThisMonth, shortAddress, sinceLastEmail, trackingState,
} from "../apps/native/src/features/redesign/email/email-facts";
import { forwardingSteps, JOB_MAIL_FILTER } from "../shared/email-tracking";

const inbox = (forwarding: Partial<Inbox["forwarding"]> = {}): Inbox => ({
  address: "inbox+k7m2xq@pinkslip.work",
  forwarding: { confirmed_at: null, code: null, link: null, ...forwarding },
  last_email_at: null,
});

const email = (rest: Partial<InboundEmail>): InboundEmail => ({
  id: "e1", received_at: "2026-10-14T12:00:00.000Z", sender_name: "Mercury", sender_address: "no-reply@mercury.com",
  subject: "Next steps", sent_at: null, detected_stage: "interview", status: "applied", company_name: "Mercury",
  application_id: "a1", candidates: [], ...rest,
});

describe("email tracking facts", () => {
  it("is off, then waiting once the address is added or Gmail's code arrives, then on", () => {
    expect(trackingState(undefined, false)).toBe("off");
    expect(trackingState(inbox(), false)).toBe("off");
    expect(trackingState(inbox(), true)).toBe("waiting");
    expect(trackingState(inbox({ code: "604518337" }), false)).toBe("waiting");
    expect(trackingState(inbox({ confirmed_at: "2026-10-14T00:00:00Z" }), false)).toBe("on");
  });

  it("says what each email did", () => {
    expect(emailHeadline(email({}))).toBe("Moved to Interviewing");
    expect(emailHeadline(email({ status: "assigned", detected_stage: "rejected" }))).toBe("Rejected");
    expect(emailHeadline(email({ status: "created", detected_stage: "applied" }))).toBe("Added to Tracker");
    expect(emailHeadline(email({ status: "needs_choice" }))).toBe("Which application?");
    expect(emailHeadline(email({ status: "unchanged" }))).toBe("No change");
  });

  it("counts this month's emails and how long since the last one", () => {
    const now = new Date("2026-10-14T14:00:00.000Z");
    const emails = [email({}), email({ id: "e2", received_at: "2026-10-01T00:00:00.000Z" }), email({ id: "e3", received_at: "2026-09-30T12:00:00.000Z" })];
    expect(jobEmailsThisMonth(emails, now)).toBe(2);
    expect(sinceLastEmail(null, now)).toBeNull();
    expect(sinceLastEmail("2026-10-14T13:59:30.000Z", now)).toBe("1m");
    expect(sinceLastEmail("2026-10-14T12:00:00.000Z", now)).toBe("2h");
    expect(sinceLastEmail("2026-10-11T14:00:00.000Z", now)).toBe("3d");
    expect(shortAddress("inbox+k7m2xq@pinkslip.work")).toBe("inbox+k7m2xq@…");
  });

  it("writes Gmail's last step for what it forwards", () => {
    const address = "inbox+k7m2xq@pinkslip.work";
    expect(forwardingSteps("gmail", "everything", address).at(-1)).toContain("Forward a copy of incoming mail");
    expect(forwardingSteps("gmail", "job", address).at(-1)).toContain(JOB_MAIL_FILTER);
    expect(forwardingSteps("outlook", "everything", address).join(" ")).toContain(address);
    expect(JOB_MAIL_FILTER.length).toBeLessThan(400);
  });
});
