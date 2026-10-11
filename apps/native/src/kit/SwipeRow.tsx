import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Text as RNText, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "../platform/haptics";
import { durations, easeOut, resist, settleSpring } from "./motion";

export interface SwipeAction {
  label: string;
  icon: PhosphorIcon;
  /** accent: pink (save, applied); bad: red (hide, remove); neutral: grey. */
  tone: "accent" | "bad" | "neutral";
  /** The row leaves the list, so it slides away instead of springing back. */
  removes?: boolean;
  run: () => void;
}

/** The revealed strip never gets narrower than this, so the label fits. */
const MIN_WIDTH = 76;
/** How far to drag before letting go runs the action. */
const commitDistance = (width: number) => {
  "worklet";
  return Math.max(88, width * 0.3);
};

/**
 * One full-swipe action per side, as Mail's full swipe works: drag the row
 * and the action shows behind it in grey; past the commit point it fills
 * with its colour and taps a haptic, and letting go runs it. Short of the
 * point it springs back, and a fast flick commits too. Releases keep the
 * finger's speed, and a row still moving can be caught where it is. Vertical
 * drags stay with the list, so it lives inside FlashList and keeps the
 * native header.
 */
export function SwipeRow({ id, leading, trailing, children }: {
  /** Resets the row when a recycled cell shows a different item. */
  id: string;
  leading?: SwipeAction | null;
  trailing?: SwipeAction | null;
  children: ReactNode;
}) {
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const width = useSharedValue(390);
  const armed = useSharedValue(false);
  const hasLeading = Boolean(leading);
  const hasTrailing = Boolean(trailing);
  const leadingRemoves = Boolean(leading?.removes);
  const trailingRemoves = Boolean(trailing?.removes);

  useEffect(() => {
    x.value = 0;
    armed.value = false;
  }, [id, x, armed]);

  // The gesture is built once per shape of row; the actions it runs are read
  // when it commits, so a re-render mid-drag doesn't reattach it.
  const actions = useRef({ leading, trailing });
  useEffect(() => { actions.current = { leading, trailing }; });
  const commit = useCallback((side: "leading" | "trailing") => actions.current[side]?.run(), []);

  const pan = useMemo(() => Gesture.Pan()
    .enabled(hasLeading || hasTrailing)
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    // Picks the row up where it is, even mid-animation.
    .onStart(() => { start.value = x.value; })
    .onUpdate((event) => {
      const raw = start.value + event.translationX;
      const allowed = raw > 0 ? hasLeading : hasTrailing;
      // A side without an action gives a little, with rising resistance.
      const next = allowed ? raw : resist(raw, width.value);
      x.value = next;
      const past = allowed && Math.abs(next) >= commitDistance(width.value);
      if (past !== armed.value) {
        armed.value = past;
        scheduleOnRN(haptics.tap);
      }
    })
    // Also runs, with success false, when the list takes the touch away.
    .onEnd((event, success) => {
      const value = x.value;
      const side = value > 0 ? "leading" : "trailing";
      const allowed = value > 0 ? hasLeading : hasTrailing;
      const flick = Math.abs(event.velocityX) > 1000 && Math.sign(event.velocityX) === Math.sign(value) && Math.abs(value) > 40;
      const go = success && allowed && (armed.value || flick);
      armed.value = false;
      const velocity = event.velocityX;
      if (!go) {
        x.value = withSpring(0, { ...settleSpring, velocity });
        return;
      }
      if (side === "leading" ? leadingRemoves : trailingRemoves) {
        // Slide away on a fast ease-out (a spring's long settle would hold
        // the empty strip on screen), then let the list drop the row. Come
        // back after a moment in case it stays (a failure puts it back).
        // Caught on the way out, it doesn't run.
        x.value = withTiming(Math.sign(value) * width.value, { duration: durations.fast, easing: easeOut }, (finished) => {
          if (!finished) return;
          scheduleOnRN(commit, side);
          x.value = withDelay(700, withTiming(0, { duration: 0 }));
        });
      } else {
        x.value = withSpring(0, { ...settleSpring, velocity });
        scheduleOnRN(commit, side);
      }
    }), [hasLeading, hasTrailing, leadingRemoves, trailingRemoves, commit, x, start, width, armed]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return <View style={styles.root} onLayout={(event) => { width.value = event.nativeEvent.layout.width; }}>
    {leading && <Underlay action={leading} side="leading" x={x} width={width} />}
    {trailing && <Underlay action={trailing} side="trailing" x={x} width={width} />}
    <GestureDetector gesture={pan}>
      <Animated.View style={rowStyle}>{children}</Animated.View>
    </GestureDetector>
  </View>;
}

/** The action behind the row: grey while dragging, its colour once armed.
 * The icon and label keep beside the row's moving edge. */
function Underlay({ action, side, x, width }: { action: SwipeAction; side: "leading" | "trailing"; x: SharedValue<number>; width: SharedValue<number> }) {
  const { theme } = useUnistyles();
  const sign = side === "leading" ? 1 : -1;
  const fill = { accent: theme.colors["accent-fill"], bad: theme.colors.bad, neutral: theme.colors["ink-3"] }[action.tone];
  // Ink with contrast on each fill in both modes: the page colour on red and
  // grey, the accent's own ink on pink.
  const onFill = action.tone === "accent" ? theme.colors["accent-ink"] : theme.colors.bg;

  const shown = useAnimatedStyle(() => ({ opacity: x.value * sign > 0 ? 1 : 0 }));
  const armedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(x.value * sign >= commitDistance(width.value) ? 1 : 0, { duration: 120 }),
  }));
  const strip = useAnimatedStyle(() => {
    const distance = Math.max(0, x.value * sign);
    return { width: Math.max(distance, MIN_WIDTH), opacity: interpolate(distance, [16, 56], [0, 1], "clamp") };
  });
  const glyph = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(x.value * sign, [16, MIN_WIDTH], [0.7, 1], "clamp") }] }));

  const label = (color: string) => <Animated.View style={[styles.strip, side === "leading" ? styles.stripLeading : styles.stripTrailing, strip]}>
    <Animated.View style={[styles.glyph, glyph]}>
      <action.icon size={22} weight="bold" color={color} />
      <RNText style={[styles.label, { color }]} numberOfLines={1}>{action.label}</RNText>
    </Animated.View>
  </Animated.View>;

  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.idle, shown]}>
    {label(theme.colors["ink-2"])}
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: fill }, armedStyle]}>{label(onFill)}</Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create((theme) => ({
  root: { overflow: "hidden" },
  idle: { backgroundColor: theme.colors["control-bg"] },
  // The strip grows with the drag; the icon keeps to its inner end, by the row.
  strip: { position: "absolute", top: 0, bottom: 0, justifyContent: "center", paddingHorizontal: theme.space["5"] },
  stripLeading: { left: 0, alignItems: "flex-end" },
  stripTrailing: { right: 0, alignItems: "flex-start" },
  glyph: { alignItems: "center", gap: 3 },
  label: { fontSize: theme.fontSize["2xs"], fontWeight: "600" },
}));
