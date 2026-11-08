import { useEffect, useRef, useState, type ReactNode } from "react";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { motion, timing } from "./motion";

export interface FoldMotion {
  /** How long the space takes to open or close, and on what curve. */
  space: ReturnType<typeof timing>;
  /** How long what's inside takes to fade, from the start. */
  fade: number;
}

/** A row that goes or comes back with a switch: the swipe's fold, 240ms,
 * the content fading with it ("I work here now" folding Ended away). */
export const FOLD_ROW: FoldMotion = { space: timing({ duration: 240, curve: [0.2, 0.7, 0.2, 1] }), fade: 240 };

/** A wheel opening under its row: the space eases open on the resize curve
 * while the wheel, already at its full size, fades in over the first 150ms
 * (Paper "3 · The month wheel and Ended", 2026-11-08). */
export const OPEN_WHEEL: FoldMotion = { space: timing(motion.sheet.resize), fade: 150 };

/** The longest an opening waits to measure what it opens. */
const LAYOUT_WAIT_MS = 120;

/**
 * Something that appears or goes inside a list or form without the rows
 * under it jumping: its space opens or folds and it fades, and it stays
 * until it has folded away. With `animate` off (or Reduce Motion) it shows
 * and goes at once, as a plain condition would.
 */
export function Fold({ shown, animate = true, motion: how = FOLD_ROW, warm = false, height, lead, children }: {
  shown: boolean;
  animate?: boolean;
  motion?: FoldMotion;
  /** Its height when it's a known size (a wheel), so it needn't be measured. */
  height?: number;
  /** Kept built while folded, so opening doesn't wait for it (a wheel,
   * which iOS takes a moment to build). */
  warm?: boolean;
  /** Goes with it, unfaded: the line FieldGroup draws above a row. */
  lead?: ReactNode;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const moving = animate && !reduced;
  const [kept, setKept] = useState(shown);
  const built = kept || warm;
  const natural = useSharedValue(height ?? 0);
  const open = useSharedValue(shown ? 1 : 0);
  const seen = useSharedValue(shown ? 1 : 0);
  // Opening waits for what's inside to be there and measured, so the
  // motion isn't spent while it's still being built.
  const waiting = useRef(false);
  const run = useRef(() => {});
  run.current = () => {
    seen.value = withTiming(shown ? 1 : 0, { duration: how.fade, easing: how.space.easing });
    open.value = withTiming(shown ? 1 : 0, how.space, (done) => {
      if (done && !shown) scheduleOnRN(setKept, false);
    });
  };
  useEffect(() => {
    if (shown) setKept(true);
  }, [shown]);
  useEffect(() => {
    waiting.current = false;
    if (!moving) {
      open.value = shown ? 1 : 0;
      seen.value = shown ? 1 : 0;
      if (!shown) setKept(false);
      return;
    }
    if (!built) return;
    if (!shown || natural.value > 0) {
      run.current();
      return;
    }
    // Not measured yet: wait for its layout, but never for long.
    waiting.current = true;
    const timer = setTimeout(() => {
      if (!waiting.current) return;
      waiting.current = false;
      run.current();
    }, LAYOUT_WAIT_MS);
    return () => clearTimeout(timer);
  }, [shown, built, moving, open, seen, natural]);
  // Its own height once open, said outright: Reanimated keeps a style it
  // stops returning.
  const space = useAnimatedStyle(() => open.value >= 1
    ? { height: "auto" as const }
    : { height: natural.value * open.value });
  const content = useAnimatedStyle(() => ({ opacity: seen.value }));
  if (!built) return null;
  return <Animated.View style={[styles.clip, space]} pointerEvents={shown ? "auto" : "none"} accessibilityElementsHidden={!shown}>
    <Animated.View onLayout={(event) => {
      if (height !== undefined) return;
      natural.value = event.nativeEvent.layout.height;
      if (waiting.current && natural.value > 0) {
        waiting.current = false;
        run.current();
      }
    }}>
      {lead}
      <Animated.View style={content}>{children}</Animated.View>
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});
