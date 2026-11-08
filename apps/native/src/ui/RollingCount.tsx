import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { timing } from "./motion";
import { Text, type TextRole, type TextTone } from "./Text";

/** A count changing rolls in one line, the way it changed: going up, the
 * new number comes up from below; going down, it drops in from above
 * (Paper "Tracker moves, first load, link card · Nov 8", 1). 200ms on the
 * app's ease-out. Under Reduce Motion it just changes. */
const ROLL = { duration: 200, curve: [0.23, 1, 0.32, 1] as const };

export function RollingCount({ value, role = "footnote", tone = "ink-3" }: { value: number; role?: TextRole; tone?: TextTone }) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const line = theme.ui.type[role].line;
  const [shown, setShown] = useState(value);
  const [leaving, setLeaving] = useState<number | null>(null);
  const progress = useSharedValue(1);
  const direction = useSharedValue(1);
  const last = useRef(value);
  useEffect(() => {
    if (value === last.current) return;
    const before = last.current;
    last.current = value;
    setShown(value);
    if (reduced) return;
    direction.value = value > before ? 1 : -1;
    setLeaving(before);
    progress.value = 0;
    progress.value = withTiming(1, timing(ROLL), (finished) => { if (finished) scheduleOnRN(setLeaving, null); });
  }, [value, reduced, progress, direction]);
  const incoming = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: direction.value * line * (1 - progress.value) }],
  }));
  const outgoing = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: -direction.value * line * progress.value }],
  }));
  return <View style={[styles.window, { height: line }]} accessible accessibilityLabel={String(shown)}>
    <Animated.View style={incoming}><Text role={role} tone={tone}>{String(shown)}</Text></Animated.View>
    {leaving !== null ? <Animated.View style={[styles.leaving, outgoing]} pointerEvents="none">
      <Text role={role} tone={tone}>{String(leaving)}</Text>
    </Animated.View> : null}
  </View>;
}

const styles = StyleSheet.create({
  window: { overflow: "hidden" },
  leaving: { position: "absolute", left: 0, top: 0 },
});
