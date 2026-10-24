import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, Text as RNText, View, type LayoutChangeEvent } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { PressableScale } from "../../kit/PressableScale";
import { durations, easeOut } from "../../kit/motion";
import {
  Button, CopyField, Icon, IconTile, JobRow, RowPlaceholders, Segmented, SHEET_GROUP_RADIUS, SheetModal, SheetScroll, SheetStep, SwipeRow, Text, useCopy, useSheet,
  type SwipeAction, type TileMeaning,
} from "../../ui";
import { faces } from "../../ui/fonts";
import { motion, spring } from "../../ui/motion";
import { OfflinePill } from "../redesign/errors";
import { KitPage } from "./KitPage";

/**
 * Dev-only: the six moments in docs/motion-opportunities-2026-10-24.md, each
 * as the app does it now and as proposed, to feel on the phone before any
 * real screen changes (Paper first, for motion). Nothing here saves.
 */
type Mode = "now" | "proposed";

const MODES = [{ value: "now", label: "Now" }, { value: "proposed", label: "Proposed" }] as const;

export function MotionLab() {
  return <KitPage title="Motion" style={styles.screen} contentStyle={styles.content}>
    <ImportBarDemo />
    <SegmentedDemo />
    <CopyDemo />
    <LoadDemo />
    <NotesDemo />
    <OfflineDemo />
    <SwipeDemo />
  </KitPage>;
}

function Demo({ n, title, note, mode, onMode, bare = false, children }: {
  n: number; title: string; note: string; mode: Mode; onMode: (mode: Mode) => void;
  /** On the page itself, as rows and fields sit in the app, not on a card. */
  bare?: boolean;
  children: ReactNode;
}) {
  return <View style={styles.demo}>
    <View style={styles.label}>
      <Text weight="medium">{`${n} · ${title}`}</Text>
      <Text role="subhead" tone="ink-2">{note}</Text>
    </View>
    <Segmented value={mode} onChange={onMode} segments={MODES} />
    <View style={bare ? styles.bare : styles.card}>{children}</View>
  </View>;
}

// ---------------------------------------------------------------- 1

type ImportStep = "reading" | "scan" | "done";
const STEP_WIDTH: Record<ImportStep, number> = { reading: 0.45, scan: 0.75, done: 1 };
const STEP_WORDS: Record<ImportStep, string> = {
  reading: "Finding your experience and skills.",
  scan: "It's a scan, so reading it page by page.",
  done: "Done.",
};

/** The import sheet's bar: it jumps to each step's width today; proposed, it
 * grows to it, never ahead of a real step. */
function ImportBarDemo() {
  const [mode, setMode] = useState<Mode>("proposed");
  const [step, setStep] = useState<ImportStep | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const run = () => {
    timers.current.forEach(clearTimeout);
    setStep("reading");
    timers.current = [setTimeout(() => setStep("scan"), 1800), setTimeout(() => setStep("done"), 3600), setTimeout(() => setStep(null), 4800)];
  };
  return <Demo n={1} title="The import bar" note="A PDF being read: two real steps, then done." mode={mode} onMode={setMode}>
    <Text tone="ink-2">{step ? STEP_WORDS[step] : "Not reading anything."}</Text>
    <ImportBar share={step ? STEP_WIDTH[step] : 0} animate={mode === "proposed"} />
    <Button fullWidth disabled={step !== null} onPress={run}>Import a PDF</Button>
  </Demo>;
}

function ImportBar({ share, animate }: { share: number; animate: boolean }) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const shown = useSharedValue(0);
  useEffect(() => {
    // Back to empty is a reset, not progress, so it never runs backwards.
    shown.value = animate && !reduced && share > 0 ? withTiming(share, { duration: 600, easing: easeOut }) : share;
  }, [share, animate, reduced, shown]);
  // A full-width fill slid in from the left keeps its rounded end, where a
  // stretched one would squash it.
  const fill = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - shown.value) * width }] }));
  return <View style={styles.track} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
    <Animated.View style={[styles.fill, fill]} />
  </View>;
}

