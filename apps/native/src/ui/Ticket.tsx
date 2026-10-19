import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Dimensions, Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing, interpolateColor, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "../platform/haptics";
import { faces } from "./fonts";
import { Grain } from "./Grain";
import { Icon } from "./Icon";
import { motion, timing } from "./motion";
import { fallTime, RIP_TICKS, stubPose } from "./stub-motion";
import { StampFrame } from "./StampFrame";
import { Text } from "./Text";

export interface TicketFact {
  label: string;
  value: string;
  /** A check after the value: it matches your saved search. */
  matched?: boolean;
  /** A quieter line under the value ("Seattle, Austin and 3 more"). */
  detail?: string;
  /** Makes the detail line a button with a chevron (the full list of places). */
  onPress?: () => void;
}

export type TicketBackdrop = "bg" | "screen-grouped";

export interface TicketProps {
  /** One or two facts per row (Level and Pay, Location, Visa and Experience). */
  rows: TicketFact[][];
  /** The stub under the perforation: posted, deadline, source. */
  stub?: string;
  /** After Apply the stub has torn off into the Tracker; the ticket keeps a torn edge. */
  torn?: boolean;
  /** The colour behind the ticket, which shows through the holes and notches. */
  backdrop?: TicketBackdrop;
  /** What a tearing stub falls behind: the job page's pinned Save and Apply
   * bar. Without one it drops a little way and fades. */
  catcher?: RefObject<View | null>;
  /** The torn stub is out of sight (or there was none to watch): the moment
   * for the bar to change. */
  onCaught?: () => void;
}

/** Kit only: slows the tear down so it can be watched frame by frame (1 is
 * real time). */
let pace = 1;
export function setTearPace(next: number) {
  pace = next;
}

/** The stub on its way out (tearing and falling) or back in (Undo). */
type Flight = "falling" | "rising";

/** How far the stub drops with nothing to catch it. */
const SHORT_DROP = 56;

/** The job's facts as a printed ticket: faint grain, a slight lift, and a stub
 * punched along its perforation. On Apply the stub tears off from its left
 * end and falls behind the page's pinned bar (Paper "The stub tears off,
 * frame by frame"); Undo brings it back the same way. */
export function Ticket({ rows, stub, torn = false, backdrop = "bg", catcher, onCaught }: TicketProps) {
  const { theme } = useUnistyles();
  const radius = theme.ui.radius.lg;
  const [width, setWidth] = useState(0);
  const holeColor = theme.ui.color[backdrop];
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));
  const root = useRef<View>(null);
  // Where the stub sat on the ticket, for the piece that leaves it.
  const [frame, setFrame] = useState<{ y: number; height: number } | null>(null);
  const [shown, setShown] = useState(torn);
  const [flight, setFlight] = useState<{ kind: Flight; id: number } | null>(null);
  if (shown !== torn) {
    setShown(torn);
    // A ticket that never showed its stub has nothing to tear or bring back.
    setFlight(stub && frame ? { kind: torn ? "falling" : "rising", id: (flight?.id ?? 0) + 1 } : null);
  }
  const caught = useRef(onCaught);
  caught.current = onCaught;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    // Torn with no stub to watch: the bar changes straight away.
    if (torn && !(stub && frame)) caught.current?.();
  }, [torn]);
  const piece = useStubFlight(flight, { root, catcher, frame, width, onDone: (id, landed) => {
    setFlight((current) => (current?.id === id ? null : current));
    if (landed) caught.current?.();
  } });

  const tornNow = torn || flight !== null;
  return <View ref={root} style={[styles.ticket, tornNow && styles.tornTicket, tornNow && styles.tornSpace,
    // Coming back, it keeps the stub's room so the page below moves first.
    flight?.kind === "rising" && frame ? { marginBottom: frame.height } : null]} onLayout={onLayout}>
    <Grain radius={radius} flatBottom={tornNow} />
    {rows.map((row, index) => <View key={index} style={[styles.row, index > 0 && styles.ruled]}>
      {row.map((fact) => <Fact key={fact.label} fact={fact} />)}
    </View>)}
    {stub && !tornNow ? <View onLayout={(event) => setFrame({ y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height })}>
      <Perforation width={width} color={holeColor} />
      <View style={styles.stub}><Text role="footnote" tone="ink-3">{stub}</Text></View>
    </View> : null}
    {stub && flight && frame && width > 0 ? <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.piece, { top: frame.y + TEAR_STRIP, height: frame.height - TEAR_STRIP }, piece]}>
      <Grain radius={radius} flatTop />
      <View style={stubStyles.tear} pointerEvents="none">
        <Svg width={width} height={TEAR_STRIP} style={stubStyles.flip}>
          <Path d={tornEdge(width)} fill={theme.ui.color.paper} />
          <Path d={tornEdge(width)} fill={theme.ui.color.grain} opacity={GRAIN_ALPHA} />
        </Svg>
      </View>
      <View style={styles.stub}><Text role="footnote" tone="ink-3">{stub}</Text></View>
    </Animated.View> : null}
    {tornNow && width > 0 ? <Fragment>
      <View style={styles.tear} pointerEvents="none">
        <Svg width={width} height={TEAR_STRIP}>
          <Path d={tornEdge(width)} fill={theme.ui.color.paper} />
          <Path d={tornEdge(width)} fill={theme.ui.color.grain} opacity={GRAIN_ALPHA} />
        </Svg>
      </View>
      <View style={[styles.halfNotch, styles.notchLeft, { backgroundColor: holeColor }]} pointerEvents="none" />
      <View style={[styles.halfNotch, styles.notchRight, { backgroundColor: holeColor }]} pointerEvents="none" />
    </Fragment> : null}
  </View>;
}

