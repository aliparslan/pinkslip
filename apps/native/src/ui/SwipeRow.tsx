import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing, interpolate, interpolateColor, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue,
} from "react-native-reanimated";
import { settleSpring } from "../kit/motion";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "../platform/haptics";
import { faces } from "./fonts";
import { Icon, type IconName } from "./Icon";
import { motion, rubberBand, spring } from "./motion";
import { Text } from "./Text";

/** What an action is, which sets its color (Paper "Swipe actions · Oct
 * 14", S4): pink saves, blue reads, green is applying, graphite hides. */
export type SwipeTone = "accent" | "find" | "apply" | "neutral";

export interface SwipeAction {
  id: string;
  label: string;
  icon: IconName;
  tone: SwipeTone;
  /** The row leaves the list, so it slides away and folds up. */
  removes?: boolean;
  run: () => void;
}

export interface SwipeRowProps {
  /** Resets the row when a recycled cell shows a different item. */
  id: string;
  /** Right swipe: the first is the outer one, which a full swipe runs. */
  leading?: readonly SwipeAction[];
  /** Left swipe: the first is the outer one, which a full swipe runs. */
  trailing?: readonly SwipeAction[];
  children: ReactNode;
}

const CIRCLE = 44;
const GAP = 8;
const EDGE = 12;
/** The strong ease-out every settle uses: quick off the mark, no overshoot. */
const SETTLE = { duration: 260, easing: Easing.bezier(0.23, 1, 0.32, 1) };
const FAST = { duration: 200, easing: Easing.bezier(0.23, 1, 0.32, 1) };

/** How far a short swipe opens: the circles and their margins. */
function revealWidth(count: number) {
  "worklet";
  return count === 0 ? 0 : EDGE * 2 + count * CIRCLE + (count - 1) * GAP;
}

/** Past this, letting go runs the outer action: a little past the circles. */
function commitDistance(width: number, count: number) {
  "worklet";
  return Math.max(width * 0.42, revealWidth(count) + 56);
}

/** True while a row is being swiped, so the row inside can skip its press
 * highlight and its tap (the swipe doesn't always cancel the touch). */
export const SwipingContext = createContext(false);

/** Which swipe the rows below use: today's circles, or the pills after iOS
 * Mail that the kit's Swipes page compares (owner, 2026-10-24). */
export const SwipeLookContext = createContext<"circles" | "pills">("circles");

/** True inside a pill swipe row, whose own card is the row's background, so
 * the row inside stays clear. */
export const SwipeCardContext = createContext(false);

/** One row open at a time: opening another, or scrolling, closes it. */
let openRow: { id: string; close: () => void } | null = null;

export function closeOpenSwipeRow() {
  openRow?.close();
}

/**
 * Swipe actions in the redesign (S4, owner 2026-10-14). Drag a row and
 * tinted circles follow its edge; let go past the circles and it stays open
 * on them to tap; keep going and the outer circle grows into its colored
 * capsule, and letting go runs it. Every settle eases out, so nothing
 * overshoots to the other side.
 */
export function SwipeRow(props: SwipeRowProps) {
  const look = useContext(SwipeLookContext);
  return look === "pills" ? <PillSwipeRow {...props} /> : <CircleSwipeRow {...props} />;
}

