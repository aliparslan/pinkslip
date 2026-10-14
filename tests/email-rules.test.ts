import { describe, expect, it } from "bun:test";
import { companyNameHints, matchCandidates, type JobCandidate } from "@worker/email/match";
import {
  companyEvidence,
  detectStage,
  isGmailForwardingConfirmation,
  parseGmailForwardingConfirmation,
  parseInboxTag,
  shouldOpen,
  unwrapForward,
  type EmailContent,
  type TrackedCompany,
} from "@worker/email/rules";

const email = (overrides: Partial<EmailContent>): EmailContent => ({
  from: { name: "", address: "" },
  subject: "",
  date: null,
  text: "",
  links: [],
  ...overrides,
});

const airbnb: TrackedCompany = { id: "airbnb", name: "Airbnb", website: "", ats_slug: "airbnb" };
const plaid: TrackedCompany = { id: "plaid", name: "Plaid", website: "https://plaid.com", ats_slug: "plaid" };

describe("inbox address", () => {
  it("reads the tag from inbox+<tag>@pinkslip.work only", () => {
    expect(parseInboxTag("inbox+k3j9xab2cd@pinkslip.work")).toBe("k3j9xab2cd");
    expect(parseInboxTag("Inbox+K3J9XAB2CD@PinkSlip.work")).toBe("k3j9xab2cd");
    expect(parseInboxTag("inbox@pinkslip.work")).toBeNull();
    expect(parseInboxTag("hello+k3j9xab2cd@pinkslip.work")).toBeNull();
    expect(parseInboxTag("inbox+k3j9xab2cd@example.com")).toBeNull();
  });
});

describe("Gmail forwarding confirmation", () => {
  it("is recognised, with its code and confirmation link", () => {
    const confirmation = email({
      from: { name: "Gmail Team", address: "forwarding-noreply@google.com" },
      subject: "(#418523977) Gmail Forwarding Confirmation - Receive Mail from alex@gmail.com",
      text: "alex@gmail.com has requested to automatically forward mail to your email address.\nConfirmation code: 418523977",
      links: ["https://mail-settings.google.com/mail/vf-%5BANGjdJ9x%5D-abc", "https://evil.example.com/vf-x"],
    });
    expect(isGmailForwardingConfirmation(confirmation.from, confirmation.subject)).toBe(true);
    expect(parseGmailForwardingConfirmation(confirmation)).toEqual({
      code: "418523977",
      link: "https://mail-settings.google.com/mail/vf-%5BANGjdJ9x%5D-abc",
    });
    expect(isGmailForwardingConfirmation({ name: "", address: "noreply@google.com" }, confirmation.subject)).toBe(false);
  });
});

describe("which emails are opened", () => {
  it("opens hiring services, tracked companies and application subjects; drops the rest unread", () => {
    expect(shouldOpen({ from: { name: "Airbnb", address: "no-reply@us.greenhouse-mail.io" }, subject: "Thanks!" }, [])).toBe(true);
    expect(shouldOpen({ from: { name: "HackerRank", address: "support@hackerrankforwork.com" }, subject: "Invitation" }, [])).toBe(true);
    expect(shouldOpen({ from: { name: "Maya at Airbnb", address: "maya@airbnb.com" }, subject: "Quick chat Thursday?" }, [airbnb])).toBe(true);
    expect(shouldOpen({ from: { name: "Recruiting", address: "jobs@somecompany.com" }, subject: "Next steps" }, [])).toBe(true);
    expect(shouldOpen({ from: { name: "Me", address: "alex@gmail.com" }, subject: "Fwd: hello" }, [])).toBe(true);
    expect(shouldOpen({ from: { name: "Chase", address: "no.reply@chase.com" }, subject: "Your statement is ready" }, [airbnb])).toBe(false);
    expect(shouldOpen({ from: { name: "Spotify", address: "no-reply@spotify.com" }, subject: "Your Daily Mix" }, [airbnb])).toBe(false);
  });
});

