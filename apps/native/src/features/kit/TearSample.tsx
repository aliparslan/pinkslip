import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  ApplyButton, Chip, PageBar, setTearPace, SheetModal, Text, Ticket, toast, UNDO_TOAST_DURATION, useStubCatch, useTabBarStepsAside,
} from "../../ui";
import { DidYouApply } from "../redesign/ApplySheets";
import { JobIdentity } from "../redesign/JobIdentity";
import { BAR, TOP_BAR, usePinnedBarToastLift } from "../redesign/JobPage";

// The ticket's order (owner, 2026-10-19): visa last.
const FACTS = [
  [{ label: "Level", value: "New grad" }, { label: "Experience", value: "0–1 years" }],
  [{ label: "Location", value: "Remote (US)" }],
  [{ label: "Pay", value: "$145K–$175K" }, { label: "Visa sponsorship", value: "Yes" }],
];

const ABOUT = [
  "Stripe's backend teams build the systems that move money for millions of businesses: payments, billing and the ledgers underneath them.",
  "As a new grad you'll ship to production in your first weeks, with a mentor and a team that reviews every change.",
  "You'll write Ruby and Go, design APIs other engineers depend on, and be on call for what you build.",
];

/**
 * The job page's tear on a sample (Paper "The stub tears off, frame by
 * frame"): Apply asks "Did you apply?" as coming back from a posting does,
 * Yes tears the stub into the button once the sheet has gone, and the
 * toast's Undo (or Put it back) brings it back. Nothing is saved. Slow
 * motion runs it at a quarter speed.
 */
export function TearSample() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  useTabBarStepsAside(true);
  usePinnedBarToastLift();
  const [applied, setApplied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setTearPace(slow ? 4 : 1);
    return () => setTearPace(1);
  }, [slow]);
  const tear = useStubCatch(applied, asking);
  const yes = () => {
    setApplied(true);
    toast.show({ message: "Applied to Stripe. It's in Tracker.", icon: "done", duration: UNDO_TOAST_DURATION,
      action: { label: "Undo", run: () => setApplied(false) } });
  };

  return <View style={styles.fill}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView style={styles.fill}
      contentContainerStyle={[styles.body, { paddingTop: insets.top + TOP_BAR + theme.ui.space["2"], paddingBottom: BAR + insets.bottom + theme.ui.space["6"] }]}>
      <JobIdentity companyName="Stripe" companyDomain="stripe.com" title="Backend Engineer, New Grad" />
      <View style={styles.ticket}>
        <Ticket rows={FACTS} stub="Posted Oct 9 · Rolling deadline · via Greenhouse" torn={tear.torn} catcher={tear.bar} onCaught={tear.onCaught} />
      </View>
      <View style={styles.about}>
        <Text weight="medium" accessibilityRole="header">About the role</Text>
        {ABOUT.map((line) => <Text key={line} role="subhead" tone="ink-2">{line}</Text>)}
      </View>
    </ScrollView>
    {/* The kit's own controls ride in the page bar every pushed page has. */}
    <PageBar actions={<View style={styles.controls}>
      {applied ? <Chip label="Put it back" onPress={() => setApplied(false)} /> : null}
      <Chip label="Slow motion" selected={slow} onPress={() => setSlow(!slow)} />
    </View>} />
    <View ref={tear.bar} style={[styles.bar, { paddingBottom: Math.max(insets.bottom, theme.ui.space["4"]) }]}>
      <Animated.View style={tear.dip}>
        <ApplyButton state={tear.applied ? { kind: "applied", date: "Oct 18" } : { kind: "apply", closed: false }}
          saved={saved} onSave={() => setSaved(!saved)} onPress={tear.applied ? undefined : () => setAsking(true)} />
      </Animated.View>
    </View>
    <SheetModal open={asking} onClosed={() => setAsking(false)}><DidYouApply onYes={yes} /></SheetModal>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  body: { paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["2"] },
  // Above what follows, so the torn stub falls over the page.
  ticket: { marginTop: theme.ui.space["6"], zIndex: 1 },
  about: { gap: theme.ui.space["3"], marginTop: theme.ui.space["6"] },
  controls: { flexDirection: "row", gap: theme.ui.space["2"] },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: theme.ui.space["3"],
    paddingHorizontal: theme.ui.size.gutter,
    backgroundColor: theme.ui.color.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.ui.color.separator,
  },
}));