function CircleSwipeRow({ id, leading = [], trailing = [], children }: SwipeRowProps) {
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const width = useSharedValue(390);
  const height = useSharedValue(0);
  const fold = useSharedValue(1);
  const armed = useSharedValue(false);
  const progress = useSharedValue(0);
  const [open, setOpen] = useState<"leading" | "trailing" | null>(null);
  const [swiping, setSwiping] = useState(false);
  const settled = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leadingCount = leading.length;
  const trailingCount = trailing.length;

  const close = useRef(() => {});
  close.current = () => {
    x.value = withTiming(0, SETTLE);
    setOpen(null);
    if (openRow?.id === id) openRow = null;
  };

  useEffect(() => {
    x.value = 0;
    fold.value = 1;
    armed.value = false;
    progress.value = 0;
    setOpen(null);
  }, [id, x, fold, armed, progress]);

  // The actions are read when one runs, so a re-render mid-drag is harmless.
  const latest = useRef({ leading, trailing });
  useEffect(() => { latest.current = { leading, trailing }; });

  const run = (side: "leading" | "trailing", index: number) => {
    latest.current[side][index]?.run();
  };
  const markOpen = (side: "leading" | "trailing" | null) => {
    setOpen(side);
    if (side) {
      if (openRow && openRow.id !== id) openRow.close();
      openRow = { id, close: () => close.current() };
    } else if (openRow?.id === id) {
      openRow = null;
    }
  };
  const startDrag = () => {
    if (openRow && openRow.id !== id) openRow.close();
    if (settled.current) clearTimeout(settled.current);
    setSwiping(true);
  };
  // The release lands a moment after the finger lifts; a tap that comes with
  // it is the swipe's, not the row's.
  const endDrag = () => {
    settled.current = setTimeout(() => setSwiping(false), 250);
  };

  /** Runs an action: one that removes the row slides it away and folds it
   * up first; the others let the row ease home. */
  const perform = (side: "leading" | "trailing", index: number) => {
    const action = latest.current[side][index];
    if (!action) return;
    const sign = side === "leading" ? 1 : -1;
    markOpen(null);
    if (action.removes) {
      x.value = withTiming(sign * width.value, FAST, (finished) => {
        if (!finished) return;
        fold.value = withTiming(0, FAST, (done) => {
          if (done) scheduleOnRN(run, side, index);
        });
      });
      // Back where it was if the row stays (a failure, or Undo).
      setTimeout(() => {
        x.value = 0;
        fold.value = 1;
        progress.value = 0;
      }, 1200);
    } else {
      x.value = withTiming(0, SETTLE, () => { progress.value = withTiming(0, FAST); });
      run(side, index);
    }
  };

  const pan = useMemo(() => Gesture.Pan()
    .enabled(leadingCount > 0 || trailingCount > 0)
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    // Picks the row up where it is, open or mid-animation.
    .onStart(() => {
      start.value = x.value;
      scheduleOnRN(startDrag);
    })
    .onUpdate((event) => {
      const raw = start.value + event.translationX;
      const count = raw > 0 ? leadingCount : trailingCount;
      const next = count > 0 ? raw : rubberBand(raw, 40);
      x.value = next;
      const past = count > 0 && Math.abs(next) >= commitDistance(width.value, count);
      if (past !== armed.value) {
        armed.value = past;
        progress.value = withTiming(past ? 1 : 0, FAST);
        scheduleOnRN(haptics.tap);
      }
    })
    // Also runs, with success false, when the list takes the touch away.
    .onEnd((event, success) => {
      const value = x.value;
      const sign = value > 0 ? 1 : -1;
      const side = value > 0 ? "leading" : "trailing";
      const count = value > 0 ? leadingCount : trailingCount;
      const outward = event.velocityX * sign;
      const flick = outward > 1200 && Math.abs(value) > revealWidth(count);
      const fullSwipe = success && count > 0 && (armed.value || flick);
      armed.value = false;
      scheduleOnRN(endDrag);
      if (fullSwipe) {
        progress.value = withTiming(1, FAST);
        scheduleOnRN(perform, side, 0);
        return;
      }
      progress.value = withTiming(0, FAST);
      const stayOpen = success && count > 0 && Math.abs(value) >= revealWidth(count) / 2 && outward > -300;
      const target = stayOpen ? sign * revealWidth(count) : 0;
      x.value = withTiming(target, SETTLE);
      scheduleOnRN(markOpen, stayOpen ? side : null);
    }), [leadingCount, trailingCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const foldStyle = useAnimatedStyle(() => fold.value < 1 ? { height: height.value * fold.value, opacity: fold.value } : {});

  return <Animated.View style={[styles.root, foldStyle]}
    onLayout={(event) => {
      width.value = event.nativeEvent.layout.width;
      if (fold.value === 1) height.value = event.nativeEvent.layout.height;
    }}>
    {leadingCount > 0 ? <Side side="leading" actions={leading} x={x} progress={progress} open={open === "leading"} onPress={(index) => perform("leading", index)} /> : null}
    {trailingCount > 0 ? <Side side="trailing" actions={trailing} x={x} progress={progress} open={open === "trailing"} onPress={(index) => perform("trailing", index)} /> : null}
    <GestureDetector gesture={pan}>
      <Animated.View style={rowStyle}>
        <SwipingContext.Provider value={swiping}>{children}</SwipingContext.Provider>
        {/* Open, a tap on the row closes it instead of opening the job. */}
        {open ? <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close actions" onPress={() => close.current()} /> : null}
      </Animated.View>
    </GestureDetector>
  </Animated.View>;
}

/** The strip a drag opens on one side, with the circles kept beside the
 * row's moving edge. */
function Side({ side, actions, x, progress, open, onPress }: {
  side: "leading" | "trailing";
  actions: readonly SwipeAction[];
  x: SharedValue<number>;
  progress: SharedValue<number>;
  open: boolean;
  onPress: (index: number) => void;
}) {
  const sign = side === "leading" ? 1 : -1;
  const strip = useAnimatedStyle(() => ({ width: Math.max(0, x.value * sign) }));
  // Outer first in `actions`; the cluster reads outward from the row's edge.
  const ordered = actions.map((action, index) => ({ action, index }));
  const cluster = side === "leading" ? ordered : [...ordered].reverse();
  return <Animated.View pointerEvents={open ? "box-none" : "none"}
    style={[styles.strip, side === "leading" ? styles.stripLeading : styles.stripTrailing, strip]}>
    <View style={[styles.cluster, side === "leading" ? styles.clusterLeading : styles.clusterTrailing]}>
      {cluster.map(({ action, index }) =>
        <Circle key={action.id} action={action} outer={index === 0} x={x} sign={sign} progress={progress}
          onPress={() => onPress(index)} />)}
    </View>
  </Animated.View>;
}

function toneColors(tone: SwipeTone, color: Record<string, string>) {
  // A tint is the ink at 14%, so it reads on white and on graphite alike.
  const tint = (hex: string) => `${hex}24`;
  switch (tone) {
    case "accent": return { tint: color["accent-soft"]!, ink: color.accent!, fill: color["accent-fill"]!, onFill: color["accent-ink"]!, onFillTone: "accent-ink" as const };
    case "find": return { tint: tint(color["tile-find-ink"]!), ink: color["tile-find-ink"]!, fill: color["tile-find-ink"]!, onFill: color["accent-ink"]!, onFillTone: "accent-ink" as const };
    case "apply": return { tint: tint(color["tile-apply-ink"]!), ink: color["tile-apply-ink"]!, fill: color["tile-apply-ink"]!, onFill: color["accent-ink"]!, onFillTone: "accent-ink" as const };
    case "neutral": return { tint: color.fill!, ink: color["ink-2"]!, fill: color["ink-2"]!, onFill: color.bg!, onFillTone: "bg" as const };
  }
}

/** The capsule's padding, icon and gap around its label. */
const CAPSULE_CHROME = 16 + 18 + 6 + 16;

/** A 44 circle with its label under it. The outer one widens into the
 * capsule once a full swipe is armed, one shape growing rather than two
 * crossing; the inner one folds away so the capsule sits by the row. */
function Circle({ action, outer, x, sign, progress, onPress }: {
  action: SwipeAction;
  outer: boolean;
  x: SharedValue<number>;
  sign: number;
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const colors = toneColors(action.tone, theme.ui.color as unknown as Record<string, string>);
  // The label's own width, measured where nothing narrows it.
  const [labelWidth, setLabelWidth] = useState(0);
  const capsule = CIRCLE + Math.max(0, CAPSULE_CHROME + labelWidth - CIRCLE);
  const slot = useAnimatedStyle(() => {
    const distance = x.value * sign;
    const p = progress.value;
    return {
      width: interpolate(p, [0, 1], [CIRCLE, outer ? capsule : 0]),
      // The folding circle takes its gap with it, so the capsule lands by the row.
      [sign > 0 ? "marginLeft" : "marginRight"]: outer ? 0 : interpolate(p, [0, 1], [0, -GAP]),
      opacity: interpolate(distance, [8, 48], [0, 1], "clamp") * (outer ? 1 : 1 - p),
      transform: [{ scale: interpolate(distance, [8, 56], [0.6, 1], "clamp") }],
    };
  }, [capsule, outer]);
  const shape = useAnimatedStyle(() => ({
    backgroundColor: outer ? interpolateColor(progress.value, [0, 1], [colors.tint, colors.fill]) : colors.tint,
  }), [colors.tint, colors.fill, outer]);
  const quiet = useAnimatedStyle(() => ({ opacity: outer ? 1 - progress.value : 1 }), [outer]);
  const loud = useAnimatedStyle(() => ({ opacity: progress.value }));
  return <Animated.View style={[styles.slot, slot]}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={action.label} hitSlop={6} style={styles.press}>
      <Animated.View style={[styles.shape, shape]}>
        <Animated.View style={[styles.glyph, quiet]}><Icon name={action.icon} size={20} color={colors.ink} /></Animated.View>
        {outer ? <Animated.View style={[styles.inline, { width: capsule }, loud]}>
          <Icon name={action.icon} size={18} color={colors.onFill} />
          <Text role="subhead" weight="medium" tone={colors.onFillTone} lines={1}>{action.label}</Text>
        </Animated.View> : null}
      </Animated.View>
    </Pressable>
    <Animated.View style={[styles.under, quiet]}>
      <Text role="footnote" weight="medium" tone="ink-2" align="center" lines={1}>{action.label}</Text>
    </Animated.View>
    {outer ? <View style={styles.measure} pointerEvents="none">
      <View onLayout={(event) => setLabelWidth(Math.ceil(event.nativeEvent.layout.width))}>
        <Text role="subhead" weight="medium">{action.label}</Text>
      </View>
    </View> : null}
  </Animated.View>;
}

// ---------------------------------------------------------------- pills

/**
 * Swipe actions after iOS Mail (proposed, owner 2026-10-24; Kit → Swipes;
 * docs/swipe-frame-analysis-2026-10-24.md). The actions are pills sized to
 * their icon and label, each in a fixed slot at the screen's edge, growing
 * in as the row uncovers it, so nothing slides in cut off. Once they're all
 * out they stay put; past that, the outer one (the one a full swipe runs)
 * stretches toward the row, and past the commit point it fills, solid, to
 * the row's edge. The row being swiped turns into a card: a grey fill and
 * rounded corners. Letting go carries the finger's speed; a full swipe that
 * removes the row leaves and closes up in one motion, and one that doesn't
 * runs once the row is home, so nothing changes while it moves.
 */
const PILL = 44;
const PILL_PAD = 14;
const PILL_ICON = 18;
const PILL_ICON_GAP = 6;
const PILL_MIN = 72;
const PILL_GAP = 8;
const PILL_EDGE = 8;
const CARD_RADIUS = 22;
/** A pill chasing its target size: critically damped, a beat behind the drag. */
const GROW = { ...spring(motion.swipe.grow), overshootClamping: true };
/** Home after an action that keeps the row: brisker than a settle, and it
 * stops creeping sooner, so the action runs without a wait. */
const HOME = { duration: 300, dampingRatio: 1, overshootClamping: true, energyThreshold: 1e-5 } as const;
/** Leaving rides the finger's speed, without overshooting. */
const LEAVE = { duration: 320, dampingRatio: 1, overshootClamping: true } as const;
/** The space closes once the row is mostly gone, so leaving and closing up read as one. */
const FOLD_DELAY = 120;
const FOLD = { duration: 240, easing: Easing.bezier(0.2, 0.7, 0.2, 1) };

/** Label widths measured once, shared by every row. */
const measured = new Map<string, number>();

function pillWidth(label: string) {
  const text = measured.get(label) ?? label.length * 8.5;
  return Math.max(PILL_MIN, Math.ceil(PILL_PAD * 2 + PILL_ICON + PILL_ICON_GAP + text));
}

/** Each pill's width and its distance from the screen's edge, outer first,
 * and how far the row opens to show them all. */
function pillGeometry(actions: readonly SwipeAction[]) {
  const widths = actions.map((action) => pillWidth(action.label));
  const near: number[] = [];
  let at = PILL_EDGE;
  for (const width of widths) {
    near.push(at);
    at += width + PILL_GAP;
  }
  return { widths, near, reveal: widths.length === 0 ? 0 : at };
}

function pillCommit(width: number, reveal: number) {
  "worklet";
  return Math.max(width * 0.42, reveal + 56);
}

function PillSwipeRow({ id, leading = [], trailing = [], children }: SwipeRowProps) {
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const width = useSharedValue(390);
  const height = useSharedValue(0);
  const fold = useSharedValue(1);
  const armed = useSharedValue(false);
  /** 0 to 1: the outer pill filling, solid, to the row's edge. */
  const fill = useSharedValue(0);
  const [open, setOpen] = useState<"leading" | "trailing" | null>(null);
  const [swiping, setSwiping] = useState(false);
  const [, setMeasured] = useState(0);
  const settled = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leadingKey = leading.map((action) => action.label).join("|");
  const trailingKey = trailing.map((action) => action.label).join("|");
  const lead = useMemo(() => pillGeometry(leading), [leadingKey, measured.size]); // eslint-disable-line react-hooks/exhaustive-deps
  const trail = useMemo(() => pillGeometry(trailing), [trailingKey, measured.size]); // eslint-disable-line react-hooks/exhaustive-deps
  const leadReveal = useSharedValue(lead.reveal);
  const trailReveal = useSharedValue(trail.reveal);
  useEffect(() => { leadReveal.value = lead.reveal; }, [lead.reveal, leadReveal]);
  useEffect(() => { trailReveal.value = trail.reveal; }, [trail.reveal, trailReveal]);
  const unmeasured = [...new Set([...leading, ...trailing].map((action) => action.label))].filter((label) => !measured.has(label));

  const close = useRef(() => {});
  close.current = () => {
    x.value = withSpring(0, settleSpring);
    setOpen(null);
    if (openRow?.id === id) openRow = null;
  };

  useEffect(() => {
    x.value = 0;
    fold.value = 1;
    fill.value = 0;
    armed.value = false;
    setOpen(null);
  }, [id, x, fold, fill, armed]);

  const latest = useRef({ leading, trailing });
  useEffect(() => { latest.current = { leading, trailing }; });

  const run = (side: "leading" | "trailing", index: number) => {
    latest.current[side][index]?.run();
  };
  const markOpen = (side: "leading" | "trailing" | null) => {
    setOpen(side);
    if (side) {
      if (openRow && openRow.id !== id) openRow.close();
      openRow = { id, close: () => close.current() };
    } else if (openRow?.id === id) {
      openRow = null;
    }
  };
  const startDrag = () => {
    if (openRow && openRow.id !== id) openRow.close();
    if (settled.current) clearTimeout(settled.current);
    setSwiping(true);
  };
  const endDrag = () => {
    settled.current = setTimeout(() => setSwiping(false), 250);
  };

  /** Runs an action from a full swipe or a tap on its pill, carrying the
   * finger's speed. One that removes the row sends it off and closes the
   * space as it goes; the others bring the row home, then run. */
  const perform = (side: "leading" | "trailing", index: number, velocity = 0) => {
    const action = latest.current[side][index];
    if (!action) return;
    const sign = side === "leading" ? 1 : -1;
    markOpen(null);
    if (index === 0) fill.value = withTiming(1, FAST);
    if (action.removes) {
      x.value = withSpring(sign * width.value, { ...LEAVE, velocity });
      fold.value = withDelay(FOLD_DELAY, withTiming(0, FOLD, (done) => {
        if (done) scheduleOnRN(run, side, index);
      }));
      // Back where it was if the row stays (a failure, or Undo).
      setTimeout(() => {
        x.value = 0;
        fold.value = 1;
        fill.value = 0;
      }, 1200);
    } else {
      x.value = withSpring(0, { ...HOME, velocity }, () => {
        fill.value = 0;
        scheduleOnRN(run, side, index);
      });
    }
  };

  const pan = useMemo(() => Gesture.Pan()
    .enabled(leading.length > 0 || trailing.length > 0)
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    .onStart(() => {
      start.value = x.value;
      scheduleOnRN(startDrag);
    })
    .onUpdate((event) => {
      const raw = start.value + event.translationX;
      const reveal = raw > 0 ? leadReveal.value : trailReveal.value;
      const next = reveal > 0 ? raw : rubberBand(raw, 40);
      x.value = next;
      const past = reveal > 0 && Math.abs(next) >= pillCommit(width.value, reveal);
      if (past !== armed.value) {
        armed.value = past;
        fill.value = withTiming(past ? 1 : 0, FAST);
        scheduleOnRN(haptics.tap);
      }
    })
    .onEnd((event, success) => {
      const value = x.value;
      const sign = value > 0 ? 1 : -1;
      const side = value > 0 ? "leading" : "trailing";
      const reveal = value > 0 ? leadReveal.value : trailReveal.value;
      const outward = event.velocityX * sign;
      const flick = outward > 1200 && Math.abs(value) > reveal;
      const full = success && reveal > 0 && (armed.value || flick);
      armed.value = false;
      scheduleOnRN(endDrag);
      if (full) {
        scheduleOnRN(perform, side, 0, event.velocityX);
        return;
      }
      fill.value = withTiming(0, FAST);
      const stayOpen = success && reveal > 0 && Math.abs(value) >= reveal / 2 && outward > -300;
      x.value = withSpring(stayOpen ? sign * reveal : 0, { ...settleSpring, velocity: event.velocityX });
      scheduleOnRN(markOpen, stayOpen ? side : null);
    }), [leading.length > 0, trailing.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // The swiped row becomes a card: corners round off the moment it moves,
  // and it takes the grey of a pressed row as it goes.
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    borderRadius: interpolate(Math.abs(x.value), [0, 24], [0, CARD_RADIUS], "clamp"),
  }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(x.value), [0, 48], [0, 1], "clamp") }));
  const foldStyle = useAnimatedStyle(() => fold.value < 1 ? { height: height.value * fold.value, opacity: fold.value } : {});

  return <Animated.View style={[styles.root, foldStyle]}
    onLayout={(event) => {
      width.value = event.nativeEvent.layout.width;
      if (fold.value === 1) height.value = event.nativeEvent.layout.height;
    }}>
    {(["leading", "trailing"] as const).map((side) => {
      const actions = side === "leading" ? leading : trailing;
      const geometry = side === "leading" ? lead : trail;
      return actions.length > 0 ? <View key={side} style={StyleSheet.absoluteFill} pointerEvents={open === side ? "box-none" : "none"}>
        {actions.map((action, index) => <Pill key={action.id} action={action} index={index} side={side}
          width={geometry.widths[index]!} near={geometry.near[index]!} reveal={geometry.reveal} x={x} fill={fill}
          onPress={() => perform(side, index)} />)}
      </View> : null;
    })}
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, rowStyle]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cardTint, cardStyle]} />
        <SwipeCardContext.Provider value>
          <SwipingContext.Provider value={swiping}>{children}</SwipingContext.Provider>
        </SwipeCardContext.Provider>
        {open ? <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close actions" onPress={() => close.current()} /> : null}
      </Animated.View>
    </GestureDetector>
    {unmeasured.length > 0 ? <View style={styles.measure} pointerEvents="none">
      {unmeasured.map((label) => <View key={label} onLayout={(event) => {
        measured.set(label, Math.ceil(event.nativeEvent.layout.width));
        setMeasured(measured.size);
      }}>
        <RNText style={styles.pillLabel}>{label}</RNText>
      </View>)}
    </View> : null}
  </Animated.View>;
}

