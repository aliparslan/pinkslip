import { useEffect, useState } from "react";
import { Text } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { face } from "./fonts";
import { motion, timing } from "./motion";
import { StampFrame } from "./StampFrame";

/**
 * How much larger a stamp starts when it lands where you weren't looking
 * (Paper "Signature moments · Nov 8", 2): the stub's own press
 * (`motion.stamp.land`), from further up than its 1.12. A trial until the
 * owner settles it, then a token.
 */
export const ARRIVING_FROM = { sent: 1.3, offer: 1.4 } as const;

/**
 * A stamp on its own, off the stub: SENT on the live bar. With `landing` it
 * comes down as the stub's do, clear and larger to inked and in place, and
 * `onLanded` runs as it meets the bar. Under Reduce Motion it's simply there.
 */
export function StampMark({ label, landing = false, from = ARRIVING_FROM.sent, angle = -3, onLanded }: {
  label: string;
  landing?: boolean;
  from?: number;
  angle?: number;
  onLanded?: () => void;
}) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const still = !landing || reduced;
  const press = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (!landing) return;
    if (reduced) {
      onLanded?.();
      return;
    }
    press.value = withTiming(1, timing(motion.stamp.land), (finished) => {
      if (finished && onLanded) scheduleOnRN(onLanded);
    });
    // Only as it first appears.
  }, []);
  const body = useAnimatedStyle(() => ({
    opacity: press.value,
    transform: [{ rotate: `${angle}deg` }, { scale: from + (1 - from) * press.value }],
  }));
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  return <Animated.View style={[styles.stamp, body]} pointerEvents="none"
    onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
    {size ? <StampFrame {...size} color={theme.ui.color.ink} line={2} radius={7} /> : null}
    <Text style={[styles.label, { color: theme.ui.color.ink }]} maxFontSizeMultiplier={1.4} accessible={false}>{label}</Text>
  </Animated.View>;
}

const styles = StyleSheet.create({
  // The 2 frame is drawn over the padding, where a border would sit.
  stamp: { paddingHorizontal: 10, paddingVertical: 5 },
  label: { ...face.stamp, fontSize: 15, lineHeight: 18, letterSpacing: 0.9 },
});