function Fact({ fact }: { fact: TicketFact }) {
  const { theme } = useUnistyles();
  const value = <View style={styles.value}>
    <View style={styles.shrink}>
      <Text weight="medium" accessibilityLabel={fact.matched ? `${fact.value}, matches your search` : undefined}>{fact.value}</Text>
    </View>
    {fact.matched ? <Icon name="matches" size={16} tone="ink-3" /> : null}
  </View>;
  const detail = fact.detail ? <View style={styles.detail}>
    <Text role="subhead" tone="ink-2" flex>{fact.detail}</Text>
    {fact.onPress ? <Icon name="disclosure" size={12} tone="ink-4" /> : null}
  </View> : null;
  return <View style={styles.fact}>
    <Text role="footnote" tone="ink-3">{fact.label}</Text>
    {value}
    {detail && fact.onPress
      ? <Pressable accessibilityRole="button" accessibilityLabel={`${fact.detail}, show all`} onPress={fact.onPress}
        style={({ pressed }) => pressed && styles.pressed}>{detail}</Pressable>
      : detail}
  </View>;
}

export interface StubStamp {
  key: string;
  /** "INTERVIEWING". */
  label: string;
  /** "OCT 12 · EMAIL". */
  detail: string;
  /** Sent but not yet confirmed: dashed and quiet however fresh. */
  pending?: boolean;
  /** Tapping the stamp fixes its step's date (owner, 2026-10-19, Paper
   * "Step dates · Oct 19"). */
  onPress?: () => void;
}

export interface StubProps {
  /** Oldest first; the last is the freshest ink. */
  stamps: StubStamp[];
  /** Beside a lone stamp: how long it's been ("15 days", "no reply yet"). */
  aside?: ReactNode;
  /** The ticket's old stub line: posted, source. */
  foot?: string;
  /** A tappable word at the foot's end ("Not right?"); `opens` adds a
   * chevron for one that goes to a page ("What it sent ›"). */
  action?: { label: string; onPress: () => void; opens?: boolean };
  backdrop?: TicketBackdrop;
}

/** Each stamp lands at its own angle, as a hand would put it down. */
const STAMP_ANGLES = [-3, 2, -1.5, 2.5, -2, 1.5];

/**
 * Your stub (Paper "C · Your stub"): the part of the ticket that tore off when
 * you applied and went to Tracker. It carries the application's history as
 * rubber stamps, one per step, the newest in full ink. Its top is the other
 * half of the ticket's tear: the holes' lower halves and the notches'.
 */
