import type { Application, ApplicationStage } from "@pinkslip/core/api";

const HOUR = 60 * 60 * 1000;

/** Tracker as drawn on Paper "Tracker · what we build now (TR2c)", for the
 * redesign kit: every stage, an ending of each kind, and more rows than All
 * shows. Times are relative to now, so the rows read the same any day. */
export function trackerSample(now = Date.now()): Application[] {
  const row = (company: string, domain: string, title: string, stage: ApplicationStage, hoursAgo: number, location: string, appliedDaysAgo: number | null): Application => {
    const at = (ms: number) => new Date(now - ms).toISOString();
    return {
      id: `${company}-${stage}`, job_id: `sample-${company}`, company_name: company, title, url: `https://${domain}`, stage, notes: "",
      applied_at: appliedDaysAgo === null ? null : at(appliedDaysAgo * 24 * HOUR),
      stage_changed_at: at(hoursAgo * HOUR), created_at: at(30 * 24 * HOUR), updated_at: at(hoursAgo * HOUR),
      job: { location, closed_at: null, company_domain: domain },
    };
  };
  return [
    row("Rippling", "rippling.com", "Software Engineer, New Grad", "saved", 30, "San Francisco, CA", null),
    row("Cursor", "cursor.com", "Software Engineer, New Grad", "saved", 54, "Remote", null),
    row("Vercel", "vercel.com", "Frontend Engineer, New Grad", "saved", 100, "Remote", null),
    row("Notion", "notion.so", "Product Engineer, New Grad", "saved", 200, "New York, NY", null),
    row("Linear", "linear.app", "Product Engineer, Early Career", "applied", 9, "Remote", 0),
    row("Retool", "retool.com", "Software Engineer, New Grad", "applied", 10, "San Francisco, CA", 0),
    row("Brex", "brex.com", "Software Engineer, New Grad", "applied", 11, "New York, NY", 0),
    row("Ramp", "ramp.com", "Software Engineer, New Grad", "applied", 300, "New York, NY", 12),
    row("Datadog", "datadoghq.com", "Data Analyst I", "assessment", 70, "New York, NY", 11),
    row("Mercury", "mercury.com", "Software Engineer, New Grad", "interview", 2, "San Francisco, CA", 15),
    row("Airtable", "airtable.com", "Software Engineer, Early Career", "interview", 50, "New York, NY", 13),
    row("Plaid", "plaid.com", "Software Engineer, New Grad", "offer", 9, "New York, NY", 21),
    row("Faire", "faire.com", "Software Engineer, New Grad", "rejected", 9, "San Francisco, CA", 20),
    row("Asana", "asana.com", "Data Analyst, New Grad", "ghosted", 100, "San Francisco, CA", 30),
    row("Robinhood", "robinhood.com", "Software Engineer Intern", "withdrawn", 170, "Menlo Park, CA", 25),
    row("Duolingo", "duolingo.com", "Software Engineer Intern", "rejected", 400, "Pittsburgh, PA", 40),
  ];
}
