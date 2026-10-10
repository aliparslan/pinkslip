import { useEffect, useRef, useState } from "react";
import { CheckCircle, Copy, EnvelopeSimple } from "@phosphor-icons/react";
import { ApiError } from "@pinkslip/core/api";
import { nextOutreachMessage, outreachMailtoUrl, type OutreachMessage, type OutreachThread } from "@pinkslip/domain/outreach";
import { useOutreachAction, useOutreachThread } from "@pinkslip/data";
import { Alert, Button, Dialog, IconButton, Input, Spinner, Stack, Text, Textarea, toast } from "../../kit";
import styles from "./Apply.module.css";

const STEP_LABELS = ["First email", "Follow-up", "Last follow-up"] as const;
const CLOSED: Record<string, string> = { replied: "They replied", stopped: "Follow-ups stopped", finished: "All sent" };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function stepState(message: OutreachMessage): string {
  if (message.status === "sent" && message.sent_at) return `Sent ${when(message.sent_at)}`;
  if (message.status === "scheduled" && message.due_at) return `Due ${when(message.due_at)}`;
  if (message.status === "skipped") return "Skipped";
  return "";
}

/** `OutreachSheet.svelte`: a cold email to the company's recruiter and up to
 * two follow-ups. The person sends it from their own mail app ("Open in
 * Mail"), then confirms "I sent it", which schedules the next follow-up.
 * A reminder links to the job with `?outreach=<thread>` to open this. */
export function OutreachDialog({ jobId, companyName, threadId, open, onOpenChange }: {
  jobId: string;
  companyName: string;
  threadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const thread = useOutreachThread(jobId, threadId, open);
  const noContact = thread.error instanceof ApiError && thread.error.code === "no_contacts";
  return <Dialog open={open} onOpenChange={onOpenChange} size="md" title={`Email ${companyName}`}
    subtitle={thread.data ? `To ${thread.data.contact.name || thread.data.contact.email}` : undefined}>
    {thread.isPending ? <div className={styles.loading}><Spinner size={20} label="Loading email" /></div>
      : thread.isError ? <Stack gap="3">
        <Alert tone="error">{noContact ? `No recruiter found for ${companyName} yet.` : "Couldn't load this email."}</Alert>
        {!noContact && <Button fullWidth pending={thread.isFetching} onClick={() => void thread.refetch()}>Try again</Button>}
      </Stack>
      : <Composer jobId={jobId} threadId={threadId} thread={thread.data} onClose={() => onOpenChange(false)} />}
  </Dialog>;
}

function Composer({ jobId, threadId, thread, onClose }: { jobId: string; threadId: string | null; thread: OutreachThread; onClose: () => void }) {
  const action = useOutreachAction(jobId, threadId);
  const next = nextOutreachMessage(thread);
  const [subject, setSubject] = useState(next?.subject ?? "");
  const [body, setBody] = useState(next?.body ?? "");
  const [opened, setOpened] = useState(false);
  const shown = useRef(next?.id);

  // A new step (after "I sent it") brings its own draft.
  useEffect(() => {
    if (next && next.id !== shown.current) {
      shown.current = next.id;
      setSubject(next.subject);
      setBody(next.body);
      setOpened(false);
    }
  }, [next]);

  const failed = () => toast.error("Couldn't update this email. Try again.");
  const dirty = Boolean(next && (subject !== next.subject || body !== next.body));
  const saveEdits = async () => {
    if (!next || !dirty) return true;
    try {
      await action.mutateAsync({ kind: "edit", messageId: next.id, subject, body });
      return true;
    } catch {
      failed();
      return false;
    }
  };
  const openInMail = async () => {
    if (!(await saveEdits())) return;
    window.location.href = outreachMailtoUrl(thread.contact.email, { subject, body });
    setOpened(true);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${thread.contact.email}\n${subject}\n\n${body}`);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy. Select the text instead.");
    }
  };
  const markSent = async () => {
    if (!next || !(await saveEdits())) return;
    action.mutate({ kind: "sent", messageId: next.id, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, { onError: failed });
  };
  const notDueYet = Boolean(next?.due_at && Date.parse(next.due_at) > Date.now());
  const busy = action.isPending;

  return <Stack gap="4">
    {thread.contact.test && <Alert tone="warning">Test recipient: {thread.contact.email}</Alert>}
    <ol className={styles.steps} aria-label="Emails">
      {thread.messages.map((message) => <li key={message.id} className={styles.step} data-current={message.id === next?.id || undefined}>
        {message.status === "sent" ? <CheckCircle size={16} weight="fill" aria-hidden className={styles.done} /> : <span className={styles.dot} aria-hidden />}
        <Text as="span" size="sm" weight={message.id === next?.id ? "medium" : "regular"}>{STEP_LABELS[message.step]}</Text>
        <Text as="span" size="sm" tone="ink-3">{stepState(message)}</Text>
      </li>)}
    </ol>
    {next ? <>
      <Input aria-label="Subject" value={subject} disabled={busy} onChange={(event) => setSubject(event.target.value)} onBlur={() => void saveEdits()} />
      <Textarea aria-label="Message" rows={10} value={body} disabled={busy} onChange={(event) => setBody(event.target.value)} onBlur={() => void saveEdits()} />
      <div className={styles.composerActions}>
        <IconButton icon={Copy} label="Copy email" surface disabled={busy} onClick={() => void copy()} />
        {opened && <Button disabled={busy} onClick={() => void openInMail()}>Open again</Button>}
        {opened
          ? <Button variant="primary" icon={CheckCircle} pending={busy} onClick={() => void markSent()}>I sent it</Button>
          : <Button variant="primary" icon={EnvelopeSimple} pending={busy} onClick={() => void openInMail()}>{notDueYet ? "Send early in Mail" : "Open in Mail"}</Button>}
      </div>
      <div className={styles.secondary}>
        {thread.status === "draft"
          ? <button type="button" className={styles.textButton} disabled={busy}
            onClick={() => action.mutate({ kind: "discard", threadId: thread.id }, { onSuccess: onClose, onError: failed })}>Discard</button>
          : <>
            <button type="button" className={styles.textButton} disabled={busy}
              onClick={() => action.mutate({ kind: "replied", threadId: thread.id }, { onSuccess: () => toast.success("Follow-ups stopped"), onError: failed })}>They replied</button>
            <button type="button" className={styles.textButton} disabled={busy}
              onClick={() => action.mutate({ kind: "stop", threadId: thread.id }, { onSuccess: () => toast.success("Follow-ups stopped"), onError: failed })}>Stop follow-ups</button>
          </>}
      </div>
    </> : <Text tone="ink-2">{CLOSED[thread.status] ?? ""}</Text>}
  </Stack>;
}
