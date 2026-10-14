import type { InboundEmail, Inbox } from "@pinkslip/core/api";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { EmailTrackingView } from "../redesign/email/EmailTrackingPage";
import type { EmailTrackingPrefs } from "../redesign/email/email-prefs";
import { JobEmailsView } from "../redesign/email/JobEmailsPage";
import type { EmailSetupActions } from "../redesign/email/SetupSheet";

const HOUR = 60 * 60 * 1000;

export type SampleTracking = "on" | "waiting" | "off";

export function sampleTrackingState(value: string | undefined): SampleTracking | null {
  return value === "on" || value === "waiting" || value === "off" ? value : null;
}

/** Job emails as drawn on Paper "Email tracking · Oct 14" (4B-3), plus last
 * month's, so both sections show. Times are relative to now. */
export function sampleEmails(now = Date.now()): InboundEmail[] {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();
  const email = (id: string, company: string, subject: string, hoursAgo: number, rest: Partial<InboundEmail>): InboundEmail => ({
    id, received_at: at(hoursAgo), sender_name: company, sender_address: `no-reply@${company.toLowerCase()}.com`, subject,
    sent_at: at(hoursAgo), detected_stage: "applied", status: "applied", company_name: company, application_id: `sample-${id}`, candidates: [],
    ...rest,
  });
  return [
    email("airbnb", "Airbnb", "Update on your application", 2, {
      detected_stage: "interview", status: "needs_choice", application_id: null, candidates: [
        { id: "airbnb-swe", title: "Software Engineer, New Grad", stage: "applied" },
        { id: "airbnb-data", title: "Data Engineer, New Grad", stage: "applied" },
        { id: "airbnb-intern", title: "Software Engineer Intern", stage: "applied" },
      ],
    }),
    email("mercury", "Mercury", "Next steps with Mercury", 5, { detected_stage: "interview" }),
    email("datadog", "Datadog", "Your Datadog coding challenge", 26, { detected_stage: "assessment" }),
    email("ramp", "Ramp", "Thanks for applying to Ramp", 70, { status: "created" }),
    email("brex", "Brex", "We received your application", 90, { status: "unchanged" }),
    email("figma", "Figma", "Your application to Figma", 24 * 40, { detected_stage: "rejected" }),
  ];
}

const ADDRESS = "inbox+k7m2xq@pinkslip.work";

/** Email tracking on sample data: setup, the status page and Job emails keep
 * their changes on this screen, so the simulator's account is never touched.
 * After "I added it" for Gmail, the code arrives a few seconds later. */
export function useSampleEmailTracking(initial: SampleTracking) {
  const [inbox, setInbox] = useState<Inbox>(() => ({
    address: ADDRESS,
    forwarding: { confirmed_at: initial === "on" ? new Date(Date.now() - 20 * 24 * HOUR).toISOString() : null, code: null, link: null },
    last_email_at: initial === "on" ? new Date(Date.now() - 2 * HOUR).toISOString() : null,
  }));
  const [prefs, setPrefs] = useState<EmailTrackingPrefs>(() => ({
    provider: initial === "off" ? null : "gmail", scope: "everything", started: initial === "waiting", nudgeDismissed: false,
  }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const actions: EmailSetupActions & { replace: () => Promise<void> } = {
    sendSteps: async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return "jordan@utexas.edu";
    },
    remember: (change) => {
      setPrefs((current) => ({
        ...current,
        provider: change.provider ?? current.provider,
        scope: change.scope ?? current.scope,
        started: change.started ?? current.started,
      }));
      if (change.started && !inbox.forwarding.confirmed_at) {
        timer.current = setTimeout(() => setInbox((current) => ({ ...current, forwarding: { ...current.forwarding, code: "604518337" } })), 3000);
      }
    },
    replace: async () => {
      setInbox({ address: "inbox+r4wd9p@pinkslip.work", forwarding: { confirmed_at: null, code: null, link: null }, last_email_at: inbox.last_email_at });
    },
  };
  return { inbox, prefs, actions };
}

export function SampleEmailTrackingPage({ state }: { state: SampleTracking }) {
  const { inbox, prefs, actions } = useSampleEmailTracking(state);
  const [emails] = useState(() => sampleEmails());
  return <EmailTrackingView inbox={inbox} emails={emails} prefs={prefs} actions={{
    ...actions,
    openEmails: () => router.push({ pathname: "/you/email-history", params: { sample: "on" } }),
  }} />;
}

export function SampleJobEmailsPage() {
  const [emails, setEmails] = useState(() => sampleEmails());
  return <JobEmailsView emails={emails} actions={{
    openApplication: () => router.push({ pathname: "/(tabs)/(library)/applications/[applicationId]", params: { applicationId: "sample-interview" } }),
    assign: async (emailId, applicationIds) => {
      setEmails((current) => current.map((email) => email.id === emailId
        ? { ...email, status: "assigned", application_id: applicationIds[0] ?? null, candidates: [] }
        : email));
    },
    dismiss: async (emailId) => {
      setEmails((current) => current.map((email) => email.id === emailId ? { ...email, status: "dismissed", candidates: [] } : email));
    },
  }} />;
}
