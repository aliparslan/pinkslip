import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { UnistylesRuntime } from "react-native-unistyles";
import { setThemeCurtain } from "./appearance";
import { themes, type ThemeName } from "./themes";

/** The content dissolves into its own page color, so nothing jumps. */
const COVER = { duration: 110, easing: Easing.bezier(0.23, 1, 0.32, 1) };
/** iOS's own light and dark change is an even ramp of about 370ms (recorded
 * Reminders, Nov 9). As this lifts, the page ramps the same way. */
const UNCOVER = { duration: 350, easing: Easing.linear };

/**
 * Changing You → Appearance: a curtain in the page's current color covers the
 * screen while it re-renders, then lifts off the new theme. It used to be the
 * new color, which read as a flash (owner, Nov 9). A true cross-fade needs a
 * snapshot of the screen, which needs a native build. Above everything but
 * native sheets; it never takes a touch.
 */
export function ThemeCurtain() {
  const cover = useSharedValue(0);
  const color = useSharedValue("transparent");
  useEffect(() => {
    setThemeCurtain((change) => {
      const lift = () => {
        change();
        // Two frames on, so it lifts once the screens have re-rendered,
        // however long that takes on this phone.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          cover.value = withTiming(0, UNCOVER);
        }));
      };
      color.value = themes[UnistylesRuntime.themeName as ThemeName].ui.color.bg;
      cover.value = withTiming(1, COVER, (finished) => { if (finished) runOnJS(lift)(); });
    });
    return () => setThemeCurtain(null);
  }, [color, cover]);
  const style = useAnimatedStyle(() => ({ opacity: cover.value, backgroundColor: color.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} />;
}
