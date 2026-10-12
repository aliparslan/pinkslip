import type { Job } from "@pinkslip/core/api";
import {
  useApi, useBlockJob, useHideCompany, useHideJob, useJob, useMarkApplied, useMarkViewed, usePublicJob, useSaveJob, useSession,
  useUnmarkApplied, useUnsaveJob,
} from "@pinkslip/data";
import { useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { router, usePathname } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert } from "react-native";
import { toast, UNDO_TOAST_DURATION } from "../../kit";
import { haptics } from "../../platform/haptics";
import { shareJob } from "../../platform/share";
import { ApplicationBrowser, type ApplicationRequest } from "../apply/ApplicationBrowser";
import { OutreachSheet } from "../apply/OutreachSheet";
import { cachedJob, type AnyJob } from "../jobs/cached-job";
import { useTrack } from "../jobs/track";
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
export function useJobPageActions(job: DetailJob, { outreachThread, controlsColor }: { outreachThread?: string; controlsColor: string }) {
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
  const [emailing, setEmailing] = useState(Boolean(outreachThread && outreach));
  useEffect(() => { if (outreachThread && outreach) setEmailing(true); }, [outreachThread, outreach]);

  const saved = Boolean(job.saved);
  const applied = Boolean(job.applied);
  const closed = Boolean(job.closed_at);
  const asJob = job as Job;

  const setApplied = (value: boolean) => (value ? markApplied : unmarkApplied).mutate(asJob, {
    onSuccess: () => { if (value) haptics.success(); toast.success(value ? "Added to applied jobs" : "Removed from applied jobs"); },
    onError: () => toast.error("Couldn't update this job. Try again."),
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
    if (url) setApplying({ jobId: job.id, url, autoSubmit });
  };

  const leave = () => { if (router.canGoBack()) router.back(); };
  const notInterested = () => hideJob(job.id).then((hidden) => {
    leave();
    toast.show({ message: "Job hidden", duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => hidden.undo().catch(() => { toast.error("Couldn't bring that job back."); }) } });
  }, () => toast.error("Couldn't hide this job. Try again."));
  const hideTheCompany = () => {
    if (!job.company_id) return;
    hideCompany(job.company_id).then((hidden) => {
      leave();
      toast.show({ message: `${job.company_name} hidden`, duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => hidden.undo().catch(() => { toast.error("Couldn't bring that company back."); }) } });
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
    outreach && { label: "Email recruiter", icon: "envelope", run: () => setEmailing(true) },
    { label: "Tailor resume", icon: "sparkles", run: () => router.push({ pathname: `/(tabs)/${group}/tailor/[jobId]`, params: { jobId: job.id } }) },
    { label: "Share", icon: "square.and.arrow.up", run: () => void shareJob(job) },
    job.company_id && { label: `Hide ${job.company_name}`, icon: "eye.slash", run: hideTheCompany },
    { label: "Report listing", icon: "flag", run: () => setReporting(true) },
    admin && { label: "Block for everyone", icon: "nosign", destructive: true, run: confirmBlock },
  ].filter((item): item is JobMenuItem => Boolean(item));

  const sheets: ReactNode = <>
    {autoApply && <ApplicationBrowser request={applying} onClose={() => setApplying(null)}
      onSubmitted={() => markApplied.mutate(asJob, { onSuccess: () => { haptics.success(); toast.success("Added to applied jobs"); } })} />}
    <ReportSheet jobId={job.id} open={reporting} onOpenChange={setReporting} />
    {outreach && <OutreachSheet jobId={job.id} companyName={job.company_name} threadId={outreachThread ?? null} open={emailing} onOpenChange={setEmailing} />}
  </>;

  return {
    saved,
    applied,
    closed,
    toggleSave,
    apply: () => (autoApply ? void startAutoApply() : void openApplication()),
    share: () => void shareJob(job),
    menu,
    sheets,
  };
}
