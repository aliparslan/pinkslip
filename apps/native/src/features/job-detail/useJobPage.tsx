import type { Job } from "@pinkslip/core/api";
import {
  useApi, useBlockJob, useHideCompany, useHideJob, useJob, useMarkApplied, useMarkViewed, usePublicJob, useSaveJob, useSession,
  useStartOutreach, useUnmarkApplied, useUnsaveJob,
} from "@pinkslip/data";
import { useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { router, usePathname } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert } from "react-native";
import { toast, UNDO_TOAST_DURATION } from "../../kit";
import type { GlyphMenuItem, GlyphMenuSpec } from "../../ui";
import { haptics } from "../../platform/haptics";
import { shareJob } from "../../platform/share";
import { ApplicationBrowser, type ApplicationRequest } from "../apply/ApplicationBrowser";
import { OutreachSheet } from "../apply/OutreachSheet";
import { cachedJob, type AnyJob } from "../jobs/cached-job";
import { useTrack } from "../jobs/track";
import { ReportJobSheet } from "../redesign/ReportJobSheet";
import { ReportSheet } from "./ReportSheet";

export type DetailJob = AnyJob & Partial<Job>;

/** Which tab the job is open in, so related screens push onto the same stack. */
function useTabGroup(): "(jobs)" | "(library)" {
  return usePathname().startsWith("/library") ? "(library)" : "(jobs)";
}

/** The job for its page: the personal copy, else the public one, else the row
 * it was opened from, so the page draws at once. Opening it marks it read. */
export function useDetailJob(jobId: string) {
  const queryClient = useQueryClient();
  const publicJob = usePublicJob(jobId);
  const personal = useJob(jobId);
  const seed = useMemo(() => cachedJob(queryClient, jobId), [queryClient, jobId]);
  const job: DetailJob | undefined = personal.data ?? publicJob.data ?? seed;
  const markViewed = useMarkViewed();
  const track = useTrack();

  useEffect(() => {
    markViewed(jobId);
    track("job_opened", { type: "job", id: jobId });
  }, [jobId, markViewed, track]);

  const status: "ready" | "loading" | "gone" | "error" = job ? "ready"
    : personal.isPending || publicJob.isPending ? "loading"
    : personal.isError && publicJob.data === null ? "gone" : "error";
  return {
    job,
    status,
    /** The full posting has loaded, not just the row it was opened from. */
    full: Boolean(personal.data ?? publicJob.data),
    /** Neither copy of the full posting came back, so stop waiting for it. */
    failed: !personal.data && !publicJob.data && personal.isError && !publicJob.isPending,
    pendingDescription: Boolean(personal.data?.content_pending && !personal.data.description && personal.isFetching),
    retryDescription: () => void personal.refetch(),
    retry: () => { void personal.refetch(); void publicJob.refetch(); },
  };
}

export interface JobMenuItem {
  label: string;
  /** An SF Symbol. */
  icon: string;
  destructive?: boolean;
  run: () => void;
}

/**
 * Everything a job page does: Save, Apply (Safari over the app, or the
 * application browser with auto-apply), the More menu, and the sheets those
 * open. Render `sheets` once on the page.
 */
export interface JobPageActionOptions {
  outreachThread?: string;
  controlsColor: string;
  /** The redesign asks "Did you apply?" and prepares an assisted
   * application in its own sheets; today's page uses the system alert. */
  ownSheets?: boolean;
}

