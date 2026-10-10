import type { Job } from "@pinkslip/core/api";
import {
  useBlockJob, useHideJob, useMarkApplied, useMarkViewed, useSaveJob, useSession, useSetViewed, useUnmarkApplied, useUnsaveJob,
} from "@pinkslip/data";
import { Alert } from "react-native";
import { toast, UNDO_TOAST_DURATION } from "../../kit";
import { haptics } from "../../platform/haptics";

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

  const saveJob = (job: RowJob) => {
    haptics.tap();
    save.mutate(job.id, {
      onSuccess: () => toast.success("Job saved"),
      onError: () => toast.error("Couldn't save that job. Try again."),
    });
  };

  const actions: JobActions = {
    save: context === "feed" ? saveJob : undefined,
    unsave: context === "saved" ? (job) => unsave.mutate(job.id, {
      onSuccess: () => toast.show({ message: "Removed from saved", duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => saveJob(job) } }),
      onError: () => toast.error("Couldn't update your saved jobs. Try again."),
    }) : undefined,
    markApplied: context === "saved" ? (job) => markApplied.mutate(job, {
      onSuccess: () => { haptics.success(); toast.success("Added to applied jobs"); },
      onError: () => toast.error("Couldn't mark that job as applied. Try again."),
    }) : undefined,
    unmarkApplied: context === "applied" ? (job) => unmarkApplied.mutate(job, {
      onSuccess: () => toast.show({ message: "Moved back to your feed", duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => markApplied.mutate(job) } }),
      onError: () => toast.error("Couldn't update that job. Try again."),
    }) : undefined,
    toggleRead: context === "feed" ? (job, viewed) => setViewed.mutate({ id: job.id, viewed }, {
      onError: () => toast.error("Couldn't update that job. Try again."),
    }) : undefined,
    hide: context === "feed" ? (job) => {
      hideJob(job.id).then((hidden) => toast.show({
        message: "Job hidden", duration: UNDO_TOAST_DURATION,
        action: { label: "Undo", run: () => hidden.undo().catch(() => { toast.error("Couldn't bring that job back."); }) },
      }), () => toast.error("Couldn't hide that job. Try again."));
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
