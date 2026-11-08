import type { Job } from "@pinkslip/core/api";
import {
  useBlockJob, useHideJob, useMarkApplied, useMarkViewed, useSaveJob, useSession, useSetViewed, useStopSend, useUnmarkApplied, useUnsaveJob,
} from "@pinkslip/data";
import { Alert } from "react-native";
import { toast, UNDO_TOAST_DURATION } from "../../ui";
import { haptics } from "../../platform/haptics";
import { askToKeepSaves } from "../account/keep-saves";
import { plainText } from "../redesign/job-facts";
import { useBeginSend } from "../redesign/sends/useSendFlow";

export type JobListContext = "feed" | "saved" | "applied";

/** What a row needs: a feed or library job. */
export type RowJob = Job;

export interface JobActions {
  save?: (job: RowJob) => void;
  unsave?: (job: RowJob) => void;
  markApplied?: (job: RowJob) => void;
  unmarkApplied?: (job: RowJob) => void;
  toggleRead?: (job: RowJob, viewed: boolean) => void;
  hide?: (job: RowJob) => void;
  block?: (job: RowJob) => void;
  /** Queues a real send without opening the job (owner, 2026-11-04: from a
   * long press); only for jobs Pinkslip's browser can send. */
  applyForMe?: (job: RowJob) => void;
}

/** The native app always has a session (a guest on first launch). */
export function useSessionAccess() {
  const session = useSession().data;
  return {
    state: session?.state,
    signedIn: session?.state === "authenticated",
    admin: Boolean(session?.me?.is_admin),
  };
}

/** Row actions with the web app's feedback: a toast each, Undo for the ones
 * that take the row away, a system confirmation before an admin block. */
export function useJobActions(context: JobListContext) {
  const access = useSessionAccess();
  const save = useSaveJob();
  const unsave = useUnsaveJob();
  const markApplied = useMarkApplied();
  const unmarkApplied = useUnmarkApplied();
  const setViewed = useSetViewed();
  const hideJob = useHideJob();
  const block = useBlockJob();
  const markViewed = useMarkViewed();
  const sends = Boolean(useSession().data?.me?.features?.auto_apply_send_enabled);
  const { begin } = useBeginSend(sends && context !== "applied");
  const stopSend = useStopSend();

  const saveJob = (job: RowJob) => {
    haptics.tap();
    // The bookmark fills (and a swipe's capsule says Save), so no toast.
    save.mutate(job.id, { onSuccess: () => askToKeepSaves(access.signedIn), onError: () => toast.error("Couldn't save that job. Try again.") });
  };

  const actions: JobActions = {
    // From a long press or Queue on a swipe it sends a real application with
    // nothing to review, so it comes with Undo, as Hide does (owner,
    // 2026-11-08). Undo stops the send before Submit; one already pressing
    // Submit carries on.
    applyForMe: sends && context !== "applied" ? (job) => void begin(job.id, job.company_name, false, (send) => {
      toast.show({
        message: `Applying to ${plainText(job.company_name)}`, icon: "autoApply", duration: UNDO_TOAST_DURATION,
        action: { label: "Undo", run: () => stopSend.mutate(send.id, {
          onSuccess: () => toast.show({ message: "Stopped. Nothing was sent", icon: "autoApply" }),
          onError: () => toast.error("Couldn't stop it. Try again."),
        }) },
      });
    }) : undefined,
    save: context === "feed" ? saveJob : undefined,
    // In Library the row leaves, so it gets Undo; in the feed it stays.
    unsave: context === "saved" ? (job) => unsave.mutate(job.id, {
      onSuccess: () => toast.show({ message: "Removed from Saved", icon: "saved", duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => saveJob(job) } }),
      onError: () => toast.error("Couldn't update your saved jobs. Try again."),
    }) : context === "feed" ? (job) => {
      haptics.tap();
      unsave.mutate(job.id, { onError: () => toast.error("Couldn't update your saved jobs. Try again.") });
    } : undefined,
    markApplied: context === "saved" ? (job) => markApplied.mutate(job, {
      onSuccess: () => { haptics.success(); toast.success("Added to applied jobs"); },
      onError: () => toast.error("Couldn't mark that job as applied. Try again."),
    }) : context === "feed" ? (job) => markApplied.mutate(job, {
      // The row leaves Jobs for Tracker. One light tap, as Save has: the
      // success buzz from a row read as jitter (owner, 2026-11-07).
      onSuccess: () => haptics.tap(),
      onError: () => toast.error("Couldn't mark that job as applied. Try again."),
    }) : undefined,
    unmarkApplied: context === "applied" ? (job) => unmarkApplied.mutate(job, {
      onSuccess: () => toast.show({ message: "Moved back to Jobs", icon: "jobs", duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => markApplied.mutate(job) } }),
      onError: () => toast.error("Couldn't update that job. Try again."),
    }) : context === "feed" ? (job) => unmarkApplied.mutate(job, {
      onError: () => toast.error("Couldn't update that job. Try again."),
    }) : undefined,
    toggleRead: context === "feed" ? (job, viewed) => setViewed.mutate({ id: job.id, viewed }, {
      onError: () => toast.error("Couldn't update that job. Try again."),
    }) : undefined,
    // The toast comes with the row leaving, not after the server answers
    // (owner, 2026-11-07); Undo waits for the hide to land, then reverses it.
    hide: context === "feed" ? (job) => {
      const hiding = hideJob(job.id);
      const shown = toast.show({
        message: "Job hidden", icon: "hide", duration: UNDO_TOAST_DURATION,
        action: { label: "Undo", run: () => hiding.then((hidden) => hidden.undo()).catch(() => { toast.error("Couldn't bring that job back."); }) },
      });
      hiding.catch(() => {
        toast.dismiss(shown);
        toast.error("Couldn't hide that job. Try again.");
      });
    } : undefined,
    block: context === "feed" && access.admin ? (job) => Alert.alert("Block this job?",
      `This permanently removes ${job.title} at ${job.company_name} for everyone.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Block job", style: "destructive", onPress: () => block.mutate(job.id, {
          onSuccess: () => toast.success("Job blocked for everyone"),
          onError: () => toast.error("Couldn't block that job. Try again."),
        }) },
      ]) : undefined,
  };

  return { actions, onOpen: (job: RowJob) => markViewed(job.id), access };
}
