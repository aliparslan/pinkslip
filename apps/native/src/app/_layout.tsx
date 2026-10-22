import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useUnistyles } from "react-native-unistyles";
// First: whether this phone ran the app before is read ahead of anything
// this launch stores.
import "../features/onboarding/launch";
import { AppProviders } from "../features/shell/AppProviders";
import { stackOptions } from "../features/shell/stack-options";
import { setErrorRoute } from "../platform/error-reporting";
import "../platform/updates-channel";

export default function RootLayout() {
  const { theme } = useUnistyles();
  const pathname = usePathname();
  useEffect(() => setErrorRoute(pathname), [pathname]);
  const light = theme.mode === "light" || theme.mode === "lightContrast";
  // Navigation reads light or dark from its own theme and forces the header
  // (and its search bar) into that style, so it has to follow ours.
  const base = light ? DefaultTheme : DarkTheme;
  const navigationTheme = {
    ...base,
    colors: { ...base.colors, primary: theme.colors.accent, background: theme.colors.bg, card: theme.colors.bg, text: theme.colors.ink, border: theme.colors.line },
  };
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
    <ThemeProvider value={navigationTheme}><AppProviders>
      <Stack screenOptions={stackOptions(theme)}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, presentation: "fullScreenModal", gestureEnabled: false }} />
        <Stack.Screen name="auth/email/verify" options={{ title: "Signing in", presentation: "formSheet", sheetAllowedDetents: [0.4] }} />
        <Stack.Screen name="support/thanks" options={{ headerShown: false, animation: "none" }} />
      </Stack>
    </AppProviders></ThemeProvider>
    <StatusBar style={light ? "dark" : "light"} />
  </GestureHandlerRootView>;
}
