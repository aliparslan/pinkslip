import { router, type Href } from "expo-router";
import { useState } from "react";
import { toast } from "../../kit";
import { setAppearancePreference, useAppearancePreference } from "../../theme/appearance";
import type { ApplicationAnswerValue, SavedApplicationAnswer } from "@pinkslip/core/api";
import type { WorkAuthorization } from "@pinkslip/domain/search-profile";
import { AccountView } from "../redesign/you/AccountPage";
import { AnswersView } from "../redesign/you/AnswersPage";
import { AlertsView, type NewJobAlerts } from "../redesign/you/AlertsPage";
import { HiddenCompaniesView, type HiddenCompany } from "../redesign/you/HiddenCompaniesPage";
import { PlanFreeView, PlanProView } from "../redesign/you/PlanPage";
import { YouView, type YouDestination } from "../redesign/you/YouScreen";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** You as drawn (Paper B4), on Jordan's sample values. Plan, Email tracking
 * and Alerts open their sample pages; the rest open the real ones. */
export function SampleYouScreen() {
  const appearance = useAppearancePreference();
  const samples: Partial<Record<YouDestination, Href>> = {
    plan: { pathname: "/you/plan", params: { sample: "free" } },
    email: { pathname: "/you/email", params: { sample: "on" } },
    alerts: { pathname: "/you/alerts", params: { sample: "on" } },
    account: { pathname: "/you/account", params: { sample: "on" } },
  };
  const live: Partial<Record<YouDestination, Href>> = {
    resume: "/you/resume", answers: "/you/answers", outreach: "/you/outreach", tailoring: "/you/tailoring", help: "/you/feedback", whatsNew: "/you/whats-new",
    admin: "/you/admin", kit: "/you/kit-redesign",
  };
  return <YouView
    person={{ name: "Jordan Lee", email: "jordan@lee.dev" }}
    values={{ search: "New grad +1", email: "On", alerts: "On", resume: "Jordan_Lee.pdf", answers: "12", plan: "Free", whatsNew: "1.4" }}
    appearance={appearance}
    onAppearance={setAppearancePreference}
    show={{ email: true, answers: true, plan: true, admin: true, kit: true, outreach: true }}
    open={(destination) => {
      const href = samples[destination] ?? live[destination];
      if (href) router.push(href);
    }} />;
}

/** Alerts B with everything on: Once a day at a time, and Application
 * changes. Nothing is saved. */
export function SampleAlertsPage() {
  const [newJobs, setNewJobs] = useState<NewJobAlerts>("daily");
  const [changes, setChanges] = useState(true);
  return <AlertsView newJobs={newJobs} dailyAt="8:00 AM" applicationChanges={changes} actions={{
    setNewJobs,
    setApplicationChanges: setChanges,
    sendTest: async () => {
      await wait(600);
      toast.success("Test sent. (sample)");
    },
  }} />;
}

/** Plan on sample allowances: Free (C, the soft Pro card) or Pro (E).
 * Buying and restoring only pretend. */
export function SamplePlanPage({ state }: { state: "free" | "pro" }) {
  const pretend = async () => {
    await wait(900);
    toast.success("Sample only: nothing was bought.");
  };
  if (state === "pro") {
    return <PlanProView plan="Pro · Monthly" renews="Renews Nov 14 · $24.99, billed through Apple"
      week={[{ value: 14, label: "applied for you" }, { value: 9, label: "emails sent for you" }, { value: 6, label: "follow-ups" }]}
      onChangePlan={() => router.push({ pathname: "/you/plan", params: { sample: "free" } })} onRestore={pretend} />;
  }
  return <PlanFreeView resets="Monday" from="$4.61 a week" onBuy={pretend} onRestore={pretend}
    allowances={[{ label: "applied for you", used: 2, limit: 5 }, { label: "emails sent for you", used: 1, limit: 5 }]} />;
}

/** Account signed in, as Jordan. Nothing changes. */
export function SampleAccountPage() {
  const [name, setName] = useState("Jordan Lee");
  return <AccountView name={name} email="jordan.alexander.lee.27@icloud.com" provider="apple" actions={{
    rename: async (next) => setName(next),
    logOut: async () => {
      await wait(400);
      toast.success("Sample only: still signed in.");
    },
    deleteAccount: async () => {
      await wait(400);
      return { appleRevokeRequired: false };
    },
  }} />;
}

/** Three hidden companies; Show takes one off the list here only. */
export function SampleHiddenCompaniesPage() {
  const [companies, setCompanies] = useState<HiddenCompany[]>([
    { id: "oracle", name: "Oracle", website: "oracle.com" },
    { id: "infosys", name: "Infosys", website: "infosys.com" },
    { id: "revature", name: "Revature", website: "revature.com" },
  ]);
  return <HiddenCompaniesView companies={companies} onShow={async (company) => {
    await wait(500);
    setCompanies((current) => current.filter((item) => item.id !== company.id));
  }} />;
}

/** Answers as drawn (A7): a few answered, two not, and two from forms.
 * Nothing is saved. */
export function SampleAnswersPage() {
  const now = new Date().toISOString();
  const [answers, setAnswers] = useState<SavedApplicationAnswer[]>([
    { key: "graduation", label: "Graduation", value: "May 2025", updated_at: now },
    { key: "start_date", label: "Earliest start", value: "Immediately", updated_at: now },
    { key: "relocation", label: "Open to relocation", value: "yes", updated_at: now },
    { key: "office_days", label: "Days in an office", value: "3", updated_at: now },
    { key: "q:why-ramp", label: "Why do you want to work at Ramp?", value: "I spent last summer on Ramp's card-spend export and loved how close engineers sit to finance teams. I want to keep building tools people use every day.", updated_at: "2026-10-02T15:00:00Z" },
    { key: "q:mercury", label: "Have you used Mercury before?", value: "no", updated_at: "2026-10-04T15:00:00Z" },
  ]);
  const [sponsorship, setSponsorship] = useState<WorkAuthorization>("authorized");
  const save = async (key: string, value: ApplicationAnswerValue, label?: string) => setAnswers((current) => {
    const existing = current.find((answer) => answer.key === key);
    return existing ? current.map((answer) => answer.key === key ? { ...answer, value } : answer) : [...current, { key, label: label ?? key, value, updated_at: new Date().toISOString() }];
  });
  return <AnswersView answers={answers} sponsorship={sponsorship} actions={{
    save,
    clear: async (key) => setAnswers((current) => current.filter((answer) => answer.key !== key)),
    setSponsorship: async (choice) => setSponsorship(choice),
  }} />;
}
