import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

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

const styles = StyleSheet.create((theme) => ({
  root: { borderRadius: theme.ui.radius.full, overflow: "hidden" },
  paper: { backgroundColor: theme.ui.color["bg-elev"], boxShadow: theme.ui.shadow.pill, overflow: "visible" },
  fade: { position: "absolute", top: 0, left: 0, right: 0 },
}));
