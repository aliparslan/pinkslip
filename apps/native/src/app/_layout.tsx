import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useUnistyles } from "react-native-unistyles";
import { AppProviders } from "../features/shell/AppProviders";
import { stackOptions } from "../features/shell/stack-options";

export default function RootLayout() {
  const { theme } = useUnistyles();
  const light = theme.mode === "light" || theme.mode === "lightContrast";
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
    <AppProviders>
      <Stack screenOptions={stackOptions(theme)}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, presentation: "fullScreenModal", gestureEnabled: false }} />
        <Stack.Screen name="auth/email/verify" options={{ title: "Signing in", presentation: "formSheet", sheetAllowedDetents: [0.4] }} />
      </Stack>
    </AppProviders>
    <StatusBar style={light ? "dark" : "light"} />
  </GestureHandlerRootView>;
}
