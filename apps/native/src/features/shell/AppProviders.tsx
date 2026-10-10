import { createAppQueryClient, DataProvider, useOwnerChangeCleanup } from "@pinkslip/data";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import * as Notifications from "expo-notifications";
import { router, SplashScreen } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, EmptyState, ToastHost } from "../../kit";
import { appPathFor } from "../../platform/links";
import { persistOptions } from "../../platform/persistence";
import { notificationTarget, refreshDevicePush } from "../../platform/push";
import { initializeSession, type ApiClient } from "../../platform/session";
import { watchAppearance } from "../../theme/appearance";

void SplashScreen.preventAutoHideAsync();
watchAppearance();

/** Session, data, persisted cache and app-wide effects. The splash stays up
 * until the bearer session is ready (a Keychain read, or a guest mint on
 * first launch). */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createAppQueryClient());
  const [api, setApi] = useState<ApiClient | null>(null);
  const [failed, setFailed] = useState(false);

  const start = () => {
    setFailed(false);
    initializeSession().then(setApi, () => setFailed(true)).finally(() => void SplashScreen.hideAsync());
  };
  useEffect(start, []);

  if (!api) {
    return failed ? <View style={styles.center}>
      <EmptyState title="Couldn't reach Pinkslip" message="Check your connection and try again."
        actions={<Button variant="primary" onPress={start}>Try again</Button>} />
    </View> : null;
  }
  return <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
    <DataProvider api={api}>
      <AppEffects api={api} />
      {children}
      <ToastHost />
    </DataProvider>
  </PersistQueryClientProvider>;
}

function AppEffects({ api }: { api: ApiClient }) {
  useOwnerChangeCleanup();
  useEffect(() => {
    void refreshDevicePush(api);
    // A tapped alert opens its job (or the feed) and records the open.
    const open = (response: Notifications.NotificationResponse) => {
      const target = notificationTarget(response);
      if (target.jobIds.length > 0) void api.push.opened(target.jobIds).catch(() => undefined);
      const path = target.url ? appPathFor(target.url) : null;
      if (path) router.push(path as never);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [api]);
  return null;
}

const styles = StyleSheet.create((theme) => ({
  center: { flex: 1, justifyContent: "center", backgroundColor: theme.colors.bg },
}));
