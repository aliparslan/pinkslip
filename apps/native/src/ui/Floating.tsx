import { Host, Mask, Rectangle, ZStack } from "@expo/ui/swift-ui";
import { animation, Animation, foregroundStyle, opacity } from "@expo/ui/swift-ui/modifiers";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { motion, timing } from "./motion";

const GLASS = isLiquidGlassAvailable();

/** Controls that float over a scrolling page (a page's Back, share and ⋯):
 * Liquid Glass on iOS 26, as the tab bar is; white with the pill's shadow
 * before it. The grey `fill` is for buttons that sit on the page, not over
 * it, so content showed through them (owner, 2026-10-19). */
export function Floating({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <GlassView glassEffectStyle="regular" isInteractive style={[styles.root, style, !GLASS && styles.paper]}>{children}</GlassView>;
}

/** Fine enough to read as a gradient over the bar's short tail. */
const FADE_STEPS = Array.from({ length: 24 }, (_, step) => step);

/** The page's own colour fading out over the top `height` points, under a
 * floating bar: what scrolls up there fades away instead of running under
 * the clock and the buttons. Solid through the status bar, or down to
 * `solidTo` points. */
export function TopEdgeFade({ height, solidTo }: { height: number; solidTo?: number }) {
  const insets = useSafeAreaInsets();
  const solid = Math.min(height, solidTo ?? insets.top);
  // Layers of the sheet's color, not a drawn gradient: a theme change reaches
  // the sheet at once, and a gradient's colors only after a redraw.
  return <View pointerEvents="none" style={[styles.fade, { height }]}>
    <View style={[styles.page, { height: solid }]} />
    {FADE_STEPS.map((step) => <View key={step} style={[styles.page, { height: (height - solid) / FADE_STEPS.length, opacity: 1 - (step + 0.5) / FADE_STEPS.length }]} />)}
  </View>;
}

/** How far the blur runs past the status bar before it's gone. */
const BLUR_TAIL = 44;
/** The material samples past its own edges and lightens there, so it
 * reaches this far beyond the screen on every side but the bottom. */
const BLUR_BLEED = 24;
/** The page's own colour over the blur, so it reads as the page going soft
 * rather than a grey band (2026-10-22: the owner found the blur off; the
 * thin material alone is a lighter grey than the dark page). */
const TINT = 0.7;
/** Stops down the mask, evenly spaced as SwiftUI's gradient takes them. */
const MASK_STOPS = 12;
const FADE = Animation.easeOut({ duration: motion.topEdge.duration / 1000 });
const TINT_FADE = timing({ duration: motion.topEdge.duration, curve: [0, 0, 0.58, 1] });

/** The mask: solid through the bleed and the status bar, then easing out
 * over the tail, so there's no line where the blur stops. */
function maskColors(solid: number): string[] {
  return Array.from({ length: MASK_STOPS }, (_, i) => {
    const t = i / (MASK_STOPS - 1);
    const left = t <= solid ? 1 : 1 - (t - solid) / (1 - solid);
    const alpha = left * left * (3 - 2 * left);
    // Expo UI reads eight digits as #RRGGBBAA.
    return `#000000${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
  });
}

/** Points scrolled before the blur shows: the 44 nav row is mostly empty. */
const UNDER = 8;

/** Whether a tab's list has scrolled anything under the clock. Pass it to
 * `useTabBarScroll` (or call `onScrollY` with the list's offset), and its
 * `under` to `TopEdgeBlur`. */
export function useTopEdge() {
  const [under, setUnder] = useState(false);
  const last = useRef(false);
  const onScrollY = useCallback((y: number) => {
    const next = y > UNDER;
    if (next === last.current) return;
    last.current = next;
    setUnder(next);
  }, []);
  return { under, onScrollY };
}

/** What scrolls up under the clock on a tab goes soft instead of running
 * under it: iOS's own blur (a SwiftUI material, so it follows light and
 * dark on every iOS version), solid through the status bar and fading out
 * just under it (owner, 2026-10-19, Paper "Consistency · Oct 19", C7b: the
 * flat band was harsh). Like iOS's scroll edge it shows only once something
 * is under it, so a tab at rest has nothing there. Tabs only; a pushed
 * page's bar keeps TopEdgeFade. The bottom has none: rows show through the
 * tab bar's glass (owner, 2026-11-08: keep the translucency, for now). */
export function TopEdgeBlur({ under }: { under: boolean }) {
  const insets = useSafeAreaInsets();
  const height = BLUR_BLEED + insets.top + BLUR_TAIL;
  const colors = maskColors((BLUR_BLEED + insets.top) / height);
  const shown = useSharedValue(under ? 1 : 0);
  useEffect(() => { shown.value = withTiming(under ? 1 : 0, TINT_FADE); }, [shown, under]);
  const tint = useAnimatedStyle(() => ({ opacity: shown.value }));
  return <>
    <Host pointerEvents="none" ignoreSafeArea="all" style={[styles.blur, { height }]}>
      <Mask>
        <ZStack modifiers={[opacity(under ? 1 : 0), animation(FADE, under)]}>
          <Rectangle modifiers={[foregroundStyle({ type: "material", material: "ultraThin" })]} />
        </ZStack>
        <Mask.Content>
          <Rectangle modifiers={[foregroundStyle({ type: "linearGradient", colors, startPoint: { x: 0.5, y: 0 }, endPoint: { x: 0.5, y: 1 } })]} />
        </Mask.Content>
      </Mask>
    </Host>
    {/* The tint, in layers of the sheet's color shaped like the mask. The
        material changes with the page by itself; a color handed to SwiftUI
        waits for a redraw, and popped 0.3s after a theme change (owner, Nov 9). */}
    <Animated.View pointerEvents="none" style={[styles.fade, { height: insets.top + BLUR_TAIL }, tint]}>
      <View style={[styles.page, { height: insets.top, opacity: TINT }]} />
      {FADE_STEPS.map((step) => {
        const left = 1 - (step + 0.5) / FADE_STEPS.length;
        return <View key={step} style={[styles.page, { height: BLUR_TAIL / FADE_STEPS.length, opacity: TINT * left * left * (3 - 2 * left) }]} />;
      })}
    </Animated.View>
  </>;
}

const styles = StyleSheet.create((theme) => ({
  root: { borderRadius: theme.ui.radius.full, overflow: "hidden" },
  paper: { backgroundColor: theme.ui.color["bg-elev"], boxShadow: theme.ui.shadow.pill, overflow: "visible" },
  fade: { position: "absolute", top: 0, left: 0, right: 0 },
  page: { backgroundColor: theme.ui.color.bg },
  blur: { position: "absolute", top: -BLUR_BLEED, left: -BLUR_BLEED, right: -BLUR_BLEED },
}));
