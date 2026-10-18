import type { DetectedStage, InboundEmail } from "@pinkslip/core/api";
import { useAssignInboundEmail, useDismissInboundEmail, useInboxEmails } from "@pinkslip/data";
import { FlashList } from "@shopify/flash-list";
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { haptics } from "../../../platform/haptics";
import {
  Button, Choice, Choices, EmptyState, IconButton, JobRow, SectionHeader, SheetHeader, SheetModal, SheetStep, Text, useSheet, useTabBarScroll, useTabBarSpace,
} from "../../../ui";
import { plainText } from "../job-facts";
import { groupOf, stageGroupLabels } from "../tracker-facts";
import { logoUri } from "../../jobs/CompanyLogo";
import { emailAge, emailCompany, emailHeadline, emailSubject } from "./email-facts";

export interface JobEmailsActions {
  openApplication: (applicationId: string) => void;
  /** "Which application?": one or several, or none of them. */
  assign: (emailId: string, applicationIds: string[]) => Promise<void>;
  dismiss: (emailId: string) => Promise<void>;
}

type Item = { kind: "section"; key: string; title: string; count: number } | { kind: "email"; key: string; email: InboundEmail };

/** This month, then each month before it by name. */
function monthTitle(iso: string, now: Date): string {
  const date = new Date(iso);
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return "This month";
  return date.toLocaleDateString("en-US", { month: "long", ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

/** Job emails (Paper 4B-3, owner 2026-10-14): what forwarded email did,
 * newest first, in Today's rows. A row opens its application; one waiting on
 * "Which application?" carries the pink dot and asks. */
export function JobEmailsView({ emails, loading = false, failed = false, onRetry, actions }: {
  emails: readonly InboundEmail[] | undefined;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  actions: JobEmailsActions;
}) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const tabBarScroll = useTabBarScroll();
  const tabSpace = useTabBarSpace();
  const [asking, setAsking] = useState<InboundEmail | null>(null);
  const items = useMemo<Item[]>(() => {
    const now = new Date();
    const months = new Map<string, InboundEmail[]>();
    for (const email of emails ?? []) {
      const title = monthTitle(email.received_at, now);
      months.set(title, [...months.get(title) ?? [], email]);
    }
    return [...months].flatMap(([title, list]): Item[] => [
      { kind: "section", key: `section-${title}`, title, count: list.length },
      ...list.map((email): Item => ({ kind: "email", key: email.id, email })),
    ]);
  }, [emails]);

  const header = <View style={{ paddingTop: insets.top }}>
    <View style={styles.nav}><IconButton icon="back" label="Back" onPress={() => router.back()} /></View>
    <View style={styles.title}><Text role="title1" accessibilityRole="header">Job emails</Text></View>
  </View>;

  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <FlashList {...tabBarScroll} data={items} keyExtractor={(item) => item.key} getItemType={(item) => item.kind}
      style={styles.fill} contentContainerStyle={{ paddingBottom: tabSpace + 24 }}
      ListHeaderComponent={header}
      renderItem={({ item, index }) => item.kind === "section"
        ? <SectionHeader title={item.title} count={item.count} first={index === 0} />
        : <EmailRow email={item.email} onPress={() => {
          if (item.email.status === "needs_choice") setAsking(item.email);
          else if (item.email.application_id) actions.openApplication(item.email.application_id);
        }} />}
      ListEmptyComponent={<View style={styles.empty}>
        {loading ? <ActivityIndicator color={theme.ui.color["ink-3"]} />
          : failed ? <EmptyState title="Job emails didn't load" message="Check your connection and try again."
            action={onRetry ? { label: "Try again", variant: "secondary", onPress: onRetry } : undefined} />
          : <EmptyState title="Nothing yet" message="Emails from companies show up here once they're forwarded." />}
      </View>} />
    <WhichApplicationSheet email={asking} onClosed={() => setAsking(null)} actions={actions} />
  </>;
}

function EmailRow({ email, onPress }: { email: InboundEmail; onPress: () => void }) {
  const tappable = email.status === "needs_choice" || Boolean(email.application_id);
  return <JobRow headline="news" company={emailCompany(email)} title={emailHeadline(email)} facts={emailSubject(email)}
    age={emailAge(email)} needsYou={email.status === "needs_choice"} logo={{ name: emailCompany(email), uri: logoUri(email.company_domain) }}
    onPress={tappable ? onPress : undefined} />;
}

/** What the email said, as the sheet's second sentence. */
const said: Record<DetectedStage, string> = {
  applied: "It said they got your application.",
  assessment: "It said there's an assessment.",
  interview: "It said you're moving on to interviews.",
  offer: "It said there's an offer.",
  rejected: "It said they're not moving forward.",
};

/** "Which application?" (Paper 5A, owner 2026-10-14): the email's sender and
 * subject, the candidates to pick any of, then Save; or None of these. */
export function WhichApplicationSheet({ email, onClosed, actions }: {
  email: InboundEmail | null;
  onClosed: () => void;
  actions: Pick<JobEmailsActions, "assign" | "dismiss">;
}) {
  return <SheetModal open={email !== null} onClosed={onClosed}>
    {email ? <WhichApplication email={email} actions={actions} /> : null}
  </SheetModal>;
}

function WhichApplication({ email, actions }: { email: InboundEmail; actions: Pick<JobEmailsActions, "assign" | "dismiss"> }) {
  const sheet = useSheet();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      haptics.success();
      sheet.close();
    } catch {
      Alert.alert("Couldn't save that", "Check your connection and try again.");
      setBusy(false);
    }
  };
  return <SheetStep id={`which-${email.id}`}>
    <View style={styles.lead}>
      <SheetHeader title="Which application?" />
      <Text tone="ink-2">{`${emailCompany(email)} wrote ${emailSubject(email)} and didn't name the role. ${said[email.detected_stage]}`}</Text>
    </View>
    <Choices>
      {email.candidates.map((candidate) => <Choice key={candidate.id} multiple title={plainText(candidate.title)}
        detail={stageGroupLabels[groupOf(candidate.stage)]}
        selected={picked.has(candidate.id)} onPress={() => toggle(candidate.id)} />)}
    </Choices>
    <View style={styles.answers}>
      <Button variant="primary" fullWidth disabled={picked.size === 0} pending={busy}
        onPress={() => void run(() => actions.assign(email.id, [...picked]))}>Save</Button>
      <Button variant="text" fullWidth disabled={busy} onPress={() => void run(() => actions.dismiss(email.id))}>None of these</Button>
    </View>
  </SheetStep>;
}

/** Job emails on the live inbox. */
export function JobEmailsPage() {
  const emails = useInboxEmails();
  const assign = useAssignInboundEmail();
  const dismiss = useDismissInboundEmail();
  return <JobEmailsView emails={emails.data} loading={emails.isPending} failed={emails.isError} onRetry={() => void emails.refetch()} actions={{
    openApplication: (applicationId) => router.push({ pathname: "/(tabs)/(library)/applications/[applicationId]", params: { applicationId } }),
    assign: async (emailId, applicationIds) => {
      await assign.mutateAsync({ emailId, applicationIds });
    },
    dismiss: async (emailId) => {
      await dismiss.mutateAsync(emailId);
    },
  }} />;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  nav: { paddingHorizontal: theme.ui.size.gutter, height: 44, justifyContent: "center" },
  title: { paddingHorizontal: theme.ui.size.gutter, paddingBottom: theme.ui.space["2"] },
  empty: { minHeight: 320, alignItems: "center", justifyContent: "center", paddingHorizontal: theme.ui.space["8"] },
  lead: { gap: theme.ui.space["2"] },
  answers: { gap: theme.ui.space["2"] },
}));
