import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Svg, { Path } from "react-native-svg";
import { Grain } from "./Grain";
import { Text } from "./Text";

export interface Allowance {
  label: string;
  used: number;
  /** `null` is no limit: the card shows the count only. */
  limit: number | null;
}

export interface PunchCardProps {
  /** "This week", or "Today" for a daily limit. */
  title: string;
  /** "Resets Monday", "Resets at midnight", "No limit on Pro". */
  note?: string;
  allowances: Allowance[];
  /** The colour behind the card, which shows through the punched holes and the cut corner. */
  backdrop?: "screen-grouped" | "bg";
}

/** Holes fit up to 30; past that a card shows a number and a bar. */
export const MAX_HOLES = 30;
const INLINE_MAX = 5;

type Layout = "count" | "bar" | "holes";
const layoutOf = ({ limit }: Allowance): Layout => limit === null ? "count" : limit > MAX_HOLES ? "bar" : "holes";

/** What's left this period, as the card says it. */
export function leftLabel({ used, limit }: Allowance): string {
  if (limit === null) return String(used);
  const left = limit - used;
  return left > 0 ? `${left} left` : "None left";
}

/**
 * The allowance as a punch card. Up to 5, the holes sit beside the label.
 * Above 5 they move under it in rows of ten, split into fives; if one
 * allowance on the card stacks, they all stack so the holes line up. Over 30
 * it's a number and a bar, and with no limit just the count. Going over (after
 * a downgrade) punches every hole and adds "+3".
 */
export function PunchCard({ title, note, allowances, backdrop = "screen-grouped" }: PunchCardProps) {
  const { theme } = useUnistyles();
  const stacked = allowances.some((a) => layoutOf(a) === "holes" && (a.limit ?? 0) > INLINE_MAX);
  return <View style={styles.card}>
    <Grain radius={theme.ui.radius.md} />
    <View style={styles.header}>
      <Text role="title2">{title}</Text>
      {note ? <Text role="subhead" tone="ink-3">{note}</Text> : null}
    </View>
    {allowances.map((allowance) => <AllowanceRow key={allowance.label} allowance={allowance} stacked={stacked} backdrop={backdrop} />)}
    <Svg width={CORNER} height={CORNER} style={styles.corner} pointerEvents="none">
      <Path d={`M0 0H${CORNER}V${CORNER}Z`} fill={theme.ui.color[backdrop]} />
    </Svg>
  </View>;
}

const CORNER = 24;

type Backdrop = NonNullable<PunchCardProps["backdrop"]>;

function AllowanceRow({ allowance, stacked, backdrop }: { allowance: Allowance; stacked: boolean; backdrop: Backdrop }) {
  const layout = layoutOf(allowance);
  const { label, used, limit } = allowance;
  const over = limit !== null && used > limit ? used - limit : 0;
  const a11y = limit === null ? `${label}, ${used}` : `${label}, ${Math.min(used, limit)} of ${limit} used, ${leftLabel(allowance)}`;
  if (layout === "count") {
    return <View style={styles.inline} accessible accessibilityLabel={a11y}>
      <Text flex>{label}</Text>
      <Text>{used}</Text>
    </View>;
  }
  if (layout === "bar") {
    return <View style={styles.stack} accessible accessibilityLabel={a11y}>
      <View style={styles.labelRow}><Text flex>{label}</Text><Text role="subhead" tone="ink-3">{used} of {limit}</Text></View>
      <View style={styles.track}><View style={[styles.fillBar, { width: `${Math.min(100, (used / (limit as number)) * 100)}%` }]} /></View>
    </View>;
  }
  const holes = <Holes limit={limit as number} used={used} over={over} backdrop={backdrop} />;
  if (!stacked) {
    return <View style={styles.inline} accessible accessibilityLabel={a11y}>
      <View style={styles.labels}>
        <Text>{label}</Text>
        <Text role="subhead" tone="ink-3">{leftLabel(allowance)}</Text>
      </View>
      {holes}
    </View>;
  }
  return <View style={styles.stack} accessible accessibilityLabel={a11y}>
    <View style={styles.labelRow}><Text flex>{label}</Text><Text role="subhead" tone="ink-3">{leftLabel(allowance)}</Text></View>
    {holes}
  </View>;
}

/** Rows of ten, in groups of five. Punched holes show the page behind the
 * card; the rest are pink rings waiting for the punch. */
function Holes({ limit, used, over, backdrop }: { limit: number; used: number; over: number; backdrop: Backdrop }) {
  const rows: number[][] = [];
  for (let start = 0; start < limit; start += 10) {
    rows.push(Array.from({ length: Math.min(10, limit - start) }, (_, i) => start + i));
  }
  return <View style={styles.rows}>
    {rows.map((row, r) => <View key={r} style={styles.holeRow}>
      {[row.slice(0, 5), row.slice(5)].filter((group) => group.length > 0).map((group, g) =>
        <View key={g} style={styles.group}>{group.map((i) => <Hole key={i} punched={i < used} backdrop={backdrop} />)}</View>)}
      {over > 0 && r === rows.length - 1 ? <Text role="subhead" tone="ink-2">+{over}</Text> : null}
    </View>)}
  </View>;
}

function Hole({ punched, backdrop }: { punched: boolean; backdrop: Backdrop }) {
  const { theme } = useUnistyles();
  // A spot punched while the card is on screen gives a small press, as a
  // punch would; holes already punched when it appears stay still.
  const scale = useSharedValue(1);
  const was = useRef(punched);
  useEffect(() => {
    if (punched && !was.current) scale.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, { damping: 12, stiffness: 320 }));
    was.current = punched;
  }, [punched, scale]);
  const press = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return punched
    ? <Animated.View style={[styles.hole, styles.punched, { backgroundColor: theme.ui.color[backdrop] }, press]} />
    : <Animated.View style={[styles.hole, styles.open, press]} />;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.ui.space["4"],
    padding: theme.ui.space["4"],
    borderRadius: theme.ui.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color["bg-elev"],
    boxShadow: theme.ui.shadow.card,
  },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingRight: theme.ui.space["4"] },
  corner: { position: "absolute", top: 0, right: 0 },
  inline: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  labels: { flex: 1, minWidth: 0 },
  stack: { gap: theme.ui.space["2"] },
  labelRow: { flexDirection: "row", alignItems: "baseline", gap: theme.ui.space["3"] },
  rows: { gap: theme.ui.space["2"] },
  holeRow: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["4"] },
  group: { flexDirection: "row", gap: theme.ui.space["2"] },
  hole: { width: theme.ui.size.hole, height: theme.ui.size.hole, borderRadius: theme.ui.radius.full },
  punched: { boxShadow: theme.ui.shadow.hole },
  open: { borderWidth: 1.5, borderColor: theme.ui.color.accent, opacity: 0.4 },
  track: { height: 6, borderRadius: theme.ui.radius.full, backgroundColor: theme.ui.color.track, overflow: "hidden" },
  fillBar: { height: 6, borderRadius: theme.ui.radius.full, backgroundColor: theme.ui.color.ink },
}));