// ---------------------------------------------------------------- 2

const COMPANY_SEGMENTS = [{ value: "jobs", label: "Jobs", count: 12 }, { value: "people", label: "People", count: 3 }, { value: "events", label: "Events", count: 2 }] as const;
type CompanySegment = (typeof COMPANY_SEGMENTS)[number]["value"];

function SegmentedDemo() {
  const [mode, setMode] = useState<Mode>("proposed");
  const [segment, setSegment] = useState<CompanySegment>("jobs");
  return <Demo n={2} title="Segmented control" note="A company's Jobs, People and Events. The raised thumb jumps today; iOS slides it." mode={mode} onMode={setMode}>
    {mode === "now"
      ? <Segmented value={segment} onChange={setSegment} segments={COMPANY_SEGMENTS} />
      : <SlidingSegmented value={segment} onChange={setSegment} segments={COMPANY_SEGMENTS} />}
  </Demo>;
}

const GLIDE = { ...spring(motion.tab.glide), overshootClamping: true };

/** The kit's segmented control with one thumb that slides on the tab glide
 * (no overshoot) instead of each segment lighting up in place. */
function SlidingSegmented<T extends string>({ value, onChange, segments }: {
  value: T; onChange: (next: T) => void; segments: ReadonlyArray<{ value: T; label: string; count?: number }>;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, segments.findIndex((segment) => segment.value === value));
  const segmentWidth = width > 0 ? (width - 8) / segments.length : 0;
  const x = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    const target = index * segmentWidth;
    // The first layout places it; after that it travels.
    x.value = first.current || reduced ? target : withSpring(target, GLIDE);
    if (segmentWidth > 0) first.current = false;
  }, [index, segmentWidth, reduced, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <View style={styles.segTrack} accessibilityRole="tablist" onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
    {segmentWidth > 0 ? <Animated.View style={[styles.segThumb, { width: segmentWidth }, thumb]} /> : null}
    {segments.map((segment) => {
      const on = segment.value === value;
      return <Pressable key={segment.value} onPress={() => onChange(segment.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={styles.segment}>
        <Text role="subhead" weight="medium" tone={on ? "ink" : "ink-2"}>{segment.label}</Text>
        {segment.count !== undefined ? <Text role="subhead" tone="ink-3">{String(segment.count)}</Text> : null}
      </Pressable>;
    })}
  </View>;
}

// ---------------------------------------------------------------- 3

function CopyDemo() {
  const [mode, setMode] = useState<Mode>("proposed");
  return <Demo n={3} title="Copy" note="The copy button turns into a check for a moment. Today it swaps; proposed, one glyph gives way to the other." mode={mode} onMode={setMode} bare>
    {mode === "now" ? <CopyField value="jordan@lee.dev" label="email" /> : <MorphingCopyField value="jordan@lee.dev" label="email" />}
  </Demo>;
}

const GLYPH = { duration: durations.instant, easing: easeOut };

/** The glyph arriving: from 60% and clear. */
function glyphIn() {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
    animations: { opacity: withTiming(1, GLYPH), transform: [{ scale: withTiming(1, GLYPH) }] },
  };
}

/** The glyph leaving: down to 60% as it clears. */
function glyphOut() {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: { opacity: withTiming(0, GLYPH), transform: [{ scale: withTiming(0.6, GLYPH) }] },
  };
}

