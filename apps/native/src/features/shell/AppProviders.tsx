import { createAppQueryClient, DataProvider, queryKeys, useOwnerChangeCleanup, useSession } from "@pinkslip/data";
import { focusManager, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import * as Notifications from "expo-notifications";
import { router, SplashScreen } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { toast, ToastHost } from "../../kit";
import { appPathFor, inHomeTab } from "../../platform/links";
import { persistOptions } from "../../platform/persistence";
import { ASK_APPLY, ASK_DISMISS, isAlertButton, notificationTarget, refreshDevicePush } from "../../platform/push";
import { initializeSession, type ApiClient } from "../../platform/session";
import { watchAppearance } from "../../theme/appearance";
import { loadUiFonts } from "../../ui/fonts";
import { SignInHost } from "../account/SignInSheet";
import { LaunchFailure } from "../redesign/errors";
import { rememberOwnerPhone } from "../redesign/flag";
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
    return failure ? <LaunchFailure error={failure.error} onRetry={retry} /> : null;
  }
  return <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
    <DataProvider api={api}>
      <AppEffects api={api} />
      <ResumeOcrProvider>{children}</ResumeOcrProvider>
      <ToastHost />
      <SignInHost />
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
  // Coming back to the app counts as focus, so stale lists (the feed, Today)
  // refetch; without it the jobs an alert named only showed after a pull to
  // refresh (owner, 2026-10-22).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));
    return () => subscription.remove();
  }, []);
  const queryClient = useQueryClient();
  useEffect(() => {
    const handled = new Set<string>();
    // A tapped alert opens its job (or the feed) and records the open.
    const open = (response: Notifications.NotificationResponse, launching = false) => {
      const id = response.notification.request.identifier;
      if (handled.has(id)) return;
      handled.add(id);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      // Save, Queue and Hide ran where the alert is (modules/alert-actions).
      // Not a tap on the alert, so nothing opens; lists catch up on focus.
      if (isAlertButton(response.actionIdentifier)) return;
      const target = notificationTarget(response);
      // The "Apply for you?" push's buttons (platform/push.ts). Not this one
      // reaches here only if the app was running; the job is never asked
      // about again either way.
      const askedJob = target.jobIds[0];
      if (response.actionIdentifier === ASK_DISMISS) {
        if (askedJob) void api.apply.answerAsk(askedJob, "dismiss").catch(() => undefined);
        return;
      }
      if (response.actionIdentifier === ASK_APPLY && askedJob) {
        api.apply.answerAsk(askedJob, "apply").then(
          () => void queryClient.invalidateQueries({ queryKey: queryKeys.personal.sends() }),
          // No sends left, no resume yet, the posting closed: the server says which.
          (error: unknown) => toast.error(error instanceof Error && error.message ? error.message : "Couldn't start applying. Try again."),
        );
      }
      // What the alert is about is new since the lists were loaded.
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.jobs().slice(0, 2) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.today() });
      if (target.jobIds.length > 0 || target.notificationId) {
        void api.push.opened(target.jobIds, target.notificationId ?? undefined).catch(() => undefined);
      }
      const path = target.url ? appPathFor(target.url) : "/";
      if (path) router.push((launching ? inHomeTab(path) : path) as never);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last, true);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [api, queryClient]);
  return null;
}
