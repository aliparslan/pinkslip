import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { motion, spring } from "./motion";
import { Text } from "./Text";

export interface SegmentedProps<T extends string> {
  /** Null while nothing is chosen yet (a question not answered). */
  value: T | null;
  onChange: (next: T) => void;
  segments: ReadonlyArray<{ value: T; label: string; count?: number }>;
}

/** The thumb travels on its own quick spring, clamped so it never overshoots. */
const GLIDE = { ...spring(motion.segment), overshootClamping: true };

/** A segmented control (owner, 2026-10-13): a gray track 40 tall with the
 * chosen segment a raised `seg-on` thumb 4 inside it, 32 like a chip. A
 * segment can carry its count, as chips do. The thumb is one view that
 * slides to the segment you tap, as iOS's does (Motion lab #2, owner
 * 2026-10-24), on `motion.segment`. */
export function Segmented<T extends string>({ value, onChange, segments }: SegmentedProps<T>) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = segments.findIndex((segment) => segment.value === value);
  const segmentWidth = width > 0 ? (width - 8) / segments.length : 0;
  const x = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (index < 0 || segmentWidth === 0) {
      placed.current = false;
      return;
    }
    const target = index * segmentWidth;
    // Its first place (on layout, or a first answer) is set, not travelled to.
    x.value = !placed.current || reduced ? target : withSpring(target, GLIDE);
    placed.current = true;
  }, [index, segmentWidth, reduced, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <View style={styles.track} accessibilityRole="tablist" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    {index >= 0 && segmentWidth > 0 ? <Animated.View style={[styles.thumb, { width: segmentWidth }, thumb]} /> : null}
    {segments.map((segment) => {
      const on = segment.value === value;
      return <Pressable key={segment.value} onPress={() => onChange(segment.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
        style={styles.segment}>
        <Text role="subhead" weight="medium" tone={on ? "ink" : "ink-2"}>{segment.label}</Text>
        {segment.count !== undefined ? <Text role="subhead" tone="ink-3">{String(segment.count)}</Text> : null}
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  track: { flexDirection: "row", height: 40, padding: theme.ui.space["1"], borderRadius: theme.ui.radius.full, backgroundColor: theme.ui.color.fill },
  thumb: {
    position: "absolute", top: theme.ui.space["1"], bottom: theme.ui.space["1"], left: theme.ui.space["1"],
    borderRadius: theme.ui.radius.full, backgroundColor: theme.ui.color["seg-on"], boxShadow: "0px 1px 3px rgba(0, 0, 0, 0.08)",
  },
  segment: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
}));
