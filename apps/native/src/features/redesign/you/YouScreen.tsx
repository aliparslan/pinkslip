import { normalizeSearchProfile } from "@pinkslip/domain/search-profile";
import { useAnswers, useInbox, usePreferences, usePushSettings, useResumeProfile, useSession } from "@pinkslip/data";
import Constants from "expo-constants";
import { router, Stack, type Href } from "expo-router";
import * as Updates from "expo-updates";
import { useState } from "react";
import { Pressable, ScrollView, Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { Menu } from "../../../kit";
import { useLocalResumeFile } from "../../../platform/resume-file";
import { setAppearancePreference, useAppearancePreference, type AppearancePreference } from "../../../theme/appearance";
import { faces, Icon, IconTile, ListGroup, ListItem, Text } from "../../../ui";
import { useDevicePush } from "../../alerts/Alerts";
import { EditSearchSheet } from "../EditSearch";
import { trackingState, trackingStateLabels } from "../email/email-facts";
import { useEmailTrackingPrefs } from "../email/email-prefs";
import { redesignKitAvailable } from "../flag";
import { stageSummary } from "../search-draft";

/** The rows that open something. "search" opens the Your search sheet. */
export type YouDestination = "account" | "search" | "email" | "alerts" | "resume" | "answers" | "tailoring" | "plan" | "help" | "admin" | "kit";

export interface YouViewProps {
  /** Null for a guest. */
  person: { name: string; email: string | null } | null;
  /** Each row's current value; undefined while it loads. */
  values: Partial<Record<"search" | "email" | "alerts" | "resume" | "answers" | "plan", string>>;
  appearance: AppearancePreference;
  onAppearance: (preference: AppearancePreference) => void;
  /** Rows only some people see. */
  show: { email: boolean; answers: boolean; plan: boolean; admin: boolean; kit: boolean };
  open: (destination: YouDestination) => void;
}

const appearanceLabels: Record<AppearancePreference, string> = { system: "Automatic", light: "Light", dark: "Dark" };

/** The version and, after an over-the-air update, which update is running:
 * "Pinkslip 1.3.2 · update 01a12c". */
export function appVersionLine() {
  const version = `Pinkslip ${Constants.expoConfig?.version ?? ""}`.trim();
  return Updates.isEnabled && !Updates.isEmbeddedLaunch && Updates.updateId ? `${version} · update ${Updates.updateId.slice(0, 6)}` : version;
}

/** You (Paper "You · Oct 14", B with the B4 tiles, owner 2026-10-14): your
 * name first, then gray cards of settings, each led by a tile colored by what
 * it's for. Appearance opens the iPhone's menu from its row. */
export function YouView({ person, values, appearance, onAppearance, show, open }: YouViewProps) {
  const insets = useSafeAreaInsets();
  return <ScrollView style={styles.fill} contentContainerStyle={[styles.content, { paddingTop: insets.top }]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.header}>
      <View style={styles.nav} />
      <Text role="largeTitle" accessibilityRole="header">You</Text>
    </View>
    <PersonCard person={person} onPress={() => open("account")} />
    <ListGroup surface="fill" inset="leading">
      <ListItem leading={<IconTile icon="editSearch" meaning="find" />} title="Your search" value={values.search} accessory="chevron" onPress={() => open("search")} />
      {show.email ? <ListItem leading={<IconTile icon="email" meaning="find" />} title="Email tracking" value={values.email} accessory="chevron" onPress={() => open("email")} /> : null}
      <ListItem leading={<IconTile icon="notifications" meaning="find" />} title="Alerts" value={values.alerts} accessory="chevron" onPress={() => open("alerts")} />
    </ListGroup>
    <ListGroup surface="fill" inset="leading">
      <ListItem leading={<IconTile icon="resume" meaning="apply" />} title="Resume" value={values.resume} accessory="chevron" onPress={() => open("resume")} />
      {show.answers ? <ListItem leading={<IconTile icon="answers" meaning="apply" />} title="Answers" value={values.answers} accessory="chevron" onPress={() => open("answers")} /> : null}
      <ListItem leading={<IconTile icon="tailor" meaning="apply" />} title="Tailoring" value="Coming soon" accessory="chevron" onPress={() => open("tailoring")} />
    </ListGroup>
    <ListGroup surface="fill" inset="leading">
      {show.plan
        ? <ListItem leading={<IconTile icon="plan" meaning="pro" />} title="Plan" value={values.plan} accessory="chevron" onPress={() => open("plan")} />
        : <ListItem leading={<IconTile icon="plan" meaning="pro" />} title="Plan" value="Soon" />}
      <ListItem leading={<IconTile icon="autoApply" meaning="pro" />} title="Auto-apply" value="Soon" />
      <ListItem leading={<IconTile icon="send" meaning="pro" />} title="Outreach" value="Soon" />
    </ListGroup>
    <ListGroup surface="fill" inset="leading">
      <View>
        <ListItem leading={<IconTile icon="appearance" meaning="app" />} title="Appearance" />
        {/* The menu grows out of what it's opened from and centers on it, so
            its trigger is a clear layer over the row's right side that shows
            only the value: the value goes into the menu, which opens by it,
            and the row stays put. */}
        <View style={styles.menuLayer}>
          <Menu fill title="" items={(["system", "light", "dark"] as const).map((option) => ({
            id: option, title: appearanceLabels[option], checked: appearance === option, onSelect: () => onAppearance(option),
          }))}>
            <View style={styles.menuValue} accessibilityRole="button" accessibilityLabel={`Appearance, ${appearanceLabels[appearance]}`}>
              <Text tone="ink-3" lines={1}>{appearanceLabels[appearance]}</Text>
              <Icon name="pick" size={12} tone="ink-4" />
            </View>
          </Menu>
        </View>
      </View>
      <ListItem leading={<IconTile icon="help" meaning="app" />} title="Help and feedback" accessory="chevron" onPress={() => open("help")} />
    </ListGroup>
    {show.admin || show.kit ? <ListGroup surface="fill" inset="leading">
      {show.admin ? <ListItem leading={<IconTile icon="admin" meaning="app" />} title="Admin" accessory="chevron" onPress={() => open("admin")} /> : null}
      {show.kit ? <ListItem leading={<IconTile icon="kit" meaning="app" />} title="Kit" accessory="chevron" onPress={() => open("kit")} /> : null}
    </ListGroup> : null}
    <View style={styles.version}><Text role="footnote" tone="ink-3" align="center" selectable>{appVersionLine()}</Text></View>
  </ScrollView>;
}

/** Your name and email on a gray card; it opens Account. */
function PersonCard({ person, onPress }: { person: YouViewProps["person"]; onPress: () => void }) {
  const initials = person ? initialsOf(person.name || person.email || "") : "";
  return <View style={styles.cardSlot}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={person ? `Account, ${person.name || person.email}` : "Account, sign in"}
      style={({ pressed }) => [styles.person, pressed && styles.pressed]}>
      <View style={styles.avatar}>
        {initials ? <RNText style={styles.initials} maxFontSizeMultiplier={1.4}>{initials}</RNText> : <Icon name="you" size={26} tone="ink-3" />}
      </View>
      <View style={styles.personText}>
        <Text weight="medium" lines={1}>{person ? person.name || person.email : "Guest"}</Text>
        <Text role="subhead" tone="ink-2" lines={1}>{person ? (person.name ? person.email : null) ?? "Signed in" : "Sign in to sync"}</Text>
      </View>
      <Icon name="disclosure" size={12} tone="ink-4" />
    </Pressable>
  </View>;
}

function initialsOf(name: string): string {
  const words = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
}

/** You on the live account. */
export function YouScreen() {
  const session = useSession();
  const me = session.data?.me;
  const signedIn = session.data?.state === "authenticated";
  const preferences = usePreferences();
  const push = usePushSettings();
  const resume = useResumeProfile();
  const file = useLocalResumeFile();
  const answers = useAnswers(signedIn);
  const emailPrefs = useEmailTrackingPrefs();
  // The inbox is made the first time it's asked for, so only someone who
  // started setting it up asks.
  const inbox = useInbox({ enabled: signedIn && emailPrefs.started });
  const { status: device } = useDevicePush();
  const appearance = useAppearancePreference();
  const [searching, setSearching] = useState(false);

  const resumeData = resume.data?.data;
  const resumeReady = Boolean(resumeData?.contact.name || resumeData?.experience.length || resumeData?.education.length || resumeData?.projects.length);
  const go = (href: Href) => router.push(href);
  const destinations: Record<Exclude<YouDestination, "search">, Href> = {
    account: "/you/account", email: "/you/email", alerts: "/you/alerts", resume: "/you/resume", answers: "/you/answers",
    tailoring: "/you/tailoring", plan: "/you/plan", help: "/you/feedback", admin: "/you/admin", kit: __DEV__ ? "/you/kit" : "/you/kit-redesign",
  };
  return <>
    <YouView
      person={signedIn ? { name: me?.user?.name ?? "", email: me?.account?.email ?? null } : null}
      values={{
        search: preferences.data ? stageSummary(normalizeSearchProfile(preferences.data.search_profile)) : undefined,
        email: !emailPrefs.started ? "Off" : inbox.data ? trackingStateLabels[trackingState(inbox.data, true)] : undefined,
        alerts: push.data === undefined || device === null ? undefined : push.data.enabled ? (device === "denied" ? "Blocked" : "On") : "Off",
        resume: file?.name ?? (resume.data ? (resumeReady ? "Ready" : "Add") : undefined),
        answers: answers.data ? String(answers.data.length) : undefined,
      }}
      appearance={appearance}
      onAppearance={setAppearancePreference}
      // Pro isn't sold yet, so Plan says Soon like the two it pays for.
      show={{ email: signedIn, answers: signedIn, plan: false, admin: Boolean(me?.is_admin), kit: __DEV__ || redesignKitAvailable }}
      open={(destination) => destination === "search" ? setSearching(true) : go(destinations[destination])} />
    <EditSearchSheet open={searching} onClosed={() => setSearching(false)} />
  </>;
}

const styles = StyleSheet.create((theme) => ({
  menuLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: "35%" },
  // Lines up with a row's value: 50 tall, 16 in from the card's edge.
  menuValue: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.ui.space["3"],
    paddingHorizontal: theme.ui.space["4"],
  },
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  content: { gap: theme.ui.space["6"], paddingBottom: theme.ui.space["8"] },
  // Large titles sit 8 under the 44 nav row on every tab.
  header: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter },
  nav: { height: theme.ui.size.iconButton },
  cardSlot: { paddingHorizontal: theme.ui.space["4"] },
  person: {
    flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"],
    paddingVertical: theme.ui.space["3"], paddingHorizontal: theme.ui.space["4"],
    borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"],
  },
  pressed: { backgroundColor: theme.ui.color.fill },
  avatar: { width: 56, height: 56, borderRadius: theme.ui.radius.full, backgroundColor: theme.ui.color.bg, alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: faces.display, fontSize: 22, lineHeight: 26, color: theme.ui.color["ink-2"] },
  personText: { flex: 1, minWidth: 0, gap: 2 },
  version: { paddingBottom: theme.ui.space["2"] },
}));