export function Stub({ stamps, aside, foot, action, backdrop = "bg" }: StubProps) {
  const { theme } = useUnistyles();
  const [width, setWidth] = useState(0);
  // The stamps already there when the page opened; only later ones land.
  const seen = useRef<Set<string> | null>(null);
  seen.current ??= new Set(stamps.map((stamp) => stamp.key));
  useEffect(() => { for (const stamp of stamps) seen.current?.add(stamp.key); }, [stamps]);
  const holeColor = theme.ui.color[backdrop];
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));
  return <View style={stubStyles.stub} onLayout={onLayout}>
    <Grain radius={theme.ui.radius.lg} flatTop />
    {width > 0 ? <Fragment>
      <View style={stubStyles.tear} pointerEvents="none">
        <Svg width={width} height={TEAR_STRIP} style={stubStyles.flip}>
          <Path d={tornEdge(width)} fill={theme.ui.color.paper} />
          <Path d={tornEdge(width)} fill={theme.ui.color.grain} opacity={GRAIN_ALPHA} />
        </Svg>
      </View>
      <View style={[stubStyles.halfNotch, styles.notchLeft, { backgroundColor: holeColor }]} pointerEvents="none" />
      <View style={[stubStyles.halfNotch, styles.notchRight, { backgroundColor: holeColor }]} pointerEvents="none" />
    </Fragment> : null}
    <View style={stubStyles.stamps}>
      {stamps.map((stamp, index) => {
        const mark = <RubberStamp stamp={stamp} fresh={index === stamps.length - 1}
          angle={STAMP_ANGLES[index % STAMP_ANGLES.length]!} arrived={!seen.current?.has(stamp.key)} />;
        return stamp.onPress
          ? <Pressable key={stamp.key} onPress={stamp.onPress} accessibilityRole="button" accessibilityHint="Changes its date"
            accessibilityLabel={`${stamp.label.toLowerCase()}, ${stamp.detail.toLowerCase()}`} style={({ pressed }) => pressed && styles.pressed}>
            {mark}
          </Pressable>
          : <Fragment key={stamp.key}>{mark}</Fragment>;
      })}
      {aside ? <View style={stubStyles.aside}>{aside}</View> : null}
    </View>
    {foot || action ? <View style={stubStyles.foot}>
      {width > 0 ? <Svg width={width - 2 * theme.ui.space["4"]} height={1} style={stubStyles.rule}>
        <Line x1={0} y1={0.5} x2={width} y2={0.5} stroke={theme.ui.color["ink-4"]} strokeWidth={1} strokeDasharray="3 3" />
      </Svg> : null}
      <View style={stubStyles.footRow}>
        <Text role="footnote" tone="ink-3" flex>{foot ?? ""}</Text>
        {action ? <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={10}
          style={({ pressed }) => pressed && styles.pressed}>
          <View style={stubStyles.action}>
            <Text role="footnote" weight="medium" tone="ink-2">{action.label}</Text>
            {action.opens ? <Icon name="disclosure" size={10} tone="ink-3" /> : null}
          </View>
        </Pressable> : null}
      </View>
    </View> : null}
  </View>;
}

/** A stamp; one that `arrived` while you look comes down onto the paper
 * (tokens `motion.stamp`) with a tap as it meets it, and the one before it
 * fades to `ink-3`. */
function RubberStamp({ stamp, fresh, angle, arrived }: { stamp: StubStamp; fresh: boolean; angle: number; arrived: boolean }) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const full = fresh && !stamp.pending;
  const [dark, light] = [theme.ui.color.ink, theme.ui.color["ink-3"]];
  const ink = useSharedValue(full ? 1 : 0);
  useEffect(() => { ink.value = withTiming(full ? 1 : 0, { duration: 200 }); }, [full, ink]);
  const { land } = motion.stamp;
  const press = useSharedValue(arrived ? 0 : 1);
  useEffect(() => {
    if (!arrived) return;
    press.value = withTiming(1, timing(land), (finished) => { if (finished) scheduleOnRN(stampDown); });
    // Only as it first appears.
  }, []);
  const body = useAnimatedStyle(() => ({
    opacity: press.value,
    transform: [{ rotate: `${angle}deg` }, { scale: reduced ? 1 : land.from + (1 - land.from) * press.value }],
  }));
  const words = useAnimatedStyle(() => ({ color: interpolateColor(ink.value, [0, 1], [light, dark]) }));
  // The full ink lies over the faded one, so fading is the top frame going.
  const fullInk = useAnimatedStyle(() => ({ opacity: ink.value }));
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  return <Animated.View accessible accessibilityLabel={`${stamp.label.toLowerCase()}, ${stamp.detail.toLowerCase()}`}
    onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
    style={[stubStyles.stamp, body]}>
    {size ? <Fragment>
      <StampFrame {...size} color={light} dashed={stamp.pending} />
      <Animated.View style={[stubStyles.fill, fullInk]} pointerEvents="none"><StampFrame {...size} color={dark} dashed={stamp.pending} /></Animated.View>
    </Fragment> : null}
    <Animated.Text style={[stubStyles.stampLabel, words]} maxFontSizeMultiplier={1.4}>{stamp.label}</Animated.Text>
    <Animated.Text style={[stubStyles.stampDetail, words]} maxFontSizeMultiplier={1.4}>{stamp.detail}</Animated.Text>
  </Animated.View>;
}

