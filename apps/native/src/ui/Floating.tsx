import { Host, Mask, Rectangle } from "@expo/ui/swift-ui";
import { animation, Animation, foregroundStyle, opacity } from "@expo/ui/swift-ui/modifiers";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { motion } from "./motion";

const GLASS = isLiquidGlassAvailable();

/** Controls that float over a scrolling page (a page's Back, share and ⋯):
 * Liquid Glass on iOS 26, as the tab bar is; white with the pill's shadow
 * before it. The grey `fill` is for buttons that sit on the page, not over
 * it, so content showed through them (owner, 2026-10-19). */
export function Floating({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <GlassView glassEffectStyle="regular" isInteractive style={[styles.root, style, !GLASS && styles.paper]}>{children}</GlassView>;
}

/** The page's own colour fading out over the top `height` points, under a
 * floating bar: what scrolls up there fades away instead of running under
 * the clock and the buttons. Solid through the status bar. */
export function TopEdgeFade({ height }: { height: number }) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const solid = Math.min(1, insets.top / height);
  const page = theme.ui.color.bg;
  return <View pointerEvents="none" style={[styles.fade, { height }]}>
    <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
      <Defs>
        <LinearGradient id="top-edge" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={page} stopOpacity={1} />
          <Stop offset={solid} stopColor={page} stopOpacity={1} />
          <Stop offset="1" stopColor={page} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="1" height="1" fill="url(#top-edge)" />
    </Svg>
  </View>;
}

/** How far the blur runs past the status bar before it's gone. */
const BLUR_TAIL = 32;
/** The material samples past its own edges and lightens there, so it
 * reaches this far beyond the screen on every side but the bottom. */
const BLUR_BLEED = 24;
const FADE = Animation.easeOut({ duration: motion.topEdge.duration / 1000 });

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
 * page's bar keeps TopEdgeFade, and the bottom has none. */
export function TopEdgeBlur({ under }: { under: boolean }) {
  const insets = useSafeAreaInsets();
  const height = BLUR_BLEED + insets.top + BLUR_TAIL;
  return <Host pointerEvents="none" ignoreSafeArea="all" style={[styles.blur, { height }]}>
    <Mask>
      <Rectangle modifiers={[foregroundStyle({ type: "material", material: "thin" }), opacity(under ? 1 : 0), animation(FADE, under)]} />
      <Mask.Content>
        {/* Evenly spaced stops: solid for three quarters (the bleed and the status bar), then gone. */}
        <Rectangle modifiers={[foregroundStyle({
          type: "linearGradient", colors: ["#000000", "#000000", "#000000", "#000000", "#00000000"], startPoint: { x: 0.5, y: 0 }, endPoint: { x: 0.5, y: 1 },
        })]} />
      </Mask.Content>
    </Mask>
  </Host>;
}

const styles = StyleSheet.create((theme) => ({
  root: { borderRadius: theme.ui.radius.full, overflow: "hidden" },
  paper: { backgroundColor: theme.ui.color["bg-elev"], boxShadow: theme.ui.shadow.pill, overflow: "visible" },
  fade: { position: "absolute", top: 0, left: 0, right: 0 },
  blur: { position: "absolute", top: -BLUR_BLEED, left: -BLUR_BLEED, right: -BLUR_BLEED },
}));
