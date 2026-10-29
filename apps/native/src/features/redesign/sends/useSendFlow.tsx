import { ApiError, type ApplySend } from "@pinkslip/core/api";
import {
  queryKeys, useAnswerSend, useApplySends, useResumeProfile, useSendCode, useSendResume, useSession, useStartSend, useUploadSendResume,
} from "@pinkslip/data";
import { useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { router, useSegments } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SheetModal, toast, type ApplyState } from "../../../ui";
import { haptics } from "../../../platform/haptics";
import { localResumeFile } from "../../../platform/resume-file";
import type { DetailJob } from "../../job-detail/useJobPage";
import { plainText } from "../job-facts";
import { askedNeeds, followedSend, refusal, sendButtonState, SENDABLE } from "../send-facts";
import { CodeSheet, NeedsSheet, type SendJob } from "./SendSheets";

/** Sends need their own copy of the resume on the server; the first one
 * uploads the PDF kept on this iPhone. False when there's none to upload. */
function useEnsureSendResume(enabled: boolean) {
  const server = useSendResume(enabled);
  const upload = useUploadSendResume();
  return async (): Promise<boolean> => {
    if (server.data) return true;
    const local = localResumeFile();
    if (!local) return false;
    await upload.mutateAsync({ pdf: await new File(local.uri).arrayBuffer(), name: local.name });
    return true;
  };
}

/** A refusal's toast, or the way to its fix (Paper S7). */
function showRefusal(error: unknown, company: string, retry: () => void) {
  const code = error instanceof ApiError ? error.code : undefined;
  const data = error instanceof ApiError ? error.data as { limit?: number; resets_at?: string } | undefined : undefined;
  const outcome = refusal(code, company, data);
  if (outcome.kind === "resume") return openResume();
  if (outcome.error) {
    toast.error(outcome.message, outcome.retry ? { action: { label: "Try again", run: retry } } : {});
    return;
  }
  toast.show({ message: outcome.message, icon: outcome.icon });
}

/** No PDF to send: Resume's Import a PDF. */
function openResume() {
  toast.show({ message: "Add your resume to send applications", icon: "resume" });
  router.push("/you/resume");
}

/** Starts a send, the resume going up first when the server has none. */
function useBegin(enabled: boolean) {
  const start = useStartSend();
  const ensureResume = useEnsureSendResume(enabled);
  const [preparing, setPreparing] = useState(false);
  const begin = async (jobId: string, company: string, dryRun: boolean, onStarted?: (send: ApplySend) => void) => {
    setPreparing(true);
    try {
      if (!await ensureResume()) {
        openResume();
        return;
      }
    } catch {
      toast.error("Couldn't add your resume for sends. Try again.");
      return;
    } finally {
      setPreparing(false);
    }
    start.mutate({ jobId, dryRun }, {
      onSuccess: (send) => {
        haptics.tap();
        onStarted?.(send);
      },
      onError: (error) => showRefusal(error, company, () => void begin(jobId, company, dryRun, onStarted)),
    });
  };
  return { begin, starting: preparing || start.isPending };
}

/**
 * Auto-apply's sends on the job page (Paper "Send screens · the missing
 * states · Oct 24"). The job page is the send page: one button follows the
 * send, pink when the next move is yours, and its sheets ask what the send
 * needs. Greenhouse and Ashby only; everything else keeps plain Apply.
 * `state` is null when sends don't apply, so the page keeps its own button.
 */
