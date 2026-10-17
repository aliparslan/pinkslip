import { readableCode } from "@pinkslip/core/admin-format";
import type { ClassificationDisagreement, ClassificationVerdict, Company } from "@pinkslip/core/api";
import {
  MANUAL_SWEEP_BATCHES, useClassificationReport, useClassificationVerdict, useCompanies, useDeleteCompany, useFeedbackInbox, useJobReviews, useModerateFeedback,
  useModerateReport, useModerateReview, useProductMetrics, useRecruiterLabel, useRecruiterReview, useRefreshAllSources, useRefreshInbox, useReports, useRuns,
  useRunLatency, useRunRecruiterSourcing, useToggleCompany,
} from "@pinkslip/data";
import { router, useLocalSearchParams, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Linking } from "react-native";
import { Sheet } from "../../../kit";
import { EmptyState, toast, UNDO_TOAST_DURATION } from "../../../ui";
import { AddSourceForm, EditSourceForm } from "../../admin/Sources";
import {
  SAMPLE_COMPANIES, SAMPLE_FEEDBACK, SAMPLE_JEV, SAMPLE_METRICS, SAMPLE_RECRUITER_SCORE, SAMPLE_RECRUITERS, SAMPLE_REPORTS, SAMPLE_REVIEWS, SAMPLE_RUNS,
  SAMPLE_TIERS,
} from "../../kit/admin-sample";
import { YouPage } from "../you/Page";
import { ago, failingSources, flagEvidence, lastDay, needsYou, recruiterQueue, recruiterTally, runLine, shortDate } from "./admin-facts";
import {
  AdminHomeView, askForNote, DecideView, feedbackRow, flaggedRow, HealthView, InboxListView, JevView, RecruitersView, reportRow, RunsView, SourcesView,
  type AdminTool, type InboxRow,
} from "./AdminViews";

/**
 * The live Admin screens (Paper "Admin · Oct 16") and their kit samples.
 * The Inbox opens as three lists from Home's Needs you: flagged jobs, notes
 * from people, and reports; each entry opens on its own page, one decision
 * at a time.
 */

export type InboxKind = "flagged" | "feedback" | "reports";

/** What an entry's page shows (A3). */
interface InboxEntry {
  company: string;
  title: string;
  whyHeader?: string;
  why: [string, string][];
  body?: string;
  link?: { label: string; onPress: () => void };
  extra?: { label: string; onPress: () => void };
  withNote?: boolean;
}

const failed = () => toast.error("Couldn't update that. Try again.");
const sampled = (what: string) => () => toast.show({ message: `Sample: ${what}` });
const open = (url: string) => void WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });

/** Where Home's rows and tools go; the kit's sample keeps to samples. */
function adminHref(id: string, sample: boolean): Href {
  const path = id === "flagged" || id === "feedback" || id === "reports" ? `/you/admin/inbox?kind=${id}` : `/you/admin/${id}`;
  return (sample ? `${path}${path.includes("?") ? "&" : "?"}sample=on` : path) as Href;
}

export function useAdminSample() {
  return useLocalSearchParams<{ sample?: string }>().sample === "on";
}

