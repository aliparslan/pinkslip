import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { easeOut } from "../kit/motion";

/** Long for UI motion on purpose: it reports progress, it doesn't answer a tap. */
const GROW = { duration: 600, easing: easeOut };

/**
 * A thin bar that fills by real steps (Motion lab #1, owner 2026-10-24): it
 * grows to each step's share on the strong ease-out instead of jumping, and
 * never runs ahead of a step or back down. 6 tall, `ink` on `fill`.
 */
export function ProgressBar({ share }: { share: number }) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const shown = useSharedValue(0);
  useEffect(() => {
    // Back to empty is a reset, not progress, so it doesn't animate.
    shown.value = reduced || share <= shown.value ? share : withTiming(share, GROW);
  }, [share, reduced, shown]);
  // A full-width fill slid in from the left keeps its rounded end, where a
  // stretched one would squash it.
  const fill = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - shown.value) * width }] }));
  return <View style={styles.track} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}>
    <Animated.View style={[styles.fill, fill]} />
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  track: { height: 6, borderRadius: 3, backgroundColor: theme.ui.color.fill, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: theme.ui.color.ink },
}));