export function useJobPageActions(job: DetailJob, { outreachThread, controlsColor, ownSheets = false }: JobPageActionOptions) {
  const group = useTabGroup();
  const session = useSession().data;
  const features = session?.me?.features;
  const admin = Boolean(session?.me?.is_admin);
  const autoApply = Boolean(features?.auto_apply_enabled);
  const autoSubmit = Boolean(features?.auto_submit_enabled);
  const outreach = Boolean(features?.outreach_enabled);
  const save = useSaveJob();
  const unsave = useUnsaveJob();
  const markApplied = useMarkApplied();
  const unmarkApplied = useUnmarkApplied();
  const hideJob = useHideJob();
  const hideCompany = useHideCompany();
  const block = useBlockJob();
  const track = useTrack();
  const api = useApi();
  const [applying, setApplying] = useState<ApplicationRequest | null>(null);
  const [reporting, setReporting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [emailing, setEmailing] = useState(Boolean(outreachThread && outreach && !ownSheets));
  const startOutreach = useStartOutreach();
  // The redesign writes to a person from their page (Paper O2): a reminder's
  // link opens that page, and "Email recruiter" starts the thread there.
  const openPerson = (threadId: string) => router.push({ pathname: `/(tabs)/${group}/people/[threadId]` as "/(tabs)/(jobs)/people/[threadId]", params: { threadId } });
  useEffect(() => {
    if (!outreachThread || !outreach) return;
    if (ownSheets) openPerson(outreachThread);
    else setEmailing(true);
    // A reminder's link opens it once.
  }, [outreachThread, outreach]);
  const emailRecruiter = () => {
    if (!ownSheets) {
      setEmailing(true);
      return;
    }
    startOutreach.mutate(job.id, {
      onSuccess: (thread) => openPerson(thread.id),
      onError: () => toast.error("Couldn't find someone to write to. Try again."),
    });
  };

  const saved = Boolean(job.saved);
  const applied = Boolean(job.applied);
  const closed = Boolean(job.closed_at);
  const asJob = job as Job;

  const setApplied = (value: boolean) => (value ? markApplied : unmarkApplied).mutate(asJob, {
    // The page's button says where it stands, so no toast.
    onSuccess: () => { if (value) haptics.success(); },
    onError: () => toast.error("Couldn't update this job. Try again."),
  });
  /** The board confirmed it, or you said so (Paper 2.5): the stub tears into
   * Tracker, and the toast says where it went, with Undo. */
  const appliedThroughBrowser = () => markApplied.mutate(asJob, {
    onSuccess: () => {
      haptics.success();
      toast.show({ message: `Applied to ${job.company_name}. It's in Tracker.`, icon: "done", duration: UNDO_TOAST_DURATION,
        action: { label: "Undo", run: () => setApplied(false) } });
    },
    onError: () => toast.error("Couldn't mark it applied. Try again."),
  });
  const toggleSave = () => {
    haptics.tap();
    (saved ? unsave : save).mutate(job.id, { onError: () => toast.error("Couldn't update your saved jobs. Try again.") });
  };

  /** Safari opens over the app; closing it asks whether you applied, since
   * opening a posting alone never marks it applied. */
  const openApplication = async () => {
    if (!job.url) return;
    track("apply_clicked", { type: "job", id: job.id, properties: autoApply ? { source: "prep" } : {} });
    await WebBrowser.openBrowserAsync(job.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET, controlsColor });
    if (applied) return;
    if (ownSheets) {
      setAsking(true);
      return;
    }
    Alert.alert("Did you apply?", `${job.title} at ${job.company_name}`, [
      { text: "Not yet", style: "cancel" },
      { text: "Yes, I applied", onPress: () => setApplied(true) },
    ]);
  };

  /** With auto-apply, the form opens in the application browser, which reads,
   * fills and (when allowed) submits it; a confirmed submission marks the job
   * applied. */
  const startAutoApply = async () => {
    track("apply_clicked", { type: "job", id: job.id, properties: { source: "auto_apply" } });
    const prepared = await api.apply.prepare(job.id).catch(() => null);
    const url = prepared?.apply_url ?? job.url;
    if (url) setApplying({ jobId: job.id, url, autoSubmit, company: job.company_name });
  };

  const leave = () => { if (router.canGoBack()) router.back(); };
  const notInterested = () => hideJob(job.id).then((hidden) => {
    leave();
    toast.show({ message: "Job hidden", icon: "hide", duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => hidden.undo().catch(() => { toast.error("Couldn't bring that job back."); }) } });
  }, () => toast.error("Couldn't hide this job. Try again."));
  // Reported closed: out of your Jobs without a second toast over "Report sent".
  const hideQuietly = () => { hideJob(job.id).then(leave, () => undefined); };
  const hideTheCompany = () => {
    if (!job.company_id) return;
    hideCompany(job.company_id).then((hidden) => {
      leave();
      toast.show({ message: `${job.company_name} hidden`, icon: "hide", duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => hidden.undo().catch(() => { toast.error("Couldn't bring that company back."); }) } });
    }, () => toast.error("Couldn't hide this company. Try again."));
  };
  const confirmBlock = () => Alert.alert("Block this job?", `This permanently removes ${job.title} at ${job.company_name} for everyone.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Block job", style: "destructive", onPress: () => block.mutate(job.id, {
      onSuccess: () => { leave(); toast.success("Job blocked for everyone"); },
      onError: () => toast.error("Couldn't block this job. Try again."),
    }) },
  ]);

  const menu = [
    applied ? { label: "I didn't apply", icon: "arrow.uturn.backward", run: () => setApplied(false) } : { label: "I applied", icon: "checkmark.circle", run: () => setApplied(true) },
    !applied && { label: "Not interested", icon: "hand.thumbsdown", run: notInterested },
    outreach && { label: "Email recruiter", icon: "envelope", run: emailRecruiter },
    { label: "Tailor resume", icon: "sparkles", run: () => router.push({ pathname: `/(tabs)/${group}/tailor/[jobId]`, params: { jobId: job.id } }) },
    { label: "Share", icon: "square.and.arrow.up", run: () => void shareJob(job) },
    job.company_id && { label: `Hide ${job.company_name}`, icon: "eye.slash", run: hideTheCompany },
    { label: "Report listing", icon: "flag", run: () => setReporting(true) },
    admin && { label: "Block for everyone", icon: "nosign", destructive: true, run: confirmBlock },
  ].filter((item): item is JobMenuItem => Boolean(item));

  // The redesigned page's ⋯ (Paper "Menus · Oct 16" M2): Save and Hide as
  // icons across the top (Hide was "Not interested"), the rest with words,
  // Block on its own. Share is beside ⋯ already, so it isn't here.
  const glyphMenu: GlyphMenuSpec = {
    top: [
      { id: "save", title: saved ? "Saved" : "Save", glyph: saved ? "saved" : "save", onSelect: toggleSave },
      !applied && { id: "hide", title: "Hide", glyph: "hide", onSelect: () => void notInterested() },
    ].filter((item): item is GlyphMenuItem => Boolean(item)),
    items: [
      applied
        ? { id: "unapply", title: "I didn't apply", glyph: "undo", onSelect: () => setApplied(false) }
        : { id: "apply", title: "I applied", glyph: "applied", onSelect: () => setApplied(true) },
      outreach && { id: "email", title: "Email recruiter", glyph: "email", onSelect: emailRecruiter },
      { id: "tailor", title: "Tailor resume", glyph: "tailor", onSelect: () => router.push({ pathname: `/(tabs)/${group}/tailor/[jobId]`, params: { jobId: job.id } }) },
      job.company_id && { id: "company", title: `Hide ${job.company_name}`, glyph: "company", onSelect: hideTheCompany },
      { id: "report", title: "Report listing", glyph: "report", onSelect: () => setReporting(true) },
    ].filter((item): item is GlyphMenuItem => Boolean(item)),
    last: admin ? [{ id: "block", title: "Block for everyone", glyph: "block", destructive: true, onSelect: confirmBlock }] : [],
  };

  const sheets: ReactNode = <>
    {autoApply && <ApplicationBrowser request={applying}
      onClose={(result) => {
        setApplying(null);
        // Closed with no confirmation: ask, as Safari's posting does.
        if (result === "closed" && !applied && ownSheets) setAsking(true);
      }}
      onSubmitted={appliedThroughBrowser} onConfirmApplied={appliedThroughBrowser} />}
    {ownSheets
      ? <ReportJobSheet jobId={job.id} open={reporting} onClosed={() => setReporting(false)} onReportedClosed={hideQuietly} />
      : <ReportSheet jobId={job.id} open={reporting} onOpenChange={setReporting} />}
    {outreach && !ownSheets && <OutreachSheet jobId={job.id} companyName={job.company_name} threadId={outreachThread ?? null} open={emailing} onOpenChange={setEmailing} />}
  </>;

  return {
    saved,
    applied,
    closed,
    toggleSave,
    apply: () => (autoApply ? (ownSheets ? setPreparing(true) : void startAutoApply()) : void openApplication()),
    /** The Apply sheets (with `ownSheets`): "Did you apply?" after the
     * posting closes, and the assisted application's preparation. */
    applyFlow: {
      asking,
      endAsking: () => setAsking(false),
      preparing,
      endPreparing: () => setPreparing(false),
      confirmApplied: () => setApplied(true),
      openAssisted: () => void startAutoApply(),
    },
    share: () => void shareJob(job),
    menu,
    glyphMenu,
    sheets,
  };
}