/**
 * The torn stub's flight along its path (`stub-motion.ts`): one clock, in
 * seconds, drives the whole tear and fall, so it never stalls where they
 * meet. The rip's ticks play as the clock passes them, and the piece is
 * caught once all of it is behind the catcher's top edge. Rising (Undo) runs
 * the same path back a little quicker, with a tap as it meets the ticket.
 * Either can turn round halfway: the clock just changes direction.
 */
function useStubFlight(flight: { kind: Flight; id: number } | null, { root, catcher, frame, width, onDone }: {
  root: RefObject<View | null>;
  catcher?: RefObject<View | null>;
  frame: { y: number; height: number } | null;
  width: number;
  onDone: (id: number, landed: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const clock = useSharedValue(0);
  const opacity = useSharedValue(1);
  const box = useSharedValue({ width: 0, height: 0 });
  const moving = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  // The rip: a light tap each time the clock passes one of its ticks (one
  // a frame at most). Only on the way out.
  useAnimatedReaction(() => clock.value, (now, before) => {
    if (before === null || now <= before) return;
    for (const at of RIP_TICKS) {
      if (at > before && at <= now) {
        scheduleOnRN(rip);
        break;
      }
    }
  });

  useEffect(() => {
    if (!flight) {
      moving.current = false;
      return;
    }
    const { kind, id } = flight;
    const turning = moving.current;
    moving.current = true;
    const finish = (landed: boolean) => {
      if (!landed) haptics.tap();
      done.current(id, landed);
    };
    const height = frame ? frame.height - TEAR_STRIP : 0;
    measureDrop(root, catcher, frame, (drop) => {
      const catching = Boolean(catcher?.current);
      if (kind === "falling") {
        if (!turning) {
          box.value = { width, height };
          clock.value = 0;
          // The rip's first tick, as the tear starts.
          rip();
        }
        // Out of view, or Reduce Motion: it just goes.
        if (drop === null || reduced) {
          opacity.value = withTiming(0, { duration: reduced ? 200 : 0 }, (finished) => { if (finished) scheduleOnRN(finish, true); });
          return;
        }
        const end = fallTime(drop, width, height);
        const ms = Math.max(end - clock.value, 0) * 1000 * pace;
        if (!catching) opacity.value = withTiming(0, { duration: ms, easing: Easing.in(Easing.cubic) });
        clock.value = withTiming(end, { duration: ms, easing: Easing.linear }, (finished) => { if (finished) scheduleOnRN(finish, true); });
        return;
      }
      if (drop === null || reduced) {
        clock.value = 0;
        if (!turning) opacity.value = 0;
        opacity.value = withTiming(1, { duration: drop === null ? 0 : 200 }, (finished) => { if (finished) scheduleOnRN(finish, false); });
        return;
      }
      if (!turning) {
        box.value = { width, height };
        clock.value = fallTime(drop, width, height);
        opacity.value = catching ? 1 : 0;
      }
      const ms = clock.value * 1000 * pace * motion.stub.rise.pace;
      opacity.value = withTiming(1, { duration: ms });
      clock.value = withTiming(0, { duration: ms, easing: Easing.linear }, (finished) => { if (finished) scheduleOnRN(finish, false); });
    });
    // A new flight (its id) starts the motion; the rest is read as it is then.
  }, [flight?.id]);

  return useAnimatedStyle(() => {
    const pose = stubPose(clock.value, box.value.width, box.value.height);
    return {
      opacity: opacity.value,
      transform: [{ translateX: pose.x }, { translateY: pose.y }, { rotate: `${pose.angle}deg` }, { scale: pose.scale }],
    };
  });
}

/** A stamp meeting the paper. */
function stampDown() {
  haptics.tap();
}

/** One tick of the rip: a light tap (owner, 2026-10-18). */
function rip() {
  haptics.tap();
}

/**
 * The page's half of the tear (Paper "The stub tears off, frame by frame"):
 * the ticket tears only once nothing covers the page (the in-app browser,
 * "Did you apply?"), so you see it go, and the pinned bar says Applied when
 * the stub has fallen behind it, with a dip and the success haptic. Give
 * `bar` to the pinned bar and `catcher`/`onCaught` to the Ticket; scale the
 * bar's buttons with `dip`.
 */
export function useStubCatch(applied: boolean, covered: boolean) {
  const bar = useRef<View>(null);
  const [caught, setCaught] = useState(applied);
  if (!applied && caught) setCaught(false);
  const scale = useSharedValue(1);
  const onCaught = () => {
    const dip = motion.stub.catch;
    const out = Easing.bezier(...dip.curve);
    scale.value = withSequence(withTiming(dip.scale, { duration: dip.down * pace, easing: out }), withTiming(1, { duration: dip.up * pace, easing: out }));
    haptics.success();
    setCaught(true);
  };
  const dip = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return { torn: applied && !covered, applied: applied && caught, bar, onCaught, dip };
}

/** How far the stub falls: until its top is just behind the catcher's top
 * edge, or a short way with nothing to catch it. Null when the ticket is
 * scrolled out of view, where nobody would see it go. */
function measureDrop(root: RefObject<View | null>, catcher: RefObject<View | null> | undefined,
  frame: { y: number; height: number } | null, done: (drop: number | null) => void) {
  const ticket = root.current;
  if (!ticket || !frame) return done(null);
  ticket.measureInWindow((_x, ticketTop) => {
    const top = ticketTop + frame.y + TEAR_STRIP;
    if (top > Dimensions.get("window").height || top + frame.height < 0) return done(null);
    const bar = catcher?.current;
    if (!bar) return done(SHORT_DROP);
    bar.measureInWindow((_bx, barTop) => done(Math.max(barTop - top + 2, SHORT_DROP)));
  });
}

/** The tile's average alpha, for the sliver of torn paper the tile can't reach. */
const GRAIN_ALPHA = 0.16;

const DOT_SPACING = 6;
const DOT = 1.5;
const NOTCH = 16;

/** The perforation's hole centres across a ticket this wide, centred between the notches. */
function holeCentres(width: number): number[] {
  const count = width > 0 ? Math.floor((width - 2 * NOTCH) / DOT_SPACING) : 0;
  const start = (width - (count - 1) * DOT_SPACING) / 2;
  return Array.from({ length: count }, (_, i) => start + i * DOT_SPACING);
}

/** Punched holes across the ticket, with a notch bitten out of each side. */
function Perforation({ width, color }: { width: number; color: string }) {
  return <View style={styles.perforation} pointerEvents="none">
    <View style={[styles.notch, styles.notchLeft, { backgroundColor: color }]} />
    {width > 0 ? <Svg width={width} height={DOT * 2}>
      {holeCentres(width).map((cx) => <Circle key={cx} cx={cx} cy={DOT} r={DOT} fill={color} />)}
    </Svg> : null}
    <View style={[styles.notch, styles.notchRight, { backgroundColor: color }]} />
  </View>;
}

/** How far the paper reaches below the ticket's body, and where the tear runs. */
const TEAR_STRIP = 3;
const TEAR = 2;

/**
 * The sliver of paper left below a torn ticket's body: torn along the
 * perforation, so each hole leaves a half-hole and each side notch a quarter.
 * It is real paper rather than a cut-out painted over the ticket, so the
 * shadow follows the tear. Seeded, so it never changes between renders.
 */
export function tornEdge(width: number): string {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const jitter = (amount: number) => (random() * 2 - 1) * amount;
  const n = (value: number) => value.toFixed(2);
  const r = NOTCH / 2;
  const top = Math.sqrt(r * r - TEAR * TEAR);
  let d = `M${n(top)} 0 H${n(width - top)} A${r} ${r} 0 0 0 ${n(width - r)} ${TEAR}`;
  let x = width - r;
  const ragged = (to: number) => {
    for (x -= 0.8 + random() * 0.8; x > to + 0.4; x -= 0.8 + random() * 0.8) d += ` L${n(x)} ${n(TEAR + jitter(0.5))}`;
  };
  for (const cx of holeCentres(width).reverse()) {
    const hole = DOT + jitter(0.15);
    ragged(cx + hole);
    d += ` L${n(cx + hole)} ${TEAR} A${n(hole)} ${n(hole)} 0 0 0 ${n(cx - hole)} ${TEAR}`;
    x = cx - hole;
  }
  ragged(r);
  return `${d} L${r} ${TEAR} A${r} ${r} 0 0 0 ${n(top)} 0 Z`;
}

const styles = StyleSheet.create((theme) => ({
  ticket: {
    paddingHorizontal: theme.ui.space["4"],
    borderRadius: theme.ui.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color.paper,
    boxShadow: theme.ui.shadow.card,
  },
  tornTicket: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  tornSpace: { marginBottom: TEAR_STRIP },
  row: { flexDirection: "row", gap: theme.ui.space["4"], paddingVertical: theme.ui.space["3"] },
  /** A printed rule, a full point as in the design, so it reads over the grain. */
  ruled: { borderTopWidth: 1, borderTopColor: theme.ui.color.separator },
  fact: { flex: 1, gap: 2 },
  value: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["1"] },
  detail: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  pressed: { opacity: 0.5 },
  shrink: { flexShrink: 1 },
  perforation: { height: DOT * 2, marginHorizontal: -theme.ui.space["4"], flexDirection: "row", alignItems: "center" },
  notch: { position: "absolute", top: DOT - NOTCH / 2, width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2 },
  /** The top half of a side notch, down to the tear. */
  halfNotch: { position: "absolute", bottom: -TEAR, width: NOTCH, height: NOTCH / 2, borderTopLeftRadius: NOTCH / 2, borderTopRightRadius: NOTCH / 2 },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },
  stub: { paddingVertical: theme.ui.space["3"] },
  tear: { position: "absolute", left: 0, right: 0, bottom: -TEAR_STRIP, height: TEAR_STRIP },
  /** The torn-off stub in flight: its own paper (its path turns it round
   * its centre, and round its top right while it tears). */
  piece: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: theme.ui.space["4"],
    backgroundColor: theme.ui.color.paper,
    borderBottomLeftRadius: theme.ui.radius.lg,
    borderBottomRightRadius: theme.ui.radius.lg,
    borderCurve: "continuous",
    boxShadow: theme.ui.shadow.card,
  },
}));

