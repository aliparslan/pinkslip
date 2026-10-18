import { createAppQueryClient, DataProvider, useOwnerChangeCleanup, useSession } from "@pinkslip/data";
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
import { loadUiFonts } from "../../ui/fonts";
import { LaunchFailure } from "../redesign/errors";
import { redesignEnabled, rememberOwnerPhone } from "../redesign/flag";
import { ResumeOcrProvider } from "../resume/ResumeOcrProvider";

void SplashScreen.preventAutoHideAsync();
watchAppearance();
void loadUiFonts();

/** Session, data, persisted cache and app-wide effects. The splash stays up
 * until the bearer session is ready (a Keychain read, or a guest mint on
 * first launch). */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createAppQueryClient());
  const [api, setApi] = useState<ApiClient | null>(null);
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  const start = () => {
    setFailure(null);
    initializeSession().then(setApi, (error: unknown) => setFailure({ error })).finally(() => void SplashScreen.hideAsync());
  };
  useEffect(start, []);
  // From the failure screen: it stays up while the next try runs.
  const retry = () => { initializeSession().then(setApi, (error: unknown) => setFailure({ error })); };

  if (!api) {
    if (failure && redesignEnabled()) return <LaunchFailure error={failure.error} onRetry={retry} />;
    return failure ? <View style={styles.center}>
      <EmptyState title="Couldn't reach Pinkslip" message="Check your connection and try again."
        actions={<Button variant="primary" onPress={start}>Try again</Button>} />
    </View> : null;
  }
  return <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
    <DataProvider api={api}>
      <AppEffects api={api} />
      <ResumeOcrProvider>{children}</ResumeOcrProvider>
      <ToastHost />
    </DataProvider>
  </PersistQueryClientProvider>;
}

function AppEffects({ api }: { api: ApiClient }) {
  useOwnerChangeCleanup();
  const { data: session } = useSession();
  const owner = session?.me?.user?.id;
  useEffect(() => { if (owner) void refreshDevicePush(api); }, [api, owner]);
  // An admin's phone gets the kit and the owner's updates from the next launch.
  const admin = session?.me?.is_admin;
  useEffect(() => { if (admin !== undefined) rememberOwnerPhone(admin); }, [admin]);
  // Reminders and the daily alert go out in the phone's own time zone.
  useEffect(() => {
    if (!owner) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) void api.notifications.update({ time_zone: zone }).catch(() => undefined);
  }, [api, owner]);
  useEffect(() => {
    const handled = new Set<string>();
    // A tapped alert opens its job (or the feed) and records the open.
    const open = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handled.has(id)) return;
      handled.add(id);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      const target = notificationTarget(response);
      if (target.jobIds.length > 0 || target.notificationId) {
        void api.push.opened(target.jobIds, target.notificationId ?? undefined).catch(() => undefined);
      }
      const path = target.url ? appPathFor(target.url) : "/";
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
