import { useApi, usePreferences, usePushSettings, useUpdatePreferences, useUpdatePushSettings } from "@pinkslip/data";
import { BellRinging, WarningCircle } from "phosphor-react-native";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, View } from "react-native";
import { Button, EmptyState, Inline, ListRow, ListSection, Screen, Spinner, Switch, Text, toast } from "../../kit";
import { devicePushStatus, enableDevicePush, type DevicePushStatus } from "../../platform/push";

const statusLabel: Record<DevicePushStatus, string> = {
  enabled: "On", promptable: "Off", denied: "Blocked in Settings", unsupported: "Not available on this device",
};

/** Device push state, rechecked when the app comes back (from Settings). */
export function useDevicePush() {
  const [status, setStatus] = useState<DevicePushStatus | null>(null);
  const refresh = useCallback(() => devicePushStatus().then((next) => { setStatus(next); return next; }), []);
  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  return { status, setStatus, refresh };
}

/** `NotifySection.svelte` for iOS: the account-wide switch, this iPhone's
 * permission and registration (separate things), and a test once it works. */
export function Alerts() {
  const api = useApi();
  const settings = usePushSettings();
  const preferences = usePreferences();
  const updateSettings = useUpdatePushSettings();
  const updatePreferences = useUpdatePreferences();
  const { status, setStatus } = useDevicePush();
  const [enabling, setEnabling] = useState(false);
  const [registrationFailed, setRegistrationFailed] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  const alertsOn = on ?? settings.data?.enabled ?? false;

  if (settings.isPending) return <Screen><Spinner label="Loading alerts" /></Screen>;
  if (settings.isError) return <Screen><EmptyState icon={WarningCircle} title="Alerts didn't load" actions={<Button onPress={() => void settings.refetch()}>Try again</Button>} /></Screen>;

  const setAlerts = (enabled: boolean) => {
    setOn(enabled);
    updateSettings.mutate(enabled, { onError: () => { setOn(!enabled); toast.error("Couldn't update alerts. Try again."); } });
    const profile = preferences.data?.search_profile;
    if (profile) updatePreferences.mutate({ search_profile: { ...profile, notifications_enabled: enabled } });
  };
  const enableDevice = async () => {
    setEnabling(true);
    try {
      const result = await enableDevicePush(api);
      setStatus(result);
      setRegistrationFailed(false);
      if (result === "enabled" && !alertsOn) setAlerts(true);
    } catch {
      setRegistrationFailed(true);
      toast.error("Notifications are allowed, but this iPhone couldn't register. Try again.");
    } finally {
      setEnabling(false);
    }
  };
  const sendTest = (delay: number) => {
    setTesting(delay);
    api.push.test(delay).then(
      (result) => toast.success(result.sent > 0 ? (delay > 0 ? "Test notification on its way." : "Test notification sent.") : "No registered device received the test."),
      () => toast.error("Couldn't send a test. Try again."),
    ).finally(() => setTesting(null));
  };

  const device = registrationFailed ? "Needs setup" : status ? statusLabel[status] : undefined;
  return <Screen>
    <ListSection>
      <ListRow title="Job alerts" accessory={<Switch label="Job alerts" checked={alertsOn} onCheckedChange={setAlerts} />} />
      <ListRow title="This iPhone" detail={device} accessory={(registrationFailed || status === "promptable")
        ? <Button size="compact" icon={BellRinging} pending={enabling} onPress={() => void enableDevice()}>{registrationFailed ? "Retry" : "Turn on"}</Button>
        : status === "denied" ? <Button size="compact" onPress={() => void Linking.openSettings()}>Settings</Button> : undefined} />
      {status === "enabled" && !registrationFailed && <ListRow title="Send a test" accessory={<Inline gap="2">
        <Button size="compact" pending={testing === 0} disabled={testing !== null} onPress={() => sendTest(0)}>Now</Button>
        <Button size="compact" pending={testing === 5} disabled={testing !== null} onPress={() => sendTest(5)}>In 5 s</Button>
      </Inline>} />}
    </ListSection>
    {status === "denied" && <View><Text size="sm" tone="ink-3">Notifications are off for Pinkslip in Settings. Turn them on there, then come back.</Text></View>}
  </Screen>;
}
