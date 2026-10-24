import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { JobRow, Segmented, SwipeRow, Text, type SwipeAction } from "../../ui";
import { KitPage } from "./KitPage";

/**
 * Dev-only: motion as the app does it now and as proposed, to feel on the
 * phone before any real screen changes (Paper first, for motion). The owner
 * took #1-3 of docs/motion-opportunities-2026-10-24.md into the kit on
 * 2026-10-24 and dropped #4-6; the swipe stays here while it's reworked.
 * Nothing here saves.
 */
type Mode = "now" | "proposed";

const MODES = [{ value: "now", label: "Now" }, { value: "proposed", label: "Proposed" }] as const;

export function MotionLab() {
  return <KitPage title="Motion" style={styles.screen} contentStyle={styles.content}>
    <SwipeDemo />
  </KitPage>;
}

function Demo({ title, note, mode, onMode, children }: {
  title: string; note: string; mode: Mode; onMode: (mode: Mode) => void; children: ReactNode;
}) {
  return <View style={styles.demo}>
    <View style={styles.label}>
      <Text weight="medium">{title}</Text>
      <Text role="subhead" tone="ink-2">{note}</Text>
    </View>
    <Segmented value={mode} onChange={onMode} segments={MODES} />
    <View style={styles.body}>{children}</View>
  </View>;
}

const SAMPLE_ROWS = [
  { company: "Stripe", title: "Software Engineer, New Grad", facts: "New York · $165k", age: "2h" },
  { company: "Ramp", title: "Frontend Engineer", facts: "New York · $150k–$190k", age: "5h" },
  { company: "Linear", title: "Product Engineer", facts: "Remote · $140k", age: "1d" },
];

// Nothing runs: these rows only show how they move.
const noop = () => undefined;
const LEADING: SwipeAction[] = [
  { id: "save", label: "Save", icon: "save", tone: "accent", run: noop },
  { id: "read", label: "Read", icon: "read", tone: "find", run: noop },
];
const TRAILING: SwipeAction[] = [
  { id: "hide", label: "Hide", icon: "hide", tone: "neutral", run: noop },
  { id: "applied", label: "Applied", icon: "applied", tone: "apply", run: noop },
];

/** A row let go short of its target: it eases home today; proposed, it
 * carries on at the finger's speed on the kit's settle spring. */
function SwipeDemo() {
  const [mode, setMode] = useState<Mode>("proposed");
  return <Demo title="Letting go of a swipe" note="Flick a row partway and let go. Proposed, it keeps your finger's speed as it settles open or home, with no overshoot." mode={mode} onMode={setMode}>
    <View style={styles.rows}>
      {SAMPLE_ROWS.map((row) => <SwipeRow key={`${mode}-${row.company}`} id={`${mode}-${row.company}`} leading={LEADING} trailing={TRAILING}
        settle={mode === "proposed" ? "spring" : "ease"}>
        <JobRow {...row} logo={{ name: row.company }} />
      </SwipeRow>)}
    </View>
  </Demo>;
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.ui.color["screen-grouped"] },
  content: { gap: theme.ui.space["8"], paddingBottom: theme.ui.space["8"] },
  demo: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter },
  label: { gap: 2 },
  body: { gap: theme.ui.space["4"] },
  // Rows run to the screen edges, as in a list.
  rows: { marginHorizontal: -theme.ui.size.gutter },
}));
