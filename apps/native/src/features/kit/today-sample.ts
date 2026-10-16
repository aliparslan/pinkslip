import type { Application, ApplicationStage, InboundEmail } from "@pinkslip/core/api";
import type { OutreachThread } from "@pinkslip/domain/outreach";
import { outreachSample } from "./outreach-sample";

const HOUR = 60 * 60 * 1000;

/** Today as drawn (Paper "Approved", T1r), for the redesign kit: an offer to
 * answer, an interview with no date, an email that matched two
 * applications, news from email and a closed posting, then two dated steps.
 * Times are relative to now, so it reads the same any day. */
export function todaySample(now = Date.now()): { applications: Application[]; emails: InboundEmail[]; threads: OutreachThread[] } {
  const at = (ms: number) => new Date(now - ms).toISOString();
  const day = (days: number) => {
    const date = new Date(now + days * 24 * HOUR);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const row = (company: string, domain: string, title: string, stage: ApplicationStage, hoursAgo: number, extra: Partial<Application> = {}): Application => ({
    id: `${company}-${stage}`, job_id: `sample-${company}`, company_name: company, title, url: `https://${domain}`, stage, notes: "",
    applied_at: stage === "saved" ? null : at(10 * 24 * HOUR), stage_changed_at: at(hoursAgo * HOUR), stage_date: null,
    created_at: at(30 * 24 * HOUR), updated_at: at(hoursAgo * HOUR),
    job: { location: "New York, NY", closed_at: null, company_domain: domain }, ...extra,
  });
  const interview = new Date(now + 24 * HOUR);
  interview.setHours(11, 0, 0, 0);
  const applications = [
    row("Plaid", "plaid.com", "Software Engineer, New Grad", "offer", 9, { stage_date: day(4) }),
    row("Ramp", "ramp.com", "Product Designer", "interview", 1),
    row("Mercury", "mercury.com", "Software Engineer, New Grad", "interview", 30, { stage_date: interview.toISOString() }),
    row("Duolingo", "duolingo.com", "Software Engineer, New Grad", "assessment", 40, { stage_date: day(3) }),
    row("Faire", "faire.com", "Software Engineer, New Grad", "rejected", 9),
    row("Stripe", "stripe.com", "Software Engineer, New Grad", "applied", 200),
    row("Stripe", "stripe.com", "Data Engineer, New Grad", "applied", 210, { id: "Stripe-applied-2" }),
    row("Airtable", "airtable.com", "Software Engineer", "saved", 300, { job: { location: "Remote", closed_at: at(20 * HOUR), company_domain: "airtable.com" } }),
  ];
  const email = (id: string, company: string, subject: string, stage: InboundEmail["detected_stage"], status: InboundEmail["status"], hoursAgo: number, applicationId: string | null, candidates: InboundEmail["candidates"] = []): InboundEmail => ({
    id, received_at: at(hoursAgo * HOUR), sender_name: `${company} Recruiting`, sender_address: `jobs@${company.toLowerCase()}.com`, subject,
    sent_at: at(hoursAgo * HOUR), detected_stage: stage, status, company_name: company, application_id: applicationId, candidates,
  });
  const emails = [
    email("faire", "Faire", "Your application to Faire", "rejected", "applied", 9, "Faire-rejected"),
    email("stripe", "Stripe", "Next steps with Stripe", "assessment", "needs_choice", 8, null, [
      { id: "Stripe-applied", title: "Software Engineer, New Grad", stage: "applied" },
      { id: "Stripe-applied-2", title: "Data Engineer, New Grad", stage: "applied" },
    ]),
  ];
  return { applications, emails, threads: outreachSample(now) };
}