/** A1, live. */
export function AdminHomePage() {
  const runs = useRuns();
  const companies = useCompanies();
  const reviews = useJobReviews();
  const feedback = useFeedbackInbox();
  const reports = useReports();
  const jev = useClassificationReport();
  const recruiters = useRecruiterReview();
  const now = Date.now();
  const reviewList = reviews.data?.pages.flatMap((page) => page.reviews) ?? [];
  const jevRows = jev.data?.available ? jev.data.disagreements ?? [] : [];
  const candidates = recruiters.data?.available ? recruiters.data.candidates ?? [] : [];
  const toLabel = recruiterQueue(candidates);
  const ready = Boolean(runs.data && companies.data && reviews.data && feedback.data && reports.data);
  const counts = jev.data?.counts;
  const compared = counts ? counts.agree + counts.rules_only + counts.jev_only : 0;
  const score = recruiters.data?.score;
  return <AdminHomeView
    day={lastDay(runs.data ?? [], now)}
    line={runLine(runs.data?.[0], now)}
    rows={ready ? needsYou({
      failing: failingSources(companies.data ?? []),
      flagged: { total: reviews.data?.pages.at(-1)?.meta.total ?? reviewList.length, newest: reviewList[0] },
      feedback: feedback.data ?? [],
      reports: reports.data ?? [],
      jevOpen: jevRows.filter((row) => !row.review).length,
      toLabel: { count: toLabel.length, companies: [...new Set(toLabel.map((row) => row.company))] },
    }) : []}
    tools={{
      runs: runs.data?.[0] ? ago(runs.data[0].started_at, now) : undefined,
      sources: companies.data ? String(companies.data.filter((company) => company.enabled).length) : undefined,
      health: "30 days",
      jev: compared > 0 ? `${Math.round(((counts?.agree ?? 0) / compared) * 100)}% agree` : undefined,
      recruiters: score && score.role.labelled > 0 ? `${Math.round((score.role.right / score.role.labelled) * 100)}% right` : undefined,
    }}
    onOpen={(id) => router.push(adminHref(id, false))} />;
}

export function SampleAdminHome() {
  const now = Date.now();
  return <AdminHomeView day={lastDay(SAMPLE_RUNS, now)} line={runLine(SAMPLE_RUNS[0], now)}
    rows={needsYou({
      failing: failingSources(SAMPLE_COMPANIES), flagged: { total: 12, newest: SAMPLE_REVIEWS[0] }, feedback: SAMPLE_FEEDBACK, reports: SAMPLE_REPORTS,
      jevOpen: SAMPLE_JEV.length, toLabel: { count: 9, companies: ["Stripe", "Ramp", "Notion", "Figma", "Plaid"] },
    })}
    tools={{ runs: ago(SAMPLE_RUNS[0]!.started_at, now), sources: "215", health: "30 days", jev: "92% agree", recruiters: "81% right" }}
    onOpen={(id: string | AdminTool) => router.push(adminHref(id, true))} />;
}

