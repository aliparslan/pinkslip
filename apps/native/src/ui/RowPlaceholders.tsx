import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

/** Each row's three bars, in points, so the list doesn't read as a grid. */
const ROWS = [[84, 214, 160], [70, 182, 140], [84, 232, 176], [96, 196, 128], [62, 220, 150], [84, 168, 164]] as const;

/** Nothing for the first second (owner, 2026-10-15, Paper "Loading · Oct 15"). */
const WAIT_MS = 1000;
const PULSE_MS = 900;

/** True once `ms` has passed since mount. */
export function useDelayed(ms = WAIT_MS): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return shown;
}

/**
 * A list on its way (L1): six rows in the job row's shape, grey (`fill`),
 * pulsing softly; still under Reduce Motion. Nothing shows for the first
 * second, so a quick load never flashes them. A list whose rows are shorter
 * keeps its own shape: `lines` (a company's jobs are two, hidden companies
 * one) and `logo` off where its rows have none.
 */
/** The pulse every placeholder shares: full, then half, and back. */
function usePulse(shown: boolean) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!shown || reduced) return;
    pulse.value = withRepeat(withTiming(0.5, { duration: PULSE_MS }), -1, true);
    return () => cancelAnimation(pulse);
  }, [shown, reduced, pulse]);
  return useAnimatedStyle(() => ({ opacity: pulse.value }));
}

/** Each settings row's one bar, so the cards don't read as a grid. */
const GROUP_BARS = [104, 88, 40, 150, 92, 120] as const;

/**
 * Settings on their way (Paper "Consistency · Oct 19", C3b, owner): the
 * page's white cards at once, a grey bar where each 50-tall row's label
 * goes, pulsing like the rows; room above the first for its label. `groups`
 * is the rows in each card.
 */
export function GroupPlaceholders({ groups }: { groups: readonly number[] }) {
  const shown = useDelayed();
  const fade = usePulse(shown);
  if (!shown) return null;
  let bar = 0;
  return <View style={styles.groups} accessible accessibilityLabel="Loading">
    {groups.map((rows, group) => <View key={group} style={styles.card}>
      {Array.from({ length: rows }, (_, row) => <View key={row} style={[styles.setting, row > 0 && styles.rule]}>
        <Animated.View style={[styles.bar, { width: GROUP_BARS[bar++ % GROUP_BARS.length] }, fade]} />
      </View>)}
    </View>)}
  </View>;
}

export function RowPlaceholders({ rows = ROWS.length, lines = 3, logo = true }: { rows?: number; lines?: 1 | 2 | 3; logo?: boolean }) {
  const shown = useDelayed();
  const fade = usePulse(shown);
  if (!shown) return null;
  return <Animated.View style={fade} accessible accessibilityLabel="Loading">
    {ROWS.slice(0, rows).map((bars, index) => <View key={index} style={[styles.row, lines < 3 && styles.short, lines === 1 && styles.single, !logo && styles.bare]}>
      {logo ? <View style={styles.logoSlot}><View style={styles.logo} /></View> : null}
      <View style={[styles.bars, lines === 1 && styles.barsSingle]}>
        {/* One line is a name (the short bar); two are a title and its facts. */}
        {(lines === 1 ? bars.slice(0, 1) : bars.slice(3 - lines)).map((width, bar) => <View key={bar} style={[styles.bar, { width }]} />)}
      </View>
    </View>)}
  </Animated.View>;
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: "row", alignItems: "flex-start", minHeight: theme.ui.size.jobRow, paddingTop: theme.ui.space["3"] },
  // Two lines (12 above, two Subhead lines, 12 below) or a logo and a name.
  short: { minHeight: 64 },
  single: { alignItems: "center", paddingTop: 0 },
  bare: { paddingLeft: theme.ui.size.gutter },
  logoSlot: { width: theme.ui.size.keyline, paddingLeft: theme.ui.size.gutter },
  logo: { width: theme.ui.size.logo, height: theme.ui.size.logo, borderRadius: theme.ui.size.logo / 4, borderCurve: "continuous", backgroundColor: theme.ui.color.fill },
  bars: { gap: 10, paddingTop: theme.ui.space["1"] },
  barsSingle: { paddingTop: 0 },
  bar: { height: 12, borderRadius: 6, backgroundColor: theme.ui.color.fill },
  // A settings card's label is 14 tall and sits 8 above it.
  groups: { gap: theme.ui.space["6"], paddingTop: 22, paddingHorizontal: theme.ui.size.gutter },
  card: { paddingHorizontal: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  setting: { height: 50, justifyContent: "center" },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.ui.color.separator },
}));