describe("what happened", () => {
  it("reads a receipt as Applied, even when it mentions a future interview", () => {
    expect(detectStage(email({
      subject: "Thank you for applying to Airbnb",
      text: "Hi Alex,\n\nThanks for applying for the Software Engineer, New Grad position at Airbnb. "
        + "Our team will review your application. If your experience is a match, we'll reach out to schedule an interview.",
    }))).toBe("applied");
  });

  it("reads rejections, including the generic ones", () => {
    expect(detectStage(email({
      subject: "Your application to Plaid",
      text: "Thank you for your interest in Plaid. After careful consideration, we have decided to move forward with other candidates "
        + "whose experience more closely matches our needs. We will keep your resume on file and may reach out if a role opens.",
    }))).toBe("rejected");
    expect(detectStage(email({ subject: "Update on your application", text: "Unfortunately we won't be moving forward with your application at this time." }))).toBe("rejected");
    expect(detectStage(email({ subject: "Airbnb", text: "We regret to inform you that the position has been filled." }))).toBe("rejected");
  });

  it("reads interview invitations and scheduling links", () => {
    expect(detectStage(email({ subject: "Next steps with Notion", text: "We'd like to invite you to a phone screen with our recruiter." }))).toBe("interview");
    expect(detectStage(email({ subject: "Stripe: let's talk", text: "Please use the link below.", links: ["https://app.goodtime.io/schedule/abc"] }))).toBe("interview");
  });

  it("reads assessments", () => {
    expect(detectStage(email({ subject: "Invitation: Airbnb Online Assessment", text: "You have 7 days to complete the online assessment." }))).toBe("assessment");
    expect(detectStage(email({ subject: "Coding challenge", text: "Start here", links: ["https://www.hackerrank.com/test/abc123"] }))).toBe("assessment");
  });

  it("reads offers, and ignores mail that says none of these", () => {
    expect(detectStage(email({ subject: "Your offer from Ramp", text: "We are pleased to offer you the position of Software Engineer." }))).toBe("offer");
    expect(detectStage(email({ subject: "Airbnb newsletter", text: "Explore stays near you." }))).toBeNull();
  });
});

describe("manual forwards", () => {
  it("unwraps Gmail's forwarded block to the original sender, subject and date", () => {
    const unwrapped = unwrapForward(email({
      from: { name: "Alex", address: "alex@gmail.com" },
      subject: "Fwd: Thank you for applying to Airbnb",
      text: "FYI\n\n---------- Forwarded message ---------\nFrom: Airbnb <no-reply@us.greenhouse-mail.io>\n"
        + "Date: Mon, Oct 12, 2026 at 3:04 PM\nSubject: Thank you for applying to Airbnb\nTo: <alex@gmail.com>\n\nHi Alex, thanks for applying.",
    }));
    expect(unwrapped.from).toEqual({ name: "Airbnb", address: "no-reply@us.greenhouse-mail.io" });
    expect(unwrapped.subject).toBe("Thank you for applying to Airbnb");
    expect(unwrapped.date).toBe("Mon, Oct 12, 2026 at 3:04 PM");
    expect(unwrapped.text.trim()).toBe("Hi Alex, thanks for applying.");
  });

  it("unwraps Apple Mail's forward and leaves ordinary mail alone", () => {
    expect(unwrapForward(email({
      subject: "Fwd: Interview",
      text: "Begin forwarded message:\n\nFrom: \"Plaid Recruiting\" <recruiting@plaid.com>\nSubject: Interview\nDate: October 12, 2026\n\nHello",
    })).from).toEqual({ name: "Plaid Recruiting", address: "recruiting@plaid.com" });
    const plain = email({ subject: "Interview", text: "Hello" });
    expect(unwrapForward(plain)).toBe(plain);
  });
});