export function useSendFlow(job: DetailJob, { applied, closed, applyMyself }: { applied: boolean; closed: boolean; applyMyself: () => void }) {
  const queryClient = useQueryClient();
  const session = useSession().data;
  const enabled = Boolean(session?.me?.features?.auto_apply_send_enabled);
  const admin = Boolean(session?.me?.is_admin);
  const sendable = enabled && SENDABLE.has(job.source_type ?? "") && !closed;
  const sends = useApplySends(sendable);
  const send = followedSend(sends.data, job.id);
  const { begin, starting } = useBegin(sendable);
  const answer = useAnswerSend();
  const code = useSendCode();
  // Where Greenhouse sent its code: read only while a send waits for one.
  const email = useResumeProfile(sendable && send?.status === "code_needed").data?.data?.contact?.email ?? null;
  const [sheet, setSheet] = useState<"needs" | "code" | null>(null);
  const tab = (useSegments() as readonly string[])[1] ?? "(jobs)";
  const company = plainText(job.company_name);

  // A send that went out makes the job applied on the server; the page and
  // Tracker hear about it now rather than on their next refresh.
  const lastStatus = useRef(send?.status);
  useEffect(() => {
    if (send?.status !== lastStatus.current && (send?.status === "submitted" || send?.status === "unconfirmed")) {
      if (send.status === "submitted") haptics.success();
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.job(job.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.applicationsRoot });
    }
    // The code went in: its sheet has done its job.
    if (sheet === "code" && send?.status !== "code_needed") setSheet(null);
    lastStatus.current = send?.status;
  }, [send?.status, sheet, job.id, queryClient]);

  const openSend = (sendId: string) => router.push({ pathname: `/(tabs)/${tab}/sends/[sendId]` as "/(tabs)/(jobs)/sends/[sendId]", params: { sendId } });
  const go = (dryRun: boolean) => void begin(job.id, company, dryRun);

  let state: ApplyState | null = null;
  if (sendable && !applied) state = starting ? { kind: "opening" } : sendButtonState(send, company) ?? { kind: "applyForMe" };

  const onPress = (): (() => void) | undefined => {
    if (!state || !send && state.kind !== "applyForMe") return undefined;
    switch (state.kind) {
      case "applyForMe": return () => go(false);
      case "checked": return () => openSend(send!.id);
      case "code": return () => setSheet("code");
      case "needsYou": return () => setSheet("needs");
      case "finishOnPhone": return applyMyself;
      case "didntSend": return () => go(send!.dry_run);
      case "sent": return () => openSend(send!.id);
      default: return undefined;
    }
  };

  const sendJob: SendJob = { company, domain: job.company_domain, title: plainText(job.title) };
  const sheets: ReactNode = send ? <>
    <SheetModal open={sheet === "needs" && send.status === "needs_you"} onClosed={() => setSheet(null)}>
      <NeedsSheet key={send.id} job={sendJob} needs={askedNeeds(send)} dryRun={send.dry_run} pending={answer.isPending}
        onSend={(answers) => answer.mutate({ sendId: send.id, answers }, {
          onSuccess: () => setSheet(null),
          onError: (error) => showRefusal(error, company, () => undefined),
        })} />
    </SheetModal>
    <SheetModal open={sheet === "code" && send.status === "code_needed"} onClosed={() => setSheet(null)}>
      <CodeSheet key={send.id} job={sendJob} email={email} pending={code.isPending || (code.isSuccess && send.status === "code_needed")}
        failed={code.isError} onSend={(value) => code.mutate({ sendId: send.id, code: value })} />
    </SheetModal>
  </> : null;

  return {
    /** The button for the send, or null to keep the page's own. */
    state,
    onPress: onPress(),
    /** Check first, in Apply for me's caret: for admins while sends are theirs. */
    onCheckFirst: state?.kind === "applyForMe" && admin ? () => go(true) : undefined,
    sheets,
  };
}

/** Check first's Send to {company}: a real send of the same job, then back
 * to the job page, whose button follows it. */
export function useSendForReal() {
  const session = useSession().data;
  const { begin, starting } = useBegin(Boolean(session?.me?.features?.auto_apply_send_enabled));
  return {
    sending: starting,
    send: (checked: ApplySend) => void begin(checked.job_id, checked.company ?? "the company", false, () => {
      if (router.canGoBack()) router.back();
    }),
  };
}