/** An inbox list's rows, each entry's page, and the two answers, for one kind. */
function useInbox(kind: InboxKind, sample: boolean) {
  const reviews = useJobReviews();
  const feedback = useFeedbackInbox();
  const reports = useReports();
  const moderateReview = useModerateReview();
  const moderateFeedback = useModerateFeedback();
  const moderateReport = useModerateReport();
  const refresh = useRefreshInbox();
  const [sampleGone, setSampleGone] = useState<string[]>([]);
  const now = Date.now();

  const undoable = (message: string, key: string, undo: () => void) => toast.show({ message, dedupeKey: key, duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: undo } });

  if (kind === "flagged") {
    const list = (sample ? SAMPLE_REVIEWS : reviews.data?.pages.flatMap((page) => page.reviews) ?? []).filter((review) => !sampleGone.includes(review.job_id));
    const decide = (id: string, yes: boolean, note?: string) => {
      if (sample) { setSampleGone([...sampleGone, id]); sampled(yes ? "approved" : "rejected")(); return; }
      moderateReview.mutate({ jobId: id, state: yes ? "approved" : "rejected", note }, {
        onSuccess: () => undoable(yes ? "Job approved" : "Job rejected", `review-${id}`,
          () => moderateReview.mutate({ jobId: id, state: "needs_review", note }, { onSettled: () => void refresh("reviews"), onError: failed })),
        onError: failed,
      });
    };
    return {
      title: "Flagged jobs", approve: "Approve", reject: "Reject", empty: "Nothing's flagged.", pending: !sample && reviews.isPending,
      total: sample ? list.length : reviews.data?.pages.at(-1)?.meta.total ?? list.length,
      rows: list.map((review) => flaggedRow(review, now)), decide,
      more: !sample && reviews.hasNextPage ? { pending: reviews.isFetchingNextPage, run: () => void reviews.fetchNextPage() } : null,
      page: (id: string): InboxEntry | null => {
        const review = list.find((item) => item.job_id === id);
        return review ? {
          company: review.company_name, title: review.title, whyHeader: "Why it was flagged", why: flagEvidence(review),
          body: review.evidence?.description_excerpt, link: { label: "Open the posting", onPress: () => open(review.url) }, withNote: true,
        } : null;
      },
    };
  }
  if (kind === "feedback") {
    const list = (sample ? SAMPLE_FEEDBACK : feedback.data ?? []).filter((item) => !sampleGone.includes(item.id));
    const decide = (id: string, yes: boolean) => {
      if (sample) { setSampleGone([...sampleGone, id]); sampled(yes ? "resolved" : "declined")(); return; }
      const item = list.find((entry) => entry.id === id);
      moderateFeedback.mutate({ id, status: yes ? "resolved" : "declined" }, {
        onSuccess: () => undoable(yes ? "Resolved" : "Declined", `feedback-${id}`,
          () => moderateFeedback.mutate({ id, status: item?.status ?? "new" }, { onSettled: () => void refresh("feedback"), onError: failed })),
        onError: failed,
      });
    };
    const plan = (id: string) => {
      if (sample) { sampled("planned")(); return; }
      moderateFeedback.mutate({ id, status: "planned" }, { onSuccess: () => toast.success("Planned"), onError: failed });
    };
    return {
      title: "Notes from people", approve: "Resolve", reject: "Decline", empty: "No notes waiting.", pending: !sample && feedback.isPending,
      total: list.length, rows: list.map((item) => feedbackRow(item, now)), decide, more: null,
      page: (id: string): InboxEntry | null => {
        const item = list.find((entry) => entry.id === id);
        return item ? {
          company: item.user_name || "Someone", title: item.title, why: [["Kind", readableCode(item.submission_type).replace(/^./, (letter) => letter.toUpperCase())], ["Sent", shortDate(item.created_at)]] as [string, string][],
          body: item.details || undefined, link: item.careers_url ? { label: "Open their careers page", onPress: () => open(item.careers_url!) } : undefined,
          extra: item.status === "planned" ? undefined : { label: "Mark as planned", onPress: () => plan(id) },
        } : null;
      },
    };
  }
  const list = (sample ? SAMPLE_REPORTS : reports.data ?? []).filter((report) => !sampleGone.includes(report.id));
  const decide = (id: string, yes: boolean) => {
    if (sample) { setSampleGone([...sampleGone, id]); sampled(yes ? "resolved" : "dismissed")(); return; }
    moderateReport.mutate({ id, status: yes ? "resolved" : "dismissed" }, {
      onSuccess: () => undoable(yes ? "Report resolved" : "Report dismissed", `report-${id}`,
        () => moderateReport.mutate({ id, status: "open" }, { onSettled: () => void refresh("reports"), onError: failed })),
      onError: failed,
    });
  };
  return {
    title: "Reports", approve: "Resolve", reject: "Dismiss", empty: "No reports open.", pending: !sample && reports.isPending,
    total: list.length, rows: list.map((report) => reportRow(report, now)), decide, more: null,
    page: (id: string): InboxEntry | null => {
      const report = list.find((entry) => entry.id === id);
      return report ? {
        company: report.company_name ?? "Unknown company", title: report.job_title ?? "Company report",
        why: [["Reason", readableCode(report.report_type).replace(/^./, (letter) => letter.toUpperCase())], ["Sent", shortDate(report.created_at)]] as [string, string][],
        body: report.notes || undefined,
      } : null;
    },
  };
}

/** A2: an inbox list. */
export function InboxListPage({ kind }: { kind: InboxKind }) {
  const sample = useAdminSample();
  const inbox = useInbox(kind, sample);
  if (inbox.pending) return <YouPage title={inbox.title}>{null}</YouPage>;
  const item = (id: string) => router.push(`/you/admin/inbox-item?kind=${kind}&id=${encodeURIComponent(id)}${sample ? "&sample=on" : ""}` as Href);
  return <InboxListView title={inbox.title} rows={inbox.rows as InboxRow[]} approve={inbox.approve} reject={inbox.reject} empty={inbox.empty}
    onOpen={item} onApprove={(id) => inbox.decide(id, true)} onReject={(id) => inbox.decide(id, false)} />;
}

