import { useEffect } from "react";
import { type DimensionValue } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

/** A pulsing placeholder bar; still when Reduce Motion is on. */
export function Skeleton({ width = "100%", height = 14 }: { width?: DimensionValue; height?: number }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!reduced) opacity.value = withRepeat(withTiming(0.45, { duration: 900 }), -1, true);
  }, [opacity, reduced]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.bar, { width, height }, pulse]} accessibilityElementsHidden importantForAccessibility="no" />;
}

const styles = StyleSheet.create((theme) => ({
  bar: { borderRadius: theme.radius.xs, backgroundColor: theme.colors["control-bg"] },
}));
