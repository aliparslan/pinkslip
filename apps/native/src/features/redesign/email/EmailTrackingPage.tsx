import { forwardingProviderNames } from "@pinkslip/domain/email-tracking";
import type { ForwardingProvider, InboundEmail, Inbox } from "@pinkslip/core/api";
import { useInbox, useInboxEmails, useRotateInbox } from "@pinkslip/data";
import { router, Stack } from "expo-router";
import { useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { Button, Icon, ListGroup, ListItem, PAGE_BAR, PageBar, Text, faces, toast, useCopy, useTabBarScroll, useTabBarSpace } from "../../../ui";
import { jobEmailsThisMonth, shortAddress, sinceLastEmail, trackingState, type TrackingState } from "./email-facts";
import { useEmailTrackingPrefs, type EmailTrackingPrefs } from "./email-prefs";
import { EmailSetupSheet, useEmailSetupActions, type EmailSetupActions, type SetupStart } from "./SetupSheet";

export interface EmailTrackingActions extends EmailSetupActions {
  /** A new address; the old one stops working. */
  replace: () => Promise<void>;
  openEmails: () => void;
}

export interface EmailTrackingViewProps {
  inbox: Inbox | undefined;
  emails: readonly InboundEmail[] | undefined;
  prefs: EmailTrackingPrefs;
  actions: EmailTrackingActions;
}

/** You → Email tracking (Paper 4B, owner 2026-10-14): a quiet status. The
 * numbers open Job emails; then the address to copy, how to set it up, and
 * Replace address, which asks first. What emails change shows on each
 * application and in Today. */
export function EmailTrackingView({ inbox, emails, prefs, actions }: EmailTrackingViewProps) {
  const insets = useSafeAreaInsets();
  const tabBarScroll = useTabBarScroll();
  const tabSpace = useTabBarSpace();
  const state = trackingState(inbox, prefs.started);
  const [setup, setSetup] = useState<SetupStart | null>(null);
  const replace = () => Alert.alert("Replace your address?", "The old one stops working right away. You'll forward to the new one.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Replace", style: "destructive", onPress: () => void actions.replace().then(() => {
        actions.remember({ started: false });
        setSetup("computer");
      }, () => toast.error("Couldn't replace it. Try again.")),
    },
  ]);
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView {...tabBarScroll} style={styles.fill} contentContainerStyle={[styles.content, { paddingTop: insets.top + PAGE_BAR + 8, paddingBottom: tabSpace + 24 }]}>
      <View style={styles.body}>
        <Text role="title1" accessibilityRole="header">Email tracking</Text>
        <Status state={state} inbox={inbox} emails={emails} provider={prefs.provider}
          onOpenEmails={actions.openEmails} onSetUp={() => setSetup("provider")} />
      </View>
      {inbox ? <ListGroup surface="fill" footer="Updates from email show on each application and in Today.">
        <AddressRow address={inbox.address} />
        <ListItem title="How to set it up" value={forwardingProviderNames[prefs.provider ?? "gmail"].split(" ")[0]} accessory="chevron"
          onPress={() => setSetup(prefs.provider ? "computer" : "provider")} />
        <ListItem title="Replace address" onPress={replace} />
      </ListGroup> : null}
    </ScrollView>
    <PageBar />
    <EmailSetupSheet open={setup !== null} onClosed={() => setSetup(null)} start={setup ?? "provider"} inbox={inbox} prefs={prefs} actions={actions} />
  </>;
}

function Status({ state, inbox, emails, provider, onOpenEmails, onSetUp }: {
  state: TrackingState;
  inbox: Inbox | undefined;
  emails: readonly InboundEmail[] | undefined;
  provider: ForwardingProvider | null;
  onOpenEmails: () => void;
  onSetUp: () => void;
}) {
  if (state === "off") {
    return <Card>
      <Text weight="medium">Off</Text>
      <View style={styles.setUp}><Button variant="outline" size="small" onPress={onSetUp}>Set it up</Button></View>
    </Card>;
  }
  if (state === "waiting") {
    return <Card>
      <Text weight="medium">Waiting for the first email</Text>
      <Text role="subhead" tone="ink-2">{provider === "school"
        ? "Many schools block forwarding. If nothing comes in a day, try the email you apply with."
        : "It shows here once forwarding works."}</Text>
    </Card>;
  }
  const since = sinceLastEmail(inbox?.last_email_at ?? null);
  return <Pressable onPress={onOpenEmails} accessibilityRole="button" accessibilityLabel="Job emails"
    style={({ pressed }) => [styles.card, styles.numbers, pressed && styles.pressed]}>
    <Stat value={emails ? String(jobEmailsThisMonth(emails)) : "–"} label="job emails this month" />
    {since ? <Stat value={since} label="since the last email" /> : null}
    <View style={styles.spacer} />
    <Icon name="disclosure" size={12} tone="ink-4" />
  </Pressable>;
}

function Card({ children }: { children: ReactNode }) {
  return <View style={[styles.card, styles.stack]}>{children}</View>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View>
    <RNText style={styles.number} maxFontSizeMultiplier={1.4}>{value}</RNText>
    <Text role="footnote" tone="ink-3">{label}</Text>
  </View>;
}

/** The address, cut short, with the copy mark; the row copies it. */
function AddressRow({ address }: { address: string }) {
  const { copied, copy } = useCopy(address);
  return <ListItem title="Your address" value={shortAddress(address)} onPress={copy}
    trailing={<Icon name={copied ? "done" : "copy"} size={16} tone="ink-3" />} />;
}

/** The status page on the live inbox. */
export function EmailTrackingPage() {
  const inbox = useInbox();
  const emails = useInboxEmails();
  const rotate = useRotateInbox();
  const prefs = useEmailTrackingPrefs();
  const setup = useEmailSetupActions();
  return <EmailTrackingView inbox={inbox.data} emails={emails.data} prefs={prefs} actions={{
    ...setup,
    replace: async () => {
      await rotate.mutateAsync();
    },
    openEmails: () => router.push("/you/email-history"),
  }} />;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  content: { gap: theme.ui.space["6"] },
  // The title sits right under Back, as on Job emails.
  body: { paddingHorizontal: theme.ui.size.gutter, gap: theme.ui.space["6"] },
  card: { borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"], padding: theme.ui.space["4"] },
  stack: { gap: theme.ui.space["1"] },
  numbers: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["6"] },
  pressed: { opacity: 0.6 },
  spacer: { flex: 1 },
  setUp: { paddingTop: theme.ui.space["2"] },
  // The numbers are Founders, read at a glance like the Today numbers.
  number: { fontFamily: faces.display, fontSize: 28, lineHeight: 34, color: theme.ui.color.ink },
}));
