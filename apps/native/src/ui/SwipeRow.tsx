import { createContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing, interpolate, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue,
} from "react-native-reanimated";
import { settleSpring } from "../kit/motion";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "../platform/haptics";
import { face } from "./fonts";
import { Icon, type IconName } from "./Icon";
import { motion, project, rubberBand, spring } from "./motion";
import { motionTrial } from "./motion-trial";

/** What an action is, which sets its colour: pink saves, blue reads, green
 * is applied, purple queues an application, gray hides and undoes (owner,
 * 2026-11-08, Paper "Swipe buttons · label under, colours · Nov 8", 4). */
export type SwipeTone = "accent" | "find" | "apply" | "queue" | "neutral";

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

const FAST = { duration: 200, easing: Easing.bezier(0.23, 1, 0.32, 1) };

/** True while a row is being swiped, so the row inside can skip its press
 * highlight and its tap (the swipe doesn't always cancel the touch). */
export const SwipingContext = createContext(false);

/** True inside a swipe row, whose own card is the row's background, so the
 * row inside stays clear. */
export const SwipeCardContext = createContext(false);

/** One row open at a time: opening another, or scrolling, closes it. */
let openRow: { id: string; close: () => void } | null = null;

export function closeOpenSwipeRow() {
  openRow?.close();
}

/** A tone's solid capsule, as iOS Mail colours its swipes, under a white glyph. */
function swipeColor(tone: SwipeTone, color: Record<string, string>): string {
  switch (tone) {
    case "accent": return color["accent-fill"]!;
    case "find": return color["swipe-read"]!;
    case "apply": return color["swipe-applied"]!;
    case "queue": return color["swipe-queue"]!;
    case "neutral": return color["swipe-neutral"]!;
  }
}

/** The glyph a swipe draws: filled, as Mail's are, except Applied's check,
 * a heavy line (a filled check-circle read as a badge). */
function swipeGlyph(icon: IconName): { name: IconName; weight: "line" | "fill"; stroke?: number } {
  if (icon === "applied") return { name: "done", weight: "line", stroke: 2.9 };
  return { name: icon, weight: "fill" };
}

/**
 * Swipe actions after iOS Mail (owner, 2026-10-24, approved in Kit → Swipes;
 * docs/swipe-frame-analysis-2026-10-24.md; replacing S4's circles). The actions are pills sized to
 * their icon and label, each in a fixed slot at the screen's edge, growing
 * in as the row uncovers it, so nothing slides in cut off. Once they're all
 * out they stay put; past that, the outer one (the one a full swipe runs)
 * stretches toward the row, and past the commit point it fills, solid, to
 * the row's edge. The row being swiped turns into a card: a grey fill and
 * rounded corners. Letting go carries the finger's speed; a full swipe that
 * removes the row leaves and closes up in one motion, and one that doesn't
 * runs once the row is home, so nothing changes while it moves.
 */
// After iOS Mail (owner, 2026-11-08, Paper "Swipe buttons · label under,
// colours · Nov 8", 4): a solid capsule wider than tall with a white glyph,
// its label under it in ink-3, 10 apart and 10 from the screen's edge.
// Capsule and label together are a two-line row's height.
const CAPSULE_W = 60;
const CAPSULE_H = 44;
const LABEL_GAP = 2;
/** The whole button: capsule, gap and a Footnote line. */
const PILL = CAPSULE_H + LABEL_GAP + 18;
const PILL_ICON = 22;
const PILL_GAP = 10;
const PILL_EDGE = 10;
/** The glyph grows this much as a full swipe arms, with the haptic. */
const ARMED_SCALE = 1.15;
const CARD_RADIUS = 22;
/** A pill chasing its target size: critically damped, a beat behind the drag. */
const GROW = { ...spring(motion.swipe.grow), overshootClamping: true };
/** Home after an action that keeps the row: brisker than a settle, and it
 * stops creeping sooner, so the action runs without a wait. */
const HOME = { duration: 300, dampingRatio: 1, overshootClamping: true, energyThreshold: 1e-5 } as const;
/** Leaving rides the finger's speed, without overshooting. */
const LEAVE = { duration: 320, dampingRatio: 1, overshootClamping: true } as const;
/** Let go this far along (or heading this far) and the row opens on its
 * actions; short of it, it closes (owner, 2026-10-24: half the actions'
 * width asked for too long a swipe). The row only starts moving after 14pt
 * of finger, so this opens from about a 22pt drag; Reminders opens from 18. */
