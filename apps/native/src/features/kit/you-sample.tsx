import { router, type Href } from "expo-router";
import { useState } from "react";
import { toast } from "../../kit";
import { setAppearancePreference, useAppearancePreference } from "../../theme/appearance";
import { AccountView } from "../redesign/you/AccountPage";
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
    resume: "/you/resume", answers: "/you/answers", tailoring: "/you/tailoring", help: "/you/feedback", whatsNew: "/you/whats-new",
    admin: "/you/admin", kit: "/you/kit-redesign",
  };
  return <YouView
    person={{ name: "Jordan Lee", email: "jordan@lee.dev" }}
    values={{ search: "New grad +1", email: "On", alerts: "On", resume: "Jordan_Lee.pdf", answers: "12", plan: "Free", whatsNew: "1.4" }}
    appearance={appearance}
    onAppearance={setAppearancePreference}
    show={{ email: true, answers: true, plan: true, admin: true, kit: true }}
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
