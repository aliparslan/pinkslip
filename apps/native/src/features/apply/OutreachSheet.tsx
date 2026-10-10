import { ApiError } from "@pinkslip/core/api";
import { nextOutreachMessage, outreachMailtoUrl, type OutreachMessage, type OutreachThread } from "@pinkslip/domain/outreach";
import { useOutreachAction, useOutreachThread } from "@pinkslip/data";
import * as Clipboard from "expo-clipboard";
import { CheckCircle, Copy, EnvelopeSimple, WarningCircle } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, EmptyState, IconButton, Input, Sheet, Spinner, Stack, Text, Textarea, toast } from "../../kit";
import { haptics } from "../../platform/haptics";

const STEP_LABELS = ["First email", "Follow-up", "Last follow-up"] as const;
const CLOSED: Record<string, string> = { replied: "They replied", stopped: "Follow-ups stopped", finished: "All sent" };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function stepState(message: OutreachMessage): string {
  if (message.status === "sent" && message.sent_at) return `Sent ${when(message.sent_at)}`;
  if (message.status === "scheduled" && message.due_at) return `Due ${when(message.due_at)}`;
  if (message.status === "skipped") return "Skipped";
  return "";
}

/** The recruiter email (`OutreachSheet.svelte`): the draft and two
 * follow-ups. You send from Mail, then confirm "I sent it", which schedules
 * the next one. A reminder opens this from the job with `?outreach=`. */
export function OutreachSheet({ jobId, companyName, threadId, open, onOpenChange }: {
  jobId: string;
  companyName: string;
  threadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const thread = useOutreachThread(jobId, threadId, open);
  const noContact = thread.error instanceof ApiError && thread.error.code === "no_contacts";
  return <Sheet open={open} onOpenChange={onOpenChange} title={`Email ${companyName}`}
    subtitle={thread.data ? `To ${thread.data.contact.name || thread.data.contact.email}` : undefined}>
    {thread.isPending ? <View style={styles.loading}><Spinner label="Loading email" /></View>
      : thread.isError ? <EmptyState icon={WarningCircle} title={noContact ? `No recruiter found for ${companyName} yet` : "Couldn't load this email"}
        actions={noContact ? undefined : <Button pending={thread.isFetching} onPress={() => void thread.refetch()}>Try again</Button>} />
      : <Composer jobId={jobId} threadId={threadId} thread={thread.data} onClose={() => onOpenChange(false)} />}
  </Sheet>;
}

function Composer({ jobId, threadId, thread, onClose }: { jobId: string; threadId: string | null; thread: OutreachThread; onClose: () => void }) {
  const { theme } = useUnistyles();
  const action = useOutreachAction(jobId, threadId);
  const next = nextOutreachMessage(thread);
  const [subject, setSubject] = useState(next?.subject ?? "");
  const [body, setBody] = useState(next?.body ?? "");
  const [opened, setOpened] = useState(false);
  const shown = useRef(next?.id);

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
    try { await action.mutateAsync({ kind: "edit", messageId: next.id, subject, body }); return true; } catch { failed(); return false; }
  };
  const openInMail = async () => {
    if (!(await saveEdits())) return;
    await Linking.openURL(outreachMailtoUrl(thread.contact.email, { subject, body })).catch(() => toast.error("Couldn't open Mail. Copy the email instead."));
    setOpened(true);
  };
  const copy = async () => {
    await Clipboard.setStringAsync(`${thread.contact.email}\n${subject}\n\n${body}`);
    haptics.tap();
    toast.success("Copied");
  };
  const markSent = async () => {
    if (!next || !(await saveEdits())) return;
    action.mutate({ kind: "sent", messageId: next.id, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, { onSuccess: () => haptics.success(), onError: failed });
  };
  const busy = action.isPending;
  const notDueYet = Boolean(next?.due_at && Date.parse(next.due_at) > Date.now());

  return <Stack gap="4">
    {thread.contact.test && <Text size="sm" tone="warn">Test recipient: {thread.contact.email}</Text>}
    <Stack gap="2">
      {thread.messages.map((message) => <View key={message.id} style={styles.step}>
        {message.status === "sent" ? <CheckCircle size={16} weight="fill" color={theme.colors.good} /> : <View style={styles.dot} />}
        <Text size="sm" weight={message.id === next?.id ? "medium" : "regular"} tone={message.id === next?.id ? "ink" : "ink-3"}>{STEP_LABELS[message.step]}</Text>
        <Text size="sm" tone="ink-3">{stepState(message)}</Text>
      </View>)}
    </Stack>
    {next ? <>
      <Input accessibilityLabel="Subject" value={subject} editable={!busy} onChangeText={setSubject} onBlur={() => void saveEdits()} />
      <Textarea accessibilityLabel="Message" value={body} editable={!busy} onChangeText={setBody} onBlur={() => void saveEdits()} style={{ minHeight: 220 }} />
      <View style={styles.actions}>
        <IconButton icon={Copy} label="Copy email" disabled={busy} onPress={() => void copy()} />
        {opened && <Button disabled={busy} onPress={() => void openInMail()}>Open again</Button>}
        <View style={styles.primary}>
          {opened ? <Button variant="primary" icon={CheckCircle} fullWidth pending={busy} onPress={() => void markSent()}>I sent it</Button>
            : <Button variant="primary" icon={EnvelopeSimple} fullWidth pending={busy} onPress={() => void openInMail()}>{notDueYet ? "Send early in Mail" : "Open in Mail"}</Button>}
        </View>
      </View>
      <View style={styles.secondary}>
        {thread.status === "draft"
          ? <Text tone="accent" onPress={busy ? undefined : () => action.mutate({ kind: "discard", threadId: thread.id }, { onSuccess: onClose, onError: failed })}>Discard</Text>
          : <>
            <Text tone="accent" onPress={busy ? undefined : () => action.mutate({ kind: "replied", threadId: thread.id }, { onSuccess: () => toast.success("Follow-ups stopped"), onError: failed })}>They replied</Text>
            <Text tone="accent" onPress={busy ? undefined : () => action.mutate({ kind: "stop", threadId: thread.id }, { onSuccess: () => toast.success("Follow-ups stopped"), onError: failed })}>Stop follow-ups</Text>
          </>}
      </View>
    </> : <Text tone="ink-2">{CLOSED[thread.status] ?? ""}</Text>}
  </Stack>;
}

const styles = StyleSheet.create((theme) => ({
  loading: { alignItems: "center", paddingVertical: 48 },
  step: { flexDirection: "row", alignItems: "center", gap: theme.space["2"] },
  dot: { width: 10, height: 10, marginHorizontal: 3, borderRadius: 5, borderWidth: 1.5, borderColor: theme.colors["ink-3"] },
  actions: { flexDirection: "row", alignItems: "center", gap: theme.space["2"] },
  primary: { flex: 1 },
  secondary: { flexDirection: "row", justifyContent: "center", gap: theme.space["5"] },
}));
