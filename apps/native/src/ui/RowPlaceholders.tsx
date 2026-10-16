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
 * second, so a quick load never flashes them.
 */
export function RowPlaceholders({ rows = ROWS.length }: { rows?: number }) {
  const shown = useDelayed();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!shown || reduced) return;
    pulse.value = withRepeat(withTiming(0.5, { duration: PULSE_MS }), -1, true);
    return () => cancelAnimation(pulse);
  }, [shown, reduced, pulse]);
  const fade = useAnimatedStyle(() => ({ opacity: pulse.value }));
  if (!shown) return null;
  return <Animated.View style={fade} accessible accessibilityLabel="Loading">
    {ROWS.slice(0, rows).map((bars, index) => <View key={index} style={styles.row}>
      <View style={styles.logoSlot}><View style={styles.logo} /></View>
      <View style={styles.bars}>
        {bars.map((width, bar) => <View key={bar} style={[styles.bar, { width }]} />)}
      </View>
    </View>)}
  </Animated.View>;
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: "row", alignItems: "flex-start", minHeight: theme.ui.size.jobRow, paddingTop: theme.ui.space["3"] },
  logoSlot: { width: theme.ui.size.keyline, paddingLeft: theme.ui.size.gutter },
  logo: { width: theme.ui.size.logo, height: theme.ui.size.logo, borderRadius: theme.ui.size.logo / 4, borderCurve: "continuous", backgroundColor: theme.ui.color.fill },
  bars: { gap: 10, paddingTop: theme.ui.space["1"] },
  bar: { height: 12, borderRadius: 6, backgroundColor: theme.ui.color.fill },
}));
