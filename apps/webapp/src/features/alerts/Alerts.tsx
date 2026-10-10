import { useState } from "react";
import { BellRinging, ShareFat } from "@phosphor-icons/react";
import { useApi, usePreferences, usePushSettings, useUpdatePreferences, useUpdatePushSettings } from "@pinkslip/data";
import { Alert, Button, Heading, Separator, Stack, Surface, Switch, Text, toast } from "../../kit";
import { PageFailure, PageLoading } from "../states/LoadStates";
import { enablePush, usePushStatus, type PushStatus } from "./push";
import styles from "../settings/Settings.module.css";

const statusLabel: Record<PushStatus, { text: string; tone?: "good" | "warn" }> = {
  enabled: { text: "On", tone: "good" },
  disabled: { text: "Off" },
  promptable: { text: "Off" },
  denied: { text: "Blocked", tone: "warn" },
  "requires-install": { text: "Add to Home Screen first" },
  unsupported: { text: "Not available in this browser" },
};

/** `NotifySection.svelte`: the account-wide switch, this device's push
 * permission and registration (separate things), and a test once it works. */
export function Alerts() {
  const api = useApi();
  const settings = usePushSettings();
  const preferences = usePreferences();
  const updateSettings = useUpdatePushSettings();
  const updatePreferences = useUpdatePreferences();
  const { status, setStatus, refresh } = usePushStatus();
  const [enabling, setEnabling] = useState(false);
  const [registrationFailed, setRegistrationFailed] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  const alertsOn = on ?? settings.data?.enabled ?? false;

  if (settings.isPending) return <PageLoading label="Loading alerts" />;
  if (settings.isError) return <PageFailure title="Alerts didn't load" onRetry={() => void settings.refetch()} retrying={settings.isFetching} />;

  const setAlerts = (enabled: boolean) => {
    setOn(enabled);
    updateSettings.mutate(enabled, {
      onError: () => {
        setOn(!enabled);
        toast.error("Couldn't update alerts. Try again.");
      },
    });
    const profile = preferences.data?.search_profile;
    if (profile) updatePreferences.mutate({ search_profile: { ...profile, notifications_enabled: enabled } });
  };

  const enableDevice = async () => {
    setEnabling(true);
    try {
      const result = await enablePush(api);
      setStatus(result);
      setRegistrationFailed(false);
      if (result === "enabled" && !alertsOn) setAlerts(true);
    } catch {
      setRegistrationFailed((await refresh()) !== "unsupported");
      toast.error("Notifications are allowed, but this device couldn't register. Try again.");
    } finally {
      setEnabling(false);
    }
  };

  const sendTest = (delay: number) => {
    setTesting(delay);
    api.push.test(delay).then(
      (result) => toast.success(result.sent > 0
        ? delay > 0 ? "Test notification on its way." : "Test notification sent."
        : "No registered device received the test."),
      () => toast.error("Couldn't send a test. Try again."),
    ).finally(() => setTesting(null));
  };

  const device = registrationFailed ? { text: "Needs setup", tone: "warn" as const } : status ? statusLabel[status] : null;
  const canEnable = registrationFailed || status === "promptable" || status === "disabled";

  return <Stack gap="6">
    <Heading level={1} variant="screen">Alerts</Heading>
    <Surface variant="list" bleedOnPhone>
      <div className={styles.row}>
        <Text weight="medium">Job alerts</Text>
        <Switch label="Job alerts" checked={alertsOn} onCheckedChange={setAlerts} />
      </div>
      <Separator />
      <div className={styles.row}>
        <div className={styles.copy}>
          <Text weight="medium">This device</Text>
          {device && <span className={styles.status} data-tone={device.tone}>{device.text}</span>}
        </div>
        {canEnable && <Button variant="secondary" size="compact" icon={BellRinging} pending={enabling} onClick={() => void enableDevice()}>
          {registrationFailed ? "Retry" : "Turn on"}
        </Button>}
      </div>
      {status === "enabled" && !registrationFailed && <>
        <Separator />
        <div className={styles.row}>
          <Text weight="medium">Send a test</Text>
          <div className={styles.actions}>
            <Button variant="secondary" size="compact" pending={testing === 0} disabled={testing !== null} onClick={() => sendTest(0)}>Now</Button>
            <Button variant="secondary" size="compact" pending={testing === 5} disabled={testing !== null} onClick={() => sendTest(5)}>In 5 seconds</Button>
          </div>
        </div>
      </>}
    </Surface>
    {status === "requires-install" && <Alert tone="warning" icon={ShareFat} title="Add Pinkslip to your Home Screen">
      On iPhone, tap Share, then Add to Home Screen. Open Pinkslip from there to turn on alerts.
    </Alert>}
    {status === "denied" && <Alert tone="warning">Notifications are blocked for this site. Allow them in your browser’s site settings, then come back.</Alert>}
  </Stack>;
}