/** One action's pill, in its slot `near` points in from the screen's edge. */
function Pill({ action, index, side, width: own, near, reveal, x, fill, onPress }: {
  action: SwipeAction;
  index: number;
  side: "leading" | "trailing";
  width: number;
  near: number;
  reveal: number;
  x: SharedValue<number>;
  fill: SharedValue<number>;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const colors = toneColors(action.tone, theme.ui.color as unknown as Record<string, string>);
  const sign = side === "leading" ? 1 : -1;
  const outer = index === 0;
  // Its size chases a target set by how far the row has gone: from just
  // before its slot's middle, easing in over 0.8 of its width (and always
  // whole by the time the row is open). The spring keeps it a beat behind
  // the drag, as the system swipe does, so it eases in rather than being
  // pushed out by the row's edge.
  const size = useSharedValue(0);
  useAnimatedReaction(() => {
    const start = near + own / 2 - 4;
    const span = Math.max(1, Math.min(own * 0.8, reveal - start));
    const t = Math.min(1, Math.max(0, (x.value * sign - start) / span));
    return Math.sin((t * Math.PI) / 2);
  }, (target, previous) => {
    if (target !== previous) size.value = withSpring(target, GROW);
  }, [near, own, reveal, sign]);
  const shape = useAnimatedStyle(() => {
    const distance = x.value * sign;
    const grow = Math.min(1, Math.max(0, size.value));
    const shown = Math.min(1, grow * 1.25);
    const over = Math.max(0, distance - reveal);
    const f = outer ? fill.value : 0;
    const stretched = own + over;
    const filled = Math.max(0, distance - PILL_EDGE - PILL_GAP);
    return {
      width: outer ? stretched + (filled - stretched) * f : own,
      // The inner ones are gone by the time the outer one reaches them.
      opacity: outer ? Math.max(shown, f) : shown * Math.max(0, 1 - fill.value * 3),
      // The inner ones keep their place beside the outer one as it stretches.
      transform: [{ translateX: outer ? 0 : sign * over }, { scale: grow + (1 - grow) * f }],
      backgroundColor: outer ? interpolateColor(f, [0, 1], [colors.tint, colors.fill]) : colors.tint,
    };
  }, [own, near, reveal, outer, sign, colors.tint, colors.fill]);
  const loud = useAnimatedStyle(() => ({ opacity: outer ? fill.value : 0 }), [outer]);
  // The label stays with the row's side of the pill, by the finger, as it stretches.
  const content = [styles.pillContent, { width: own }, side === "trailing" ? styles.pillContentLeft : styles.pillContentRight];
  return <Animated.View style={[styles.pill, side === "leading" ? { left: near } : { right: near }, shape]}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={action.label} style={StyleSheet.absoluteFill}>
      <View style={content}>
        <Icon name={action.icon} size={PILL_ICON} color={colors.ink} />
        <RNText style={[styles.pillLabel, { color: colors.ink }]} numberOfLines={1}>{action.label}</RNText>
      </View>
      {outer ? <Animated.View style={[content, loud]}>
        <Icon name={action.icon} size={PILL_ICON} color={colors.onFill} />
        <RNText style={[styles.pillLabel, { color: colors.onFill }]} numberOfLines={1}>{action.label}</RNText>
      </Animated.View> : null}
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create((theme) => ({
  root: { overflow: "hidden", backgroundColor: theme.ui.color.bg },
  strip: { position: "absolute", top: 0, bottom: 0, justifyContent: "center" },
  stripLeading: { left: 0 },
  stripTrailing: { right: 0 },
  cluster: { position: "absolute", flexDirection: "row", alignItems: "flex-start", gap: GAP },
  clusterLeading: { right: EDGE },
  clusterTrailing: { left: EDGE },
  slot: { alignItems: "center", gap: 3 },
  press: { alignSelf: "stretch" },
  shape: {
    height: CIRCLE, borderRadius: theme.ui.radius.full, borderCurve: "continuous",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  glyph: { position: "absolute", width: CIRCLE, height: CIRCLE, alignItems: "center", justifyContent: "center" },
  // Laid out at the capsule's full width and centred, so growing never
  // re-wraps the label; the shape clips it until it's wide enough.
  inline: { position: "absolute", height: CIRCLE, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  under: { width: CIRCLE + 24, alignItems: "center" },
  measure: { position: "absolute", top: 0, left: 0, width: 400, flexDirection: "row", alignItems: "flex-start", opacity: 0 },
  // The pill row's moving card, over the page's colour, with the tint of a swiped row.
  card: { backgroundColor: theme.ui.color.bg, overflow: "hidden", borderCurve: "continuous" },
  // The separator's grey: about the grey iOS gives a row being swiped.
  cardTint: { backgroundColor: theme.ui.color.separator },
  pill: {
    position: "absolute", top: "50%", marginTop: -PILL / 2, height: PILL,
    borderRadius: theme.ui.radius.full, borderCurve: "continuous", overflow: "hidden",
  },
  pillContent: { position: "absolute", top: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: PILL_ICON_GAP },
  pillContentLeft: { left: 0 },
  pillContentRight: { right: 0 },
  pillLabel: { fontFamily: faces.textMedium, fontSize: theme.ui.type.subhead.size, lineHeight: theme.ui.type.subhead.line },
}));
