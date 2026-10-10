import { useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Job } from "@pinkslip/core/api";
import {
  queryKeys, useBlockJob, useHideJob, useMarkApplied, useMarkViewed, useSaveJob, useSession, useSetViewed,
  useUnmarkApplied, useUnsaveJob,
} from "@pinkslip/data";
import { AlertDialog, toast, UNDO_TOAST_DURATION } from "../../kit";
import type { JobRowActions, JobRowJob } from "./JobRow";

export type JobListContext = "feed" | "saved" | "applied";

/** What the person can do from here. Behind the access code only the public
 * catalog is readable. A visitor without a session reads the full feed (as
 * the API's catalog account) and can save, which starts a guest session;
 * everything else needs a session (owner, 2026-10-10). */
const subscribeNever = () => () => {};

export function useSessionAccess() {
  const session = useSession().data;
  // The server never knows the session, so the first browser render doesn't
  // either: personal controls appear right after hydration, not during it.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const state = hydrated ? session?.state : undefined;
  return {
    state,
    personal: state === "guest" || state === "authenticated",
    canRead: state === "guest" || state === "authenticated" || state === "anonymous",
    admin: hydrated && Boolean(session?.me?.is_admin),
  };
}

/** After a visitor's first change the API has made them a guest; reload the
 * session so the page switches to their personal data. */
export function usePromoteVisitor() {
  const queryClient = useQueryClient();
  const { state } = useSessionAccess();
  return () => {
    if (state === "anonymous") void queryClient.invalidateQueries({ queryKey: queryKeys.session() });
  };
}

// Rows in personal lists are full jobs; public rows only reach the actions
// that need an id.
const full = (job: JobRowJob) => job as Job;

/** Row actions for a job list, wired to the data hooks with the current
 * app's feedback: a toast per change, Undo for the ones that remove a row,
 * and a confirmation before an admin blocks a job for everyone. Render
 * `dialog` once next to the list. */
export function useJobActions(context: JobListContext) {
  const access = useSessionAccess();
  const promote = usePromoteVisitor();
  const save = useSaveJob();
  const unsave = useUnsaveJob();
  const markApplied = useMarkApplied();
  const unmarkApplied = useUnmarkApplied();
  const setViewed = useSetViewed();
  const hideJob = useHideJob();
  const block = useBlockJob();
  const markViewed = useMarkViewed();
  const [blockCandidate, setBlockCandidate] = useState<JobRowJob | null>(null);

  const saveJob = (job: JobRowJob) => save.mutate(job.id, {
    onSuccess: () => { toast.success("Job saved"); promote(); },
    onError: () => toast.error("Couldn't save that job. Try again."),
  });

  const actions: JobRowActions = !access.canRead ? {} : {
    onSave: context === "feed" ? saveJob : undefined,
    onUnsave: context === "saved" ? (job) => unsave.mutate(job.id, {
      onSuccess: () => toast.show({
        message: "Removed from saved",
        duration: UNDO_TOAST_DURATION,
        action: { label: "Undo", run: () => saveJob(job) },
      }),
      onError: () => toast.error("Couldn't update your saved jobs. Try again."),
    }) : undefined,
    onMarkApplied: context === "saved" ? (job) => markApplied.mutate(full(job), {
      onSuccess: () => toast.success("Added to applied jobs"),
      onError: () => toast.error("Couldn't mark that job as applied. Try again."),
    }) : undefined,
    onUnmarkApplied: context === "applied" ? (job) => unmarkApplied.mutate(full(job), {
      onSuccess: () => toast.show({
        message: "Moved back to your feed",
        duration: UNDO_TOAST_DURATION,
        action: { label: "Undo", run: () => markApplied.mutate(full(job)) },
      }),
      onError: () => toast.error("Couldn't update that job. Try again."),
    }) : undefined,
    onToggleRead: context === "feed" && access.personal
      ? (job, viewed) => setViewed.mutate({ id: job.id, viewed }, {
        onError: () => toast.error("Couldn't update that job. Try again."),
      })
      : undefined,
    onHide: context === "feed" && access.personal ? (job) => {
      hideJob(job.id).then((hidden) => {
        promote();
        toast.show({
          message: "Job hidden",
          duration: UNDO_TOAST_DURATION,
          action: { label: "Undo", run: () => hidden.undo().catch(() => { toast.error("Couldn't bring that job back."); }) },
        });
      }, () => toast.error("Couldn't hide that job. Try again."));
    } : undefined,
    onBlock: context === "feed" && access.admin ? setBlockCandidate : undefined,
  };

  const dialog = <AlertDialog
    open={blockCandidate !== null}
    onOpenChange={(open) => { if (!open) setBlockCandidate(null); }}
    title="Block this job?"
    description={blockCandidate ? `This permanently removes ${blockCandidate.title} at ${blockCandidate.company_name} for everyone.` : ""}
    confirmLabel="Block job"
    tone="danger"
    pending={block.isPending}
    onConfirm={() => {
      if (!blockCandidate) return;
      block.mutate(blockCandidate.id, {
        onSuccess: () => { setBlockCandidate(null); toast.success("Job blocked for everyone"); },
        onError: () => toast.error("Couldn't block that job. Try again."),
      });
    }}
  />;

  // Opening a job marks it read. Without a session that would create one, so
  // visitors' reads aren't recorded.
  const onOpen = access.personal ? (job: JobRowJob) => markViewed(job.id) : undefined;

  return { actions, dialog, onOpen, access };
}