/** CopyField's line, with the copy glyph and the check trading places. */
function MorphingCopyField({ value, label }: { value: string; label: string }) {
  const { copied, copy } = useCopy(value);
  const reduced = useReducedMotion();
  return <View style={styles.copyField}>
    <RNText onPress={copy} selectable maxFontSizeMultiplier={1.4} style={styles.copyValue}>{value}</RNText>
    <PressableScale accessibilityRole="button" accessibilityLabel={copied ? `Copied ${label}` : `Copy ${label}`}
      onPress={copy} scale={0.9} hitSlop={4} contentStyle={styles.copyButton}>
      <Animated.View key={copied ? "done" : "copy"} style={styles.glyph}
        entering={reduced ? FadeIn.duration(durations.instant) : glyphIn} exiting={reduced ? FadeOut.duration(durations.instant) : glyphOut}>
        <Icon name={copied ? "done" : "copy"} size={20} />
      </Animated.View>
    </PressableScale>
  </View>;
}

// ---------------------------------------------------------------- 4

const SAMPLE_ROWS = [
  { company: "Stripe", title: "Software Engineer, New Grad", facts: "New York · $165k", age: "2h" },
  { company: "Ramp", title: "Frontend Engineer", facts: "New York · $150k–$190k", age: "5h" },
  { company: "Linear", title: "Product Engineer", facts: "Remote · $140k", age: "1d" },
];

/** The feed's first load: pulsing rows, then the jobs. */
function LoadDemo() {
  const [mode, setMode] = useState<Mode>("proposed");
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const load = () => {
    setLoading(true);
    timer.current = setTimeout(() => setLoading(false), 2600);
  };
  return <Demo n={4} title="The first page of jobs" note="Placeholders pulse after a second, then the jobs arrive. Proposed, they fade in over 180ms, once per load." mode={mode} onMode={setMode} bare>
    <View style={styles.rows}>
      {loading ? <RowPlaceholders rows={3} />
        : <Animated.View key={mode} entering={mode === "proposed" ? FadeIn.duration(durations.fast).easing(easeOut) : undefined}>
          {SAMPLE_ROWS.map((row) => <JobRow key={row.company} {...row} logo={{ name: row.company }} />)}
        </Animated.View>}
    </View>
    <Button fullWidth disabled={loading} onPress={load}>Load again</Button>
  </Demo>;
}

// ---------------------------------------------------------------- 5

const NOTES: { icon: "search" | "resume"; meaning: TileMeaning; title: string }[] = [
  { icon: "search", meaning: "find", title: "Search has been improved" },
  { icon: "resume", meaning: "apply", title: "Fixed a bug with PDF import" },
];

function NotesDemo() {
  const [mode, setMode] = useState<Mode>("proposed");
  const [open, setOpen] = useState(false);
  return <Demo n={5} title="Update notes" note="The small sheet after an update. Proposed, each note rises in as the sheet lands." mode={mode} onMode={setMode}>
    <Button fullWidth onPress={() => setOpen(true)}>Show the notes</Button>
    <SheetModal open={open} onClosed={() => setOpen(false)}>
      {open ? <NotesStep rise={mode === "proposed"} /> : null}
    </SheetModal>
  </Demo>;
}

const ROWS = motion.onboarding.rows;

/** A note rising `ROWS.rise` points into place, after the one above it. */
function riseIn(order: number) {
  return () => {
    "worklet";
    const t = { duration: ROWS.duration, easing: easeOut };
    const delay = ROWS.delay + order * ROWS.stagger;
    return {
      initialValues: { opacity: 0, transform: [{ translateY: ROWS.rise }] },
      animations: { opacity: withDelay(delay, withTiming(1, t)), transform: [{ translateY: withDelay(delay, withTiming(0, t)) }] },
    };
  };
}

function NotesStep({ rise }: { rise: boolean }) {
  const sheet = useSheet();
  const reduced = useReducedMotion();
  return <SheetStep id="notes">
    <SheetScroll style={styles.notesScroll}>
      <View style={styles.notes}>
        {NOTES.map((note, order) => <Animated.View key={note.title} style={styles.note}
          entering={!rise ? undefined : reduced ? FadeIn.delay(ROWS.delay).duration(durations.standard) : riseIn(order)}>
          <View style={styles.noteTile}><IconTile icon={note.icon} meaning={note.meaning} /></View>
          <View style={styles.noteText}><Text weight="medium">{note.title}</Text></View>
        </Animated.View>)}
      </View>
    </SheetScroll>
    <Button fullWidth onPress={sheet.close}>Got it</Button>
  </SheetStep>;
}