const OPEN_AT = 8;
/** The space closes once the row is mostly gone, so leaving and closing up read as one. */
const FOLD_DELAY = 120;
const FOLD = { duration: 240, easing: Easing.bezier(0.2, 0.7, 0.2, 1) };
/** Undo plays Hide backwards (flow run 2.36; Paper "1 · Undo brings the job
 * back", 2026-11-08): the space opens on the fold's curve, and the row
 * slides back in from the edge it left by, a beat behind, landing in a
 * space that's already open. */
const RETURN_DELAY = 60;
/** Rows that just left, by id, and the way they went. One that comes back
 * within the window (Undo, or an action that failed) plays it backwards. */
const gone = new Map<string, { sign: 1 | -1; at: number }>();
const RETURN_WINDOW = 15_000;

/** Each pill's width and its distance from the screen's edge, outer first,
 * and how far the row opens to show them all. */
function pillGeometry(actions: readonly SwipeAction[]) {
  const widths = actions.map(() => CAPSULE_W);
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

export function SwipeRow({ id, leading: given = [], trailing: givenTrailing = [], children }: SwipeRowProps) {
  // What the pills say. An action freezes them until the next swipe, so a
  // row going home after Save still says Save, and the next swipe says
  // Unsave, as Mail's rows do (owner, 2026-11-07: it changed on the way home).
  const [frozen, setFrozen] = useState<{ leading: readonly SwipeAction[]; trailing: readonly SwipeAction[] } | null>(null);
  const leading = frozen?.leading ?? given;
  const trailing = frozen?.trailing ?? givenTrailing;
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const width = useSharedValue(390);
  const height = useSharedValue(0);
  const fold = useSharedValue(1);
  const armed = useSharedValue(false);
  /** 0 to 1: the outer pill filling, solid, to the row's edge. */
  const fill = useSharedValue(0);
  const hush = useSharedValue(0);
  const [open, setOpen] = useState<"leading" | "trailing" | null>(null);
  const [swiping, setSwiping] = useState(false);
  const settled = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leadingKey = leading.map((action) => action.label).join("|");
  const trailingKey = trailing.map((action) => action.label).join("|");
  const lead = useMemo(() => pillGeometry(leading), [leadingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const trail = useMemo(() => pillGeometry(trailing), [trailingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const leadReveal = useSharedValue(lead.reveal);
  const trailReveal = useSharedValue(trail.reveal);
  useEffect(() => { leadReveal.value = lead.reveal; }, [lead.reveal, leadReveal]);
  useEffect(() => { trailReveal.value = trail.reveal; }, [trail.reveal, trailReveal]);

  const close = useRef(() => {});
  close.current = () => {
    x.value = withSpring(0, settleSpring);
    setOpen(null);
    if (openRow?.id === id) openRow = null;
  };

  const restore = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Before the first paint, so a row coming back never shows a frame of
  // whatever this cell held before.
  useLayoutEffect(() => {
    if (restore.current) clearTimeout(restore.current);
    fill.value = 0;
    armed.value = false;
    setOpen(null);
    setFrozen(null);
    const left = gone.get(id);
    gone.delete(id);
    if (left && Date.now() - left.at < RETURN_WINDOW && motionTrial("undo")) {
      fold.value = 0;
      hush.value = 1;
      x.value = left.sign * width.value;
      fold.value = withTiming(1, FOLD);
      // Just the row comes back, not the actions it left by.
      x.value = withDelay(RETURN_DELAY, withSpring(0, LEAVE, () => { hush.value = 0; }));
      return;
    }
    x.value = 0;
    fold.value = 1;
    hush.value = 0;
  }, [id, x, fold, fill, armed, width, hush]);

  // Actions run from the row's current ones, whatever the pills still say.
  const latest = useRef({ leading: given, trailing: givenTrailing });
  useEffect(() => { latest.current = { leading: given, trailing: givenTrailing }; });

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
    setFrozen(null);
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
    setFrozen({ ...latest.current });
    markOpen(null);
    if (index === 0) fill.value = withTiming(1, FAST);
    if (action.removes) {
      gone.set(id, { sign, at: Date.now() });
      x.value = withSpring(sign * width.value, { ...LEAVE, velocity });
      fold.value = withDelay(FOLD_DELAY, withTiming(0, FOLD, (done) => {
        if (done) scheduleOnRN(run, side, index);
      }));
      // Back where it was if the row stays (a failure, or Undo).
      if (restore.current) clearTimeout(restore.current);
      restore.current = setTimeout(() => {
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
    .enabled(given.length > 0 || givenTrailing.length > 0)
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
      // As iOS does (Reminders, measured 2026-10-24): from closed, almost any
      // deliberate swipe opens all the way, once where the row was heading
      // passes OPEN_AT. From open, it closes once you've pushed it back past
      // half. Either way, moving back toward closed closes it.
      const heading = Math.abs(value) + project(outward);
      const threshold = start.value === 0 ? Math.min(OPEN_AT, reveal / 2) : reveal / 2;
      const stayOpen = success && reveal > 0 && outward > -150 && heading >= threshold;
      x.value = withSpring(stayOpen ? sign * reveal : 0, { ...settleSpring, velocity: event.velocityX });
      scheduleOnRN(markOpen, stayOpen ? side : null);
    }), [given.length > 0, givenTrailing.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // The swiped row becomes a card: corners round off the moment it moves,
  // and it takes the grey of a pressed row as it goes.
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    borderRadius: interpolate(Math.abs(x.value), [0, 24], [0, CARD_RADIUS], "clamp"),
  }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(x.value), [0, 48], [0, 1], "clamp") }));
  // The line above belongs to the row before; it would sit right on the
  // buttons' tops, so it gives way while this row is open (owner,
  // 2026-11-08: "hairline above the icons looks off").
  const lineCover = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(x.value), [0, 8], [0, 1], "clamp") }));
  // Back to its own height and fully shown, said outright: Reanimated keeps
  // a style it stops returning, so `{}` left a hidden row's cell folded shut,
  // and the job Undo put back (or the next job in that cell) stayed invisible
  // (owner, 2026-11-07).
  const foldStyle = useAnimatedStyle(() => fold.value < 1
    ? { height: height.value * fold.value, opacity: fold.value }
    : { height: "auto" as const, opacity: 1 });

  return <Animated.View style={[styles.root, foldStyle]}
    onLayout={(event) => {
      width.value = event.nativeEvent.layout.width;
      if (fold.value === 1) height.value = event.nativeEvent.layout.height;
    }}>
    <Animated.View pointerEvents="none" style={[styles.lineCover, lineCover]} />
    {(["leading", "trailing"] as const).map((side) => {
      const actions = side === "leading" ? leading : trailing;
      const geometry = side === "leading" ? lead : trail;
      return actions.length > 0 ? <View key={side} style={StyleSheet.absoluteFill} pointerEvents={open === side ? "box-none" : "none"}>
        {actions.map((action, index) => <Pill key={action.id} action={action} index={index} side={side}
          width={geometry.widths[index]!} near={geometry.near[index]!} reveal={geometry.reveal} x={x} fill={fill} hush={hush}
          onPress={() => perform(side, index)} />)}
      </View> : null;
    })}
    <GestureDetector gesture={pan}>
      {/* The card keeps its own height while the cell folds, so a row
          coming back knows how far to open. */}
      <Animated.View style={[styles.card, rowStyle]} onLayout={(event) => { height.value = event.nativeEvent.layout.height; }}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cardTint, cardStyle]} />
        <SwipeCardContext.Provider value>
          <SwipingContext.Provider value={swiping}>{children}</SwipingContext.Provider>
        </SwipeCardContext.Provider>
        {open ? <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close actions" onPress={() => close.current()} /> : null}
      </Animated.View>
    </GestureDetector>
  </Animated.View>;
}

