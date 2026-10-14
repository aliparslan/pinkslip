import type { ApplicationDetail, ApplicationEvent, ApplicationStage } from "@pinkslip/core/api";
import { parseJobDescription } from "@pinkslip/core/job-description";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ApplicationView, type ApplicationActions } from "../redesign/ApplicationPage";
import { Description } from "../redesign/Description";

const DAY = 24 * 60 * 60 * 1000;

export type SampleState = "interview" | "applied" | "no-date";

const STATES: readonly SampleState[] = ["interview", "applied", "no-date"];

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
    undoEmail: async (emailId) => setApplication((current) => {
      const events = current.events.filter((item) => item.inbound_email_id !== emailId);
      const last = events.at(-1)!;
      return { ...current, events, stage: last.stage, stage_changed_at: last.occurred_at, stage_date: null };
    }),
    remove: async () => router.back(),
  };
  return <ApplicationView application={application} about={<Description blocks={blocks} />} actions={actions} />;
}
