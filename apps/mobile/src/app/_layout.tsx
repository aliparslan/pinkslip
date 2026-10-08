import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { Button } from "../components/controls";
import { Txt } from "../components/primitives";
import { keys } from "../lib/data";
import { listenForNotifications, refreshPushRegistration } from "../lib/push";
import { startSession } from "../lib/session";
import { useIsDark, usePalette } from "../theme";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

// Lists refresh when you come back to the app, not while it sits in the background.
AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));

type Launch = "starting" | "ready" | "failed";

export default function RootLayout() {
  const palette = usePalette();
  const dark = useIsDark();
  const [launch, setLaunch] = useState<Launch>("starting");

  const start = () => {
    setLaunch("starting");
    startSession()
      .then(() => setLaunch("ready"))
      .catch(() => setLaunch("failed"))
      .finally(() => void SplashScreen.hideAsync());
  };

  useEffect(start, []);

  useEffect(() => {
    if (launch !== "ready") return;
    void refreshPushRegistration().catch(() => undefined);
    return listenForNotifications(() => void queryClient.invalidateQueries({ queryKey: keys.feedRoot }));
  }, [launch]);

  const base = dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.accentText,
      background: palette.bg,
      card: palette.bg,
      text: palette.ink,
      border: palette.line,
      notification: palette.accent,
    },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={theme}>
        <StatusBar style="auto" />
        {launch === "failed" ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32, backgroundColor: palette.bg }}>
            <View style={{ gap: 6, alignItems: "center" }}>
              <Txt variant="lead" weight="semibold">
                Can't reach Pinkslip
              </Txt>
              <Txt color="ink2" style={{ textAlign: "center" }}>
                Check your connection and try again.
              </Txt>
            </View>
            <Button variant="primary" onPress={start}>
              Try again
            </Button>
          </View>
        ) : launch === "ready" ? (
          <Stack screenOptions={{ contentStyle: { backgroundColor: palette.bg } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="jobs/[id]/index" options={{ title: "" }} />
            <Stack.Screen
              name="jobs/[id]/places"
              options={{
                presentation: "formSheet",
                sheetAllowedDetents: [0.55, 1],
                sheetGrabberVisible: true,
                headerShown: false,
                contentStyle: { backgroundColor: palette.raised },
              }}
            />
            <Stack.Screen
              name="filters/location"
              options={{
                presentation: "formSheet",
                sheetAllowedDetents: [0.6, 1],
                sheetGrabberVisible: true,
                headerShown: false,
                contentStyle: { backgroundColor: palette.raised },
              }}
            />
            <Stack.Screen
              name="filters/pay"
              options={{
                presentation: "formSheet",
                sheetAllowedDetents: [0.42],
                sheetGrabberVisible: true,
                headerShown: false,
                contentStyle: { backgroundColor: palette.raised },
              }}
            />
          </Stack>
        ) : (
          <View style={{ flex: 1, backgroundColor: palette.bg }} />
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
