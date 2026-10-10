import { StyleSheet } from "react-native-unistyles";
import { breakpoints } from "@pinkslip/tokens/native";
import { themeFor } from "./appearance";
import { themes, type AppThemes } from "./themes";

const appBreakpoints = { xs: 0, wide: breakpoints.wide } as const;

type AppBreakpoints = typeof appBreakpoints;

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  themes,
  breakpoints: appBreakpoints,
  // Themes are chosen by appearance.ts (system scheme, the You → Appearance
  // pin, and iOS Increase Contrast), so Unistyles' own light/dark switch is off.
  settings: { initialTheme: () => themeFor() },
});
