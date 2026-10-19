import type { Application } from "@pinkslip/core/api";
import { outreachMailtoUrl, type OutreachThread } from "@pinkslip/domain/outreach";
import { useApplications, useOutreachThreadById, useOutreachUpdate } from "@pinkslip/data";
import * as Clipboard from "expo-clipboard";
import { router, Stack, useIsFocused, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, ScrollView, Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { haptics } from "../../../platform/haptics";
import {
  Button, CompanyLogo, EmptyState, faces, Floating, GlyphMenu, Icon, PAGE_BAR, PageBar, SheetModal, SheetStep, Text, toast, useCopy, useSheet,
  useTabBarStepsAside, useToastLift,
  type GlyphMenuItem,
} from "../../../ui";
import { logoUri } from "../../jobs/CompanyLogo";
import { plainText } from "../job-facts";
import { companyName, jobTitle, shortDate } from "../tracker-facts";
import { emailRows, firstName, initials, linkedinPath, unsentFirst } from "./outreach-facts";
import { followUpsSetting, signatureSetting } from "./outreach-prefs";

export interface PersonActions {
  /** Opens your mail app with the email written. */
  write: (thread: OutreachThread) => Promise<void>;
  markSent: (messageId: string) => Promise<void>;
  markReplied: () => Promise<void>;
  stop: () => Promise<void>;
  openApplication: (application: Application) => void;
}

/**
 * A person is a page (owner, 2026-10-15, Paper O2, O4 and O5): who they are,
 * the emails at the top once one's sent, how to reach them (Email to copy,
 * then LinkedIn), and the application at their company. "Write to Dana" is pinned until the first
 * email goes; the mail app opens with it written, and coming back asks "Did
 * you send it?".
 */
export function PersonView({ thread, applications, actions }: { thread: OutreachThread; applications: Application[]; actions: PersonActions }) {
  const insets = useSafeAreaInsets();
  const draft = unsentFirst(thread);
  const copy = useCopy(thread.contact.email);
  const [asking, setAsking] = useState(false);
  const away = useRef(false);
  const left = useRef(false);
  // Only while in front: left open on another tab's stack, it hid that tab's bar.
  useTabBarStepsAside(useIsFocused());
  useToastLift(draft ? Math.max(insets.bottom, 16) + 62 : Math.max(insets.bottom, 16));
  // Back from the mail app: did it go?
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") left.current = true;
      if (state === "active" && away.current && left.current) {
        away.current = false;
        setAsking(true);
      }
    });
    return () => subscription.remove();
  }, []);
  const write = async () => {
    away.current = true;
    left.current = false;
    await actions.write(thread).catch(() => {
      away.current = false;
      toast.error("No mail app opened. The address is copied.");
      void Clipboard.setStringAsync(thread.contact.email);
    });
    // Nothing left the app (no mail app answered): ask here.
    setTimeout(() => {
      if (away.current && !left.current) {
        away.current = false;
        setAsking(true);
      }
    }, 900);
  };
  const rows = emailRows(thread);
  const company = plainText(thread.company_name);
  const at = applications.filter((application) => companyName(application).toLowerCase() === company.toLowerCase() && application.stage !== "saved");
  // An action menu, so each item carries its icon (M2).
  const menu: GlyphMenuItem[] = thread.status === "active" ? [
    { id: "replied", title: "They replied", glyph: "read", onSelect: () => void actions.markReplied() },
    { id: "stop", title: "Don't follow up", glyph: "remove", onSelect: () => void actions.stop() },
  ] : [];
  return <View style={styles.fill}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + PAGE_BAR + 8, paddingBottom: (draft ? 62 + Math.max(insets.bottom, 16) : insets.bottom) + 32 }]}>
      <View style={styles.who}>
        <View style={styles.avatar}><RNText style={styles.initials} maxFontSizeMultiplier={1.3}>{initials(thread.contact.name)}</RNText></View>
        <View style={styles.whoText}>
          <Text role="subhead" weight="medium" tone="ink-2" lines={1}>{[thread.contact.title, company].filter(Boolean).join(" · ")}</Text>
          <Text role="title2" accessibilityRole="header">{thread.contact.name}</Text>
        </View>
      </View>
      {rows.length > 0 ? <View style={styles.section}>
        <View style={styles.label}><Text role="footnote" weight="medium" tone="ink-2">Emails</Text></View>
        {rows.map((row) => <View key={row.id} style={styles.email}>
          <View style={[styles.dot, row.sent ? styles.dotSent : styles.dotPlanned]} />
          <View style={styles.flex}>
            <Text weight={row.sent ? "medium" : "regular"} tone={row.sent ? "ink" : "ink-2"}>{row.label}</Text>
            {row.detail ? <Text role="subhead" tone="ink-2" lines={1}>{plainText(row.detail)}</Text> : null}
          </View>
          <Text role="subhead" tone="ink-3">{row.when}</Text>
        </View>)}
      </View> : null}
      <View style={styles.card}>
        <Pressable onPress={copy.copy}
          accessibilityRole="button" accessibilityLabel={`Email, ${thread.contact.email}, copy`} style={({ pressed }) => [styles.field, pressed && styles.pressed]}>
          <View style={styles.flex}>
            <Text role="footnote" tone="ink-3">Email</Text>
            <Text lines={1}>{thread.contact.email}</Text>
          </View>
          <Icon name={copy.copied ? "done" : "copy"} size={16} tone="ink-3" />
        </Pressable>
        {thread.contact.linkedin_url ? <>
          <View style={styles.rule} />
          <Pressable onPress={() => void Linking.openURL(thread.contact.linkedin_url!)}
            accessibilityRole="link" accessibilityLabel={`LinkedIn, ${thread.contact.name}`} style={({ pressed }) => [styles.field, pressed && styles.pressed]}>
            <View style={styles.flex}>
              <Text role="footnote" tone="ink-3">LinkedIn</Text>
              <Text lines={1}>{linkedinPath(thread.contact.linkedin_url)}</Text>
            </View>
            <Icon name="disclosure" size={12} tone="ink-4" />
          </Pressable>
        </> : null}
      </View>
      {at.length > 0 ? <View style={styles.section}>
        <View style={[styles.label, styles.labelRow]}>
          <Text role="footnote" weight="medium" tone="ink-2">{`Applied at ${company}`}</Text>
          <Text role="footnote" tone="ink-3">{String(at.length)}</Text>
        </View>
        {at.map((application) => <Pressable key={application.id} onPress={() => actions.openApplication(application)} accessibilityRole="button"
          style={({ pressed }) => [styles.application, pressed && styles.pressed]}>
          <CompanyLogo name={application.company_name} uri={logoUri(application.company_domain ?? application.job?.company_domain)} />
          <View style={styles.flex}>
            <Text weight="medium" lines={1}>{jobTitle(application)}</Text>
            {application.applied_at ? <Text role="subhead" tone="ink-2">{`Applied ${shortDate(application.applied_at)}`}</Text> : null}
          </View>
          <Icon name="disclosure" size={12} tone="ink-4" />
        </Pressable>)}
      </View> : null}
    </ScrollView>
    <PageBar actions={menu.length > 0 ? <Floating>
      <GlyphMenu items={menu}>
        <View style={styles.more} accessibilityRole="button" accessibilityLabel="More"><Icon name="more" size={22} /></View>
      </GlyphMenu>
    </Floating> : undefined} />
    {draft ? <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Button variant="primary" fullWidth onPress={() => void write()}>{`Write to ${firstName(thread.contact.name)}`}</Button>
    </View> : null}
    <SheetModal open={asking} onClosed={() => setAsking(false)}>
      {draft ? <DidYouSend onYes={() => void actions.markSent(draft.id).then(() => haptics.success(), () => toast.error("Couldn't save that. Try again."))} /> : null}
    </SheetModal>
  </View>;
}