/** A3: one entry, then on to the next. */
export function InboxItemPage({ kind, id }: { kind: InboxKind; id: string }) {
  const sample = useAdminSample();
  const inbox = useInbox(kind, sample);
  const [note, setNote] = useState<string | undefined>();
  const index = inbox.rows.findIndex((row) => row.id === id);
  const page = inbox.page(id);
  if (!page) {
    return <YouPage title="">
      <EmptyState title={inbox.pending ? "Loading" : "Already decided"} message={inbox.pending ? undefined : "That one's been taken care of."} />
    </YouPage>;
  }
  const next = inbox.rows[index + 1]?.id ?? inbox.rows[index - 1]?.id;
  const decide = (yes: boolean) => {
    inbox.decide(id, yes, note);
    setNote(undefined);
    if (next) router.setParams({ id: next });
    else router.back();
  };
  return <DecideView company={page.company} title={page.title} whyHeader={page.whyHeader} why={page.why} body={page.body}
    link={page.link} extra={page.extra} position={index + 1} total={inbox.total}
    reject={inbox.reject} approve={inbox.approve} onReject={() => decide(false)} onApprove={() => decide(true)}
    note={note} onNote={page.withNote ? () => askForNote(note, setNote) : undefined} />;
}

/** A4, live and sample. */
export function JevPage() {
  const sample = useAdminSample();
  const report = useClassificationReport();
  const verdict = useClassificationVerdict();
  const [sampleJudged, setSampleJudged] = useState<Record<string, ClassificationVerdict>>({});
  const rows: ClassificationDisagreement[] = sample ? SAMPLE_JEV : report.data?.available ? report.data.disagreements ?? [] : [];
  const judgedOf = (row: ClassificationDisagreement) => sample ? sampleJudged[row.cache_key] : row.review?.verdict;
  const open = rows.filter((row) => !judgedOf(row));
  const done = rows.map(judgedOf).filter(Boolean);
  const judged = { total: done.length + (sample ? 18 : 0), rules: done.filter((v) => v === "rules").length + (sample ? 11 : 0), jev: done.filter((v) => v === "jev").length + (sample ? 6 : 0), neither: done.filter((v) => v === "neither").length + (sample ? 1 : 0) };
  if (!sample && report.isPending) return <YouPage title="Jev">{null}</YouPage>;
  return <JevView rows={open} judged={judged}
    budget={sample ? { spent: 4.2, of: 20 } : report.data?.monthly_budget_usd ? { spent: report.data.month_spent_usd ?? 0, of: report.data.monthly_budget_usd } : undefined}
    onJudge={(row, id) => {
      if (sample) { setSampleJudged({ ...sampleJudged, [row.cache_key]: id }); return; }
      verdict.mutate({ cacheKey: row.cache_key, verdict: id }, { onError: () => toast.error("Couldn't save that. Try again.") });
    }} />;
}

/** A7, live and sample. */
export function RecruitersPage() {
  const sample = useAdminSample();
  const review = useRecruiterReview();
  const label = useRecruiterLabel();
  const run = useRunRecruiterSourcing();
  const [sampleRows, setSampleRows] = useState(SAMPLE_RECRUITERS);
  if (!sample && review.isPending) return <YouPage title="Recruiters">{null}</YouPage>;
  if (!sample && review.isError) {
    return <YouPage title="Recruiters">
      <EmptyState title="Recruiters didn't load" message="Check your connection and try again." action={{ label: "Try again", onPress: () => void review.refetch() }} />
    </YouPage>;
  }
  if (!sample && !review.data?.available) {
    return <YouPage title="Recruiters"><EmptyState title="Not set up yet" message="Run the latest database migration to review recruiters." /></YouPage>;
  }
  const rows = sample ? sampleRows : review.data?.candidates ?? [];
  const search = () => {
    if (sample) { sampled("five more companies would be searched")(); return; }
    run.mutate(5, {
      onSuccess: ({ runs }) => {
        const found = runs.reduce((sum, item) => sum + item.kept, 0);
        const broke = runs.filter((item) => item.error).length;
        toast.success(runs.length === 0
          ? "Every company with a website has been searched."
          : `Found ${found} recruiters at ${runs.length - broke} companies${broke ? `; ${broke} failed` : ""}.`);
      },
      onError: () => toast.error("The search didn't finish. Try again."),
    });
  };
  return <RecruitersView queue={recruiterQueue(rows)} tally={recruiterTally(sample ? SAMPLE_RECRUITER_SCORE : review.data?.score)}
    canRun={sample || Boolean(review.data?.can_run)} searching={run.isPending} onSearch={search}
    onLabel={(row, labels) => {
      if (sample) { setSampleRows(rows.map((item) => item.id === row.id ? { ...item, ...labels } : item)); return; }
      label.mutate({ id: row.id, labels }, { onError: failed });
    }}
    // LinkedIn's app, where the owner is signed in.
    onOpenProfile={(row) => sample ? sampled("LinkedIn would open")() : void Linking.openURL(row.profile_url)} />;
}

