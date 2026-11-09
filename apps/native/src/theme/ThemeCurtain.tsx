import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { setThemeCurtain } from "./appearance";
import { themes } from "./themes";

/** Quick to cover, so the switch answers as soon as it's picked. */
const COVER = { duration: 110, easing: Easing.bezier(0.23, 1, 0.32, 1) };
/** Most of the app recolors in one frame, but anything drawn from JS follows
 * once the screens re-render, and the glass bars about 250ms after the change
 * (recorded Nov 8). The curtain stays past the re-render, and is still lifting
 * while the glass finishes. */
const HOLD = 60;
const UNCOVER = { duration: 220, easing: Easing.bezier(0.4, 0, 0.2, 1) };

/**
 * Changing You → Appearance fades through the new page color, so a theme
 * lands as one change. The screen can't cross-fade without a snapshot of it,
 * which needs a native build. Above everything but native sheets; it never
 * takes a touch.
 */
export function ThemeCurtain() {
  const cover = useSharedValue(0);
  const color = useSharedValue("transparent");
  useEffect(() => {
    setThemeCurtain((next, change) => {
      const lift = () => {
        change();
        // Two frames on, so the hold starts once the screens have re-rendered,
        // however long that takes on this phone.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          cover.value = withDelay(HOLD, withTiming(0, UNCOVER));
        }));
      };
      color.value = themes[next].ui.color.bg;
      cover.value = withTiming(1, COVER, (finished) => { if (finished) runOnJS(lift)(); });
    });
    return () => setThemeCurtain(null);
  }, [color, cover]);
  const style = useAnimatedStyle(() => ({ opacity: cover.value, backgroundColor: color.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} />;
}