/** O4: the "Did you apply?" sheet, word for word in shape. */
function DidYouSend({ onYes }: { onYes: () => void }) {
  const { close } = useSheet();
  return <SheetStep id="sent" grabber={false}>
    <View style={styles.askHeader}>
      <View style={styles.flex}>
        <Text role="title1" accessibilityRole="header">Did you send it?</Text>
        <Text role="subhead" tone="ink-2">Pinkslip will remind you to follow up.</Text>
      </View>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={6} style={styles.close}>
        <Icon name="close" size={16} tone="ink-2" />
      </Pressable>
    </View>
    <View style={styles.actions}>
      <Button variant="primary" fullWidth onPress={() => { onYes(); close(); }}>Yes, I sent it</Button>
      <Button fullWidth onPress={close}>Not yet</Button>
    </View>
  </SheetStep>;
}

/** A person's page on the live account, by thread. */
export function PersonPage({ threadId }: { threadId: string }) {
  const tab = (useSegments() as readonly string[])[1] ?? "(jobs)";
  const thread = useOutreachThreadById(threadId);
  const applications = useApplications();
  const update = useOutreachUpdate();
  if (!thread.data) {
    return <View style={[styles.fill, styles.center]}>
      <Stack.Screen options={{ headerShown: false }} />
      {thread.isError ? <EmptyState title="This didn't load" message="Check your connection and try again."
        action={{ label: "Try again", variant: "secondary", onPress: () => void thread.refetch() }} /> : null}
      <PageBar />
    </View>;
  }
  const current = thread.data;
  return <PersonView thread={current} applications={applications.data ?? []} actions={{
    write: async (person) => {
      const message = unsentFirst(person);
      if (!message) return;
      // Your signature from Outreach settings, when the draft doesn't end with it.
      const signature = signatureSetting();
      const body = signature && !message.body.trimEnd().endsWith(signature) ? `${message.body.trimEnd()}\n\n${signature}` : message.body;
      await Linking.openURL(outreachMailtoUrl(person.contact.email, { subject: message.subject, body }));
    },
    markSent: async (messageId) => {
      await update.mutateAsync({ kind: "sent", messageId, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      // Follow-ups off: none get planned.
      if (followUpsSetting() === "off") await update.mutateAsync({ kind: "stop", threadId: current.id });
    },
    markReplied: async () => { await update.mutateAsync({ kind: "replied", threadId: current.id }); },
    stop: async () => { await update.mutateAsync({ kind: "stop", threadId: current.id }); },
    openApplication: (application) => router.push({ pathname: `/(tabs)/${tab}/applications/[applicationId]` as "/(tabs)/(library)/applications/[applicationId]", params: { applicationId: application.id } }),
  }} />;
}

const AVATAR = 40;

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  center: { justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  content: { gap: theme.ui.space["6"] },
  more: { width: theme.ui.size.iconButton, height: theme.ui.size.iconButton, alignItems: "center", justifyContent: "center" },
  who: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter },
  whoText: { flex: 1, gap: 2 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  initials: { fontFamily: faces.display, fontSize: 15, lineHeight: 18, color: theme.ui.color["ink-2"] },
  section: { gap: theme.ui.space["1"] },
  label: { paddingHorizontal: theme.ui.size.gutter },
  labelRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  email: { flexDirection: "row", alignItems: "flex-start", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 8, marginHorizontal: 4 },
  dotSent: { backgroundColor: theme.ui.color.ink },
  dotPlanned: { borderWidth: 1.5, borderColor: theme.ui.color["ink-4"] },
  card: { marginHorizontal: theme.ui.size.gutter, paddingHorizontal: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  field: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: 10 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: theme.ui.color.separator },
  application: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter },
  pressed: { opacity: 0.6 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter, backgroundColor: theme.ui.color.bg },
  askHeader: { flexDirection: "row", alignItems: "flex-start", gap: theme.ui.space["3"] },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  actions: { gap: theme.ui.space["2"] },
}));