/** A5, live and sample. */
export function RunsPage() {
  const sample = useAdminSample();
  const runs = useRuns();
  const latency = useRunLatency();
  const companies = useCompanies();
  const [batch, setBatch] = useState<number | null>(null);
  const refresh = useRefreshAllSources(setBatch);
  const runNow = () => {
    if (sample) { sampled("every source would be checked now")(); return; }
    refresh.mutate(undefined, {
      onSuccess: ({ polled, found }) => toast.success(`Checked ${polled} sources · ${found} new jobs`),
      onError: () => toast.error("The check stopped early. Try again."),
      onSettled: () => setBatch(null),
    });
  };
  return <RunsView runs={sample ? SAMPLE_RUNS : runs.data ?? []} tiers={sample ? SAMPLE_TIERS : latency.data ?? []} companies={sample ? SAMPLE_COMPANIES : companies.data ?? []}
    now={Date.now()} refreshing={refresh.isPending ? `Checking every source${batch ? ` · batch ${batch} of ${MANUAL_SWEEP_BATCHES}` : ""}` : null}
    onRefresh={runNow} onOpenSource={() => router.push(`/you/admin/sources?filter=attention${sample ? "&sample=on" : ""}` as Href)} />;
}

/** A6, live and sample. Add and Edit keep the forms they had. */
export function SourcesPage() {
  const sample = useAdminSample();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const companies = useCompanies(!sample);
  const toggle = useToggleCompany();
  const remove = useDeleteCompany();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const confirmRemove = (company: Company) => Alert.alert(`Remove ${company.name}?`, "Its jobs stop updating. Turning it off keeps it for later instead.", [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: () => {
      if (sample) { sampled("removed")(); return; }
      remove.mutate(company.id, { onSuccess: () => toast.success(`${company.name} removed`), onError: () => toast.error("Couldn't remove that source. Try again.") });
    } },
  ]);
  return <>
    <SourcesView companies={sample ? SAMPLE_COMPANIES : companies.data ?? []} now={Date.now()} initialFilter={filter === "attention" ? "attention" : "all"}
      onAdd={() => (sample ? sampled("add a source")() : setAdding(true))}
      onEdit={(company) => (sample ? sampled(`edit ${company.name}`)() : setEditing(company))}
      onToggle={(company, enabled) => {
        if (sample) { sampled(enabled ? "turned on" : "turned off")(); return; }
        toggle.mutate({ id: company.id, enabled }, { onError: () => toast.error("Couldn't update that source. Try again.") });
      }}
      onRemove={confirmRemove} />
    <Sheet open={adding} onOpenChange={setAdding} title="Add a source">
      {adding && <AddSourceForm onDone={() => setAdding(false)} />}
    </Sheet>
    <Sheet open={editing !== null} onOpenChange={(isOpen) => { if (!isOpen) setEditing(null); }} title="Edit source">
      {editing && <EditSourceForm key={editing.id} company={editing} onDone={() => setEditing(null)} />}
    </Sheet>
  </>;
}

/** A7, live and sample. */
export function HealthPage() {
  const sample = useAdminSample();
  const metrics = useProductMetrics();
  if (sample) return <HealthView metrics={SAMPLE_METRICS} />;
  if (!metrics.data) return <YouPage title="Product health">{null}</YouPage>;
  return <HealthView metrics={metrics.data} />;
}
