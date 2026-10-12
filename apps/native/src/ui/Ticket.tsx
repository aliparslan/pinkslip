import { Fragment, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, { Easing, withTiming } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Svg, { Circle, Path } from "react-native-svg";
import { Grain } from "./Grain";
import { Icon } from "./Icon";
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

export type TicketBackdrop = "bg" | "screen-grouped" | "bg-elev";

export interface TicketProps {
  /** One or two facts per row (Level and Pay, Location, Visa and Experience). */
  rows: TicketFact[][];
  /** The stub under the perforation: posted, deadline, source. */
  stub?: string;
  /** After Apply the stub has torn off into the Tracker; the ticket keeps a torn edge. */
  torn?: boolean;
  /** The colour behind the ticket, which shows through the holes and notches. */
  backdrop?: TicketBackdrop;
}

/** The job's facts as a printed ticket: faint grain, a slight lift, and a stub
 * punched along its perforation. */
export function Ticket({ rows, stub, torn = false, backdrop = "bg" }: TicketProps) {
  const { theme } = useUnistyles();
  const radius = theme.ui.radius.lg;
  const [width, setWidth] = useState(0);
  const holeColor = theme.ui.color[backdrop];
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));
  return <View style={[styles.ticket, torn && styles.tornTicket, torn && styles.tornSpace]} onLayout={onLayout}>
    <Grain radius={radius} flatBottom={torn} />
    {rows.map((row, index) => <View key={index} style={[styles.row, index > 0 && styles.ruled]}>
      {row.map((fact) => <Fact key={fact.label} fact={fact} />)}
    </View>)}
    {stub && !torn ? <Animated.View exiting={tearOff}>
      <Perforation width={width} color={holeColor} />
      <View style={styles.stub}><Text role="footnote" tone="ink-3">{stub}</Text></View>
    </Animated.View> : null}
    {torn && width > 0 ? <Fragment>
      <View style={styles.tear} pointerEvents="none">
        <Svg width={width} height={TEAR_STRIP}>
          <Path d={tornEdge(width)} fill={theme.ui.color["bg-grouped"]} />
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
    {fact.onPress ? <Icon name="disclosure" size={13} weight="bold" tone="ink-3" /> : null}
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

const TEAR_MS = 360;

/** The stub tearing off on Apply: it drops and tips as it goes, falling
 * faster as it leaves (gravity, so ease-in), and fades on the way. */
function tearOff() {
  "worklet";
  const fall = { duration: TEAR_MS, easing: Easing.in(Easing.quad) };
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }, { rotate: "0deg" }] },
    animations: {
      opacity: withTiming(0, { duration: TEAR_MS, easing: Easing.in(Easing.cubic) }),
      transform: [{ translateY: withTiming(56, fall) }, { rotate: withTiming("-4deg", fall) }],
    },
  };
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
    backgroundColor: theme.ui.color["bg-grouped"],
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
}));