const stubStyles = StyleSheet.create((theme) => ({
  stub: {
    marginTop: TEAR_STRIP,
    paddingHorizontal: theme.ui.space["4"],
    paddingTop: theme.ui.space["5"],
    paddingBottom: theme.ui.space["3"],
    gap: theme.ui.space["4"],
    borderRadius: theme.ui.radius.lg,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color.paper,
    boxShadow: theme.ui.shadow.card,
  },
  /** The ticket's tear, upside down: the paper above the stub's body. */
  tear: { position: "absolute", left: 0, right: 0, top: -TEAR_STRIP, height: TEAR_STRIP },
  flip: { transform: [{ scaleY: -1 }] },
  /** The lower half of a side notch, up to the tear. */
  halfNotch: { position: "absolute", top: -TEAR, width: NOTCH, height: NOTCH / 2, borderBottomLeftRadius: NOTCH / 2, borderBottomRightRadius: NOTCH / 2 },
  stamps: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: theme.ui.space["3"] },
  /** The 1.5 frame is drawn over the padding, where a border would sit. */
  stamp: { paddingHorizontal: 11.5, paddingVertical: 7.5, gap: 1 },
  fill: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
  stampLabel: { fontFamily: faces.stamp, fontSize: 13, lineHeight: 16, letterSpacing: 0.78 },
  stampDetail: { fontFamily: faces.stampDetail, fontSize: 11, lineHeight: 14, letterSpacing: 0.66 },
  aside: { paddingLeft: theme.ui.space["1"] },
  foot: { gap: theme.ui.space["3"] },
  rule: { alignSelf: "stretch" },
  footRow: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  action: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["1"] },
}));