/** One action's button, in its slot `near` points in from the screen's edge. */
function Pill({ action, index, side, width: own, near, reveal, x, fill, hush, onPress }: {
  action: SwipeAction;
  index: number;
  side: "leading" | "trailing";
  width: number;
  near: number;
  reveal: number;
  x: SharedValue<number>;
  fill: SharedValue<number>;
  /** 1 while a row comes back: its actions stay out of sight. */
  hush: SharedValue<number>;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const solid = swipeColor(action.tone, theme.ui.color as unknown as Record<string, string>);
  const glyph = swipeGlyph(action.icon);
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
    // Armed, it reaches the row; its outer edge stays in its slot (owner,
    // 2026-11-08: only the row's side should grow).
    const filled = Math.max(0, distance - PILL_EDGE - PILL_GAP);
    return {
      width: outer ? stretched + (filled - stretched) * f : own,
      // The inner ones are gone by the time the outer one reaches them.
      opacity: (outer ? Math.max(shown, f) : shown * Math.max(0, 1 - fill.value * 3)) * (1 - hush.value),
      // The inner ones keep their place beside the outer one as it stretches.
      transform: [{ translateX: outer ? 0 : sign * over }, { scale: grow + (1 - grow) * f }],
    };
  }, [own, near, reveal, outer, sign]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: outer ? 1 + (ARMED_SCALE - 1) * fill.value : 1 }] }), [outer]);
  // The glyph and label stay at the row's side, by the finger, as it stretches.
  const anchor = side === "trailing" ? styles.anchorLeft : styles.anchorRight;
  return <Animated.View style={[styles.pill, side === "leading" ? { left: near } : { right: near }, shape]}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={action.label} style={StyleSheet.absoluteFill}>
      <View style={[styles.capsule, { backgroundColor: solid }]}>
        <Animated.View style={[styles.glyph, { width: own }, anchor, pop]}>
          <Icon name={glyph.name} weight={glyph.weight} stroke={glyph.stroke} size={PILL_ICON} tone="accent-ink" />
        </Animated.View>
      </View>
      <RNText style={[styles.label, { width: own + PILL_GAP }, side === "trailing" ? styles.labelLeft : styles.labelRight]}
        numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{action.label}</RNText>
    </Pressable>
  </Animated.View>;
}