describe("which company", () => {
  it("weighs sender domain, ATS links and names above mentions", () => {
    expect(companyEvidence(plaid, email({ from: { name: "", address: "recruiting@plaid.com" } }))).toBe(5);
    expect(companyEvidence(airbnb, email({ from: { name: "Greenhouse", address: "no-reply@greenhouse-mail.io" }, links: ["https://boards.greenhouse.io/airbnb/jobs/1"] }))).toBe(5);
    expect(companyEvidence(airbnb, email({ from: { name: "Airbnb Recruiting", address: "x@us.greenhouse-mail.io" } }))).toBe(4);
    expect(companyEvidence(airbnb, email({ subject: "Thank you for applying to Airbnb" }))).toBe(3);
    expect(companyEvidence(airbnb, email({ subject: "Hello", text: "Unrelated mail" }))).toBe(0);
  });

  it("suggests catalog names from the sender and the wording", () => {
    expect(companyNameHints(email({ from: { name: "Airbnb Recruiting", address: "recruiting@airbnb.com" } }))).toContain("airbnb");
    expect(companyNameHints(email({ from: { name: "", address: "no-reply@greenhouse-mail.io" }, subject: "Thank you for applying to Ramp" }))).toContain("ramp");
  });
});

describe("which application", () => {
  const airbnbApps: JobCandidate[] = [
    { id: "a1", title: "Software Engineer, New Grad", external_id: "7212345", url: "https://boards.greenhouse.io/airbnb/jobs/7212345" },
    { id: "a2", title: "Software Engineer", external_id: "7212999", url: "https://boards.greenhouse.io/airbnb/jobs/7212999" },
    { id: "a3", title: "Data Scientist, Analytics", external_id: "7300001", url: null },
    { id: "a4", title: "Machine Learning Engineer", external_id: "7300002", url: null },
    { id: "a5", title: "Product Designer", external_id: "7300003", url: null },
  ];

  it("asks when a generic rejection could be any of five Airbnb applications", () => {
    expect(matchCandidates(email({ subject: "Your application to Airbnb", text: "We will not be moving forward with your application." }), airbnbApps))
      .toEqual({ kind: "ambiguous", ids: ["a1", "a2", "a3", "a4", "a5"] });
  });

  it("matches a job link or ID before anything else", () => {
    expect(matchCandidates(email({ links: ["https://boards.greenhouse.io/airbnb/jobs/7212999?gh_jid=7212999"] }), airbnbApps))
      .toEqual({ kind: "match", id: "a2", by: "job_reference" });
    expect(matchCandidates(email({ text: "Requisition 7300002" }), airbnbApps)).toEqual({ kind: "match", id: "a4", by: "job_reference" });
  });

  it("matches the most specific title mentioned", () => {
    expect(matchCandidates(email({ text: "your application for the Software Engineer, New Grad role" }), airbnbApps))
      .toEqual({ kind: "match", id: "a1", by: "title" });
    expect(matchCandidates(email({ text: "your application for Software Engineer at Airbnb" }), airbnbApps))
      .toEqual({ kind: "match", id: "a2", by: "title" });
    expect(matchCandidates(email({ subject: "Product Designer - San Francisco (R123)" }), [{ id: "x", title: "Product Designer (R123)", external_id: null, url: null }]))
      .toEqual({ kind: "match", id: "x", by: "title" });
  });

  it("keeps two applications with the same title ambiguous, and takes a lone candidate", () => {
    const twins: JobCandidate[] = [
      { id: "t1", title: "Software Engineer", external_id: null, url: null },
      { id: "t2", title: "Software Engineer", external_id: null, url: null },
    ];
    expect(matchCandidates(email({ text: "Software Engineer update" }), twins)).toEqual({ kind: "ambiguous", ids: ["t1", "t2"] });
    expect(matchCandidates(email({ text: "Thanks" }), [airbnbApps[4]!])).toEqual({ kind: "match", id: "a5", by: "only_candidate" });
    expect(matchCandidates(email({}), [])).toEqual({ kind: "none" });
  });
});
