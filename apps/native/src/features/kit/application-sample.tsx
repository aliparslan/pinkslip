import type { ApplicationDetail, ApplicationEvent, ApplicationStage } from "@pinkslip/core/api";
import { parseJobDescription } from "@pinkslip/core/job-description";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ApplicationView, type ApplicationActions } from "../redesign/ApplicationPage";
import type { SentProof } from "../redesign/application-facts";
import { Description } from "../redesign/Description";

const DAY = 24 * 60 * 60 * 1000;

export type SampleState = "interview" | "applied" | "no-date" | "confirmed" | "sent";

const STATES: readonly SampleState[] = ["interview", "applied", "no-date", "confirmed", "sent"];

/** Sent by Pinkslip (Paper "6 · After: proof it went through"): Stripe
 * confirmed by its email, Ramp still waiting. */
const SENT: Partial<Record<SampleState, { company: string; title: string; domain: string; via: string; confirmed: boolean }>> = {
  confirmed: { company: "Stripe", title: "Backend Engineer, New Grad", domain: "stripe.com", via: "Greenhouse", confirmed: true },
  sent: { company: "Ramp", title: "Software Engineer, New Grad", domain: "ramp.com", via: "Ashby", confirmed: false },
};

/** "sample-interview" and the like: the kit's sample applications. */
export function sampleState(applicationId: string): SampleState | null {
  return STATES.find((state) => applicationId === `sample-${state}`) ?? null;
}

/** Mercury, as drawn on Paper "Application page · ideas · Oct 13", in each
 * state the boards show. Times are relative to now. */
export function applicationSample(state: SampleState, now = Date.now()): ApplicationDetail {
  const at = (daysAgo: number, hour = 15) => {
    const date = new Date(now - daysAgo * DAY);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };
  const event = (stage: ApplicationStage, occurred: string, email?: string): ApplicationEvent => ({
    id: `${stage}-${occurred}`, stage, occurred_at: occurred, source: email ? "email" : "user",
    inbound_email_id: email ? `mail-${stage}` : null, email_subject: email ?? null,
  });
  const sent = SENT[state];
  if (sent) {
    const applied = at(2, 9);
    return {
      id: `sample-${state}`, job_id: null, company_name: sent.company, title: sent.title, url: `https://${sent.domain}/jobs`,
      stage: "applied", notes: "", applied_at: applied, stage_changed_at: applied, stage_date: null,
      created_at: applied, updated_at: applied,
      job: { location: "San Francisco, CA", closed_at: null, company_domain: sent.domain },
      events: [event("applied", applied)],
    };
  }
  const events = [event("saved", at(17)), event("applied", at(15))];
  if (state !== "applied") events.push(event("interview", at(1, 9), state === "interview" ? undefined : "Next steps with Mercury"));
  const interviewDay = new Date(now + 2 * DAY);
  interviewDay.setHours(11, 0, 0, 0);
  return {
    id: `sample-${state}`, job_id: null, company_name: "Mercury", title: "Software Engineer, New Grad", url: "https://mercury.com/jobs",
    stage: events.at(-1)!.stage, notes: "", applied_at: at(15), stage_changed_at: events.at(-1)!.occurred_at,
    stage_date: state === "interview" ? interviewDay.toISOString() : null,
    created_at: at(17), updated_at: at(1),
    job: { location: "San Francisco, CA", closed_at: null, company_domain: "mercury.com" },
    events,
  };
}

const ABOUT = "<p>You'll join a product team building the APIs that millions of businesses use to move money, shipping code in your first week.</p>"
  + "<ul><li>Design and ship features end to end</li><li>Pair with engineers across payments and risk</li></ul>";

/** The proof for a sample Pinkslip sent: confirmed six minutes after it went. */
export function sentSample(state: SampleState, application: ApplicationDetail): SentProof | undefined {
  const sent = SENT[state];
  if (!sent) return undefined;
  const confirmedAt = new Date(new Date(application.applied_at!).getTime() + 6 * 60 * 1000).toISOString();
  return { via: sent.via, confirmed: sent.confirmed ? { by: "email", at: confirmedAt } : null };
}

/** The application page on sample data: every change stays on this screen,
 * so the simulator's signed-in account is never touched. */
export function SampleApplicationPage({ state }: { state: SampleState }) {
  const [application, setApplication] = useState(() => applicationSample(state));
  const blocks = useMemo(() => parseJobDescription(ABOUT, { title: application.title, companyName: application.company_name }), [application.title, application.company_name]);
  const actions: ApplicationActions = {
    setStage: async (stage) => setApplication((current) => ({
      ...current, stage, stage_date: null, stage_changed_at: new Date().toISOString(),
      events: [...current.events, { id: `${stage}-${Date.now()}`, stage, occurred_at: new Date().toISOString(), source: "user", inbound_email_id: null, email_subject: null }],
    })),
    setDate: async (stageDate) => setApplication((current) => ({ ...current, stage_date: stageDate })),
    setStepDate: async (eventId, day) => setApplication((current) => ({
      ...current,
      events: current.events.map((item) => item.id === eventId ? { ...item, occurred_at: `${day}T12:00:00` } : item),
    })),
    undoEmail: async (emailId) => setApplication((current) => {
      const events = current.events.filter((item) => item.inbound_email_id !== emailId);
      const last = events.at(-1)!;
      return { ...current, events, stage: last.stage, stage_changed_at: last.occurred_at, stage_date: null };
    }),
    remove: async () => router.back(),
  };
  return <ApplicationView application={application} about={<Description blocks={blocks} />} actions={actions}
    sent={sentSample(state, application)} onWhatItSent={() => router.push("/you/kit-sent")} />;
}