/** A swipe action standing still, as a row shows it once open: You → Swipe
 * actions draws its preview with these, and a tap picks what goes there
 * (owner, 2026-11-08, Paper "Choosing swipe actions · Nov 8", B). */
export function SwipeButton({ action }: { action: Pick<SwipeAction, "label" | "icon" | "tone"> }) {
  const { theme } = useUnistyles();
  const glyph = swipeGlyph(action.icon);
  return <View style={styles.still}>
    <View style={[styles.stillCapsule, { backgroundColor: swipeColor(action.tone, theme.ui.color as unknown as Record<string, string>) }]}>
      <Icon name={glyph.name} weight={glyph.weight} stroke={glyph.stroke} size={PILL_ICON} tone="accent-ink" />
    </View>
    <RNText style={[styles.label, styles.stillLabel]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{action.label}</RNText>
  </View>;
}

/** The size of a swipe button, for a slot drawn without one (Swipe actions' None). */
export const SWIPE_BUTTON = { width: CAPSULE_W, height: CAPSULE_H, gap: LABEL_GAP, spacing: PILL_GAP } as const;

const styles = StyleSheet.create((theme) => ({
  // A hairline higher than its cell, over the row before's separator, which
  // `lineCover` hides while this row is swiped. Clear itself, so the line
  // shows the rest of the time.
  root: { overflow: "hidden", marginTop: -StyleSheet.hairlineWidth, paddingTop: StyleSheet.hairlineWidth },
  lineCover: { position: "absolute", top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: theme.ui.color.bg },
  // The row's moving card, over the page's colour, with the tint of a swiped row.
  card: { backgroundColor: theme.ui.color.bg, overflow: "hidden", borderCurve: "continuous" },
  // The separator's grey: about the grey iOS gives a row being swiped.
  cardTint: { backgroundColor: theme.ui.color.separator },
  pill: { position: "absolute", top: "50%", marginTop: -PILL / 2, height: PILL },
  capsule: {
    position: "absolute", top: 0, left: 0, right: 0, height: CAPSULE_H,
    borderRadius: CAPSULE_H / 2, borderCurve: "continuous", overflow: "hidden",
  },
  glyph: { position: "absolute", top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  anchorLeft: { left: 0 },
  anchorRight: { right: 0 },
  label: {
    ...face.text, fontSize: theme.ui.type.footnote.size, lineHeight: theme.ui.type.footnote.line,
    color: theme.ui.color["ink-3"], textAlign: "center",
  },
  // Centred under the capsule, a little wider so "Not applied" fits.
  labelLeft: { position: "absolute", top: CAPSULE_H + LABEL_GAP, left: -PILL_GAP / 2 },
  labelRight: { position: "absolute", top: CAPSULE_H + LABEL_GAP, right: -PILL_GAP / 2 },
  still: { width: CAPSULE_W, alignItems: "center", gap: LABEL_GAP },
  stillCapsule: {
    width: CAPSULE_W, height: CAPSULE_H, borderRadius: CAPSULE_H / 2, borderCurve: "continuous",
    alignItems: "center", justifyContent: "center",
  },
  stillLabel: { width: CAPSULE_W + PILL_GAP },
}));