// ---------------------------------------------------------------- 6

/** Arriving: down 4 points as it clears in. */
function pillIn() {
  "worklet";
  const t = { duration: durations.standard, easing: easeOut };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -4 }] },
    animations: { opacity: withTiming(1, t), transform: [{ translateY: withTiming(0, t) }] },
  };
}

function OfflineDemo() {
  const [mode, setMode] = useState<Mode>("proposed");
  const [offline, setOffline] = useState(false);
  const reduced = useReducedMotion();
  return <Demo n={6} title="Offline" note="The pill in Jobs' header while there's no connection." mode={mode} onMode={setMode}>
    <View style={styles.header}>
      <Text role="title1">Jobs</Text>
      {offline ? mode === "now"
        ? <OfflinePill />
        : <Animated.View entering={reduced ? FadeIn.duration(durations.standard) : pillIn} exiting={FadeOut.duration(durations.instant)}><OfflinePill /></Animated.View>
        : null}
    </View>
    <Button fullWidth onPress={() => setOffline((now) => !now)}>{offline ? "Back online" : "Go offline"}</Button>
  </Demo>;
}

// ---------------------------------------------------------------- 7

// Nothing runs: these rows only show how they settle.
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
  return <Demo n={7} title="Letting go of a swipe" note="Flick a row partway and let go. Proposed, it keeps your finger's speed as it settles open or home, with no overshoot." mode={mode} onMode={setMode} bare>
    <View style={styles.rows}>
      {SAMPLE_ROWS.slice(0, 2).map((row) => <SwipeRow key={`${mode}-${row.company}`} id={`${mode}-${row.company}`} leading={LEADING} trailing={TRAILING}
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
  card: { gap: theme.ui.space["4"], padding: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  track: { height: 6, borderRadius: 3, backgroundColor: theme.ui.color.fill, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: theme.ui.color.ink },
  // Segmented's own track and thumb, the thumb now one view that moves.
  segTrack: { flexDirection: "row", height: 40, padding: theme.ui.space["1"], borderRadius: theme.ui.radius.full, backgroundColor: theme.ui.color.fill },
  segThumb: { position: "absolute", top: theme.ui.space["1"], bottom: theme.ui.space["1"], left: theme.ui.space["1"], borderRadius: theme.ui.radius.full, backgroundColor: theme.ui.color["seg-on"], boxShadow: "0px 1px 3px rgba(0, 0, 0, 0.08)" },
  segment: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  // CopyField's line.
  copyField: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], minHeight: 56, paddingLeft: theme.ui.space["4"], paddingRight: 10, paddingVertical: 10, borderRadius: SHEET_GROUP_RADIUS, borderCurve: "continuous", backgroundColor: theme.ui.color["sheet-group"] },
  copyValue: { flex: 1, fontFamily: faces.display, fontSize: 17, lineHeight: 22, color: theme.ui.color.ink },
  copyButton: { width: 36, height: 36, borderRadius: theme.ui.radius.full, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  glyph: { position: "absolute" },
  bare: { gap: theme.ui.space["4"] },
  // Rows run to the screen edges, as in a list.
  rows: { minHeight: 3 * 84, marginHorizontal: -theme.ui.size.gutter },
  // The update notes' group, as in whats-new.
  notesScroll: { flexGrow: 0, flexShrink: 1 },
  notes: { gap: theme.ui.space["4"], padding: theme.ui.space["4"], borderRadius: SHEET_GROUP_RADIUS, backgroundColor: theme.ui.color["sheet-group"] },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  noteTile: { marginTop: 2 },
  noteText: { flex: 1, gap: 2 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 },
}));
