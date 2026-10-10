import type { NativeStackNavigationOptions } from "expo-router";
import type { AppTheme } from "../../theme/themes";

/** Native navigation bars on every stack: large titles on root screens (set
 * per screen), the system scroll-edge effect, accent tint for Back. */
export function stackOptions(theme: AppTheme): NativeStackNavigationOptions {
  return {
    headerTintColor: theme.colors.accent,
    headerTitleStyle: { color: theme.colors.ink },
    headerLargeTitleStyle: { color: theme.colors.ink },
    // iOS 26 draws its own scroll-edge effect under a transparent bar; a blur
    // material on top of it shows as a grey band.
    headerTransparent: true,
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "minimal",
    contentStyle: { backgroundColor: theme.colors.bg },
  };
}
