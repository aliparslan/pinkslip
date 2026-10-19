import { useApi, useNotificationSettings, useUpdateNotificationSettings } from "@pinkslip/data";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { enableDevicePush } from "../../../platform/push";
import { EmptyState, GroupPlaceholders, ListGroup, ListItem, Text, toast } from "../../../ui";
import { useDevicePush } from "../../alerts/Alerts";
import { YouPage } from "./Page";

export type NewJobAlerts = "post" | "daily" | "off";

export interface AlertsViewProps {
  newJobs: NewJobAlerts;
  /** Once a day's time ("8:00 AM"); without it, Once a day isn't offered yet. */
  dailyAt?: string;
  /** Application changes; undefined until the server sends alerts by kind. */
  applicationChanges?: boolean;
  /** Pinkslip's notifications are off in the iPhone's Settings. */
  blocked?: boolean;
  actions: {
    setNewJobs: (choice: NewJobAlerts) => void;
    setApplicationChanges?: (on: boolean) => void;
    sendTest: () => Promise<void>;
  };
}

const icon = require("../../../../assets/icon.png");

/** Alerts (Paper "You · Oct 14", B, owner 2026-10-14): what an alert looks
 * like, then how often new jobs come, then the other kinds and a test. */
export function AlertsView({ newJobs, dailyAt, applicationChanges, blocked = false, actions }: AlertsViewProps) {
  const [testing, setTesting] = useState(false);
  const test = () => {
    setTesting(true);
    actions.sendTest().finally(() => setTesting(false));
  };
  return <YouPage title="Alerts">
    {newJobs !== "off" ? <View style={styles.slot}><Preview daily={newJobs === "daily"} at={dailyAt} /></View> : null}
    <ListGroup surface="fill" header="New jobs"
      footer={blocked ? "Notifications are off for Pinkslip in the iPhone's Settings." : undefined}>
      <ListItem title="As they post" accessory="radio" selected={newJobs === "post"} onPress={() => actions.setNewJobs("post")} />
      {dailyAt ? <ListItem title="Once a day" accessory="radio" selected={newJobs === "daily"} onPress={() => actions.setNewJobs("daily")}
        trailing={<View style={styles.time}><Text>{dailyAt}</Text></View>} /> : null}
      <ListItem title="Off" accessory="radio" selected={newJobs === "off"} onPress={() => actions.setNewJobs("off")} />
    </ListGroup>
    <ListGroup surface="fill">
      {applicationChanges !== undefined && actions.setApplicationChanges
        ? <ListItem title="Application changes" detail="When an email moves one to a new stage" accessory="switch"
          selected={applicationChanges} onToggle={actions.setApplicationChanges} />
        : null}
      {blocked ? <ListItem title="Open Settings" onPress={() => void Linking.openSettings()} />
        : <ListItem title="Send a test" onPress={testing ? undefined : test} trailing={testing ? <Spinner /> : undefined} />}
    </ListGroup>
  </YouPage>;
}

/** The alert as it lands, on the lock screen's rounded card. */
function Preview({ daily, at }: { daily: boolean; at?: string }) {
  return <View style={styles.preview} accessibilityLabel="What an alert looks like">
    <Image source={icon} style={styles.icon} />
    <View style={styles.previewText}>
      <View style={styles.previewTop}>
        <Text role="subhead" weight="medium">{daily ? "12 new jobs today" : "3 new jobs"}</Text>
        <Text role="footnote" tone="ink-3">{daily ? at : "now"}</Text>
      </View>
      <Text role="subhead">{daily ? "Datadog, Ramp, Mercury and 9 more" : "Datadog, Ramp, Mercury"}</Text>
    </View>
  </View>;
}

function Spinner() {
  const { theme } = useUnistyles();
  return <ActivityIndicator color={theme.ui.color["ink-3"]} />;
}

/** "08:00" → "8:00 AM", as the time chip shows it. */
export function formatDailyTime(value: string): string {
  const [hours = 8, minutes = 0] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** Alerts on the live account: new jobs as they post, once a day at the
 * server's time (8:00 until a time can be picked), or off, and application
 * changes (N3). Turning alerts on asks the iPhone first. */
export function AlertsPage() {
  const api = useApi();
  const settings = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const { status, setStatus } = useDevicePush();
  const [choice, setChoice] = useState<NewJobAlerts | null>(null);
  const [changesChoice, setChangesChoice] = useState<boolean | null>(null);

  if (settings.isPending) return <YouPage title="Alerts"><GroupPlaceholders groups={[3, 2]} /></YouPage>;
  if (settings.isError) {
    return <YouPage title="Alerts"><EmptyState title="Alerts didn't load" message="Check your connection and try again."
      action={{ label: "Try again", variant: "secondary", onPress: () => void settings.refetch() }} /></YouPage>;
  }

  const newJobsSetting = settings.data.kinds.new_jobs;
  const current: NewJobAlerts = newJobsSetting.enabled ? newJobsSetting.mode : "off";
  const newJobs = choice ?? current;

  // N3: shown once the server sends it (the kind is listed when it's live).
  const changesSetting = settings.data.kinds.application_moved;
  const setApplicationChanges = changesSetting ? (on: boolean) => {
    setChangesChoice(on);
    update.mutate({ kinds: { application_moved: { enabled: on } } }, {
      onSettled: () => setChangesChoice(null),
      onError: () => toast.error("Couldn't update alerts. Try again."),
    });
  } : undefined;
  const save = (next: NewJobAlerts) => {
    setChoice(next);
    update.mutate(
      { kinds: { new_jobs: next === "off" ? { enabled: false } : { enabled: true, mode: next } } },
      {
        onSuccess: () => setChoice(null),
        onError: () => {
          setChoice(null);
          toast.error("Couldn't update alerts. Try again.");
        },
      },
    );
  };
  const setNewJobs = async (next: NewJobAlerts) => {
    if (next === "off") return save("off");
    if (status === "denied") {
      Alert.alert("Notifications are off", "Turn them on for Pinkslip in Settings, then come back.", [
        { text: "Cancel", style: "cancel" },
        { text: "Settings", isPreferred: true, onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    if (status !== "enabled") {
      try {
        const result = await enableDevicePush(api);
        setStatus(result);
        if (result !== "enabled") return;
      } catch {
        toast.error("This iPhone couldn't sign up for alerts. Try again.");
        return;
      }
    }
    save(next);
  };
  return <AlertsView newJobs={newJobs} dailyAt={formatDailyTime(newJobsSetting.daily_time)}
    applicationChanges={changesSetting ? changesChoice ?? changesSetting.enabled : undefined}
    blocked={newJobs !== "off" && status === "denied"} actions={{
      setNewJobs: (next) => void setNewJobs(next),
      setApplicationChanges,
      sendTest: async () => {
        try {
          const result = await api.push.test(0);
          toast.success(result.sent > 0 ? "Test sent." : "No iPhone got the test.");
        } catch {
          toast.error("Couldn't send a test. Try again.");
        }
      },
    }} />;
}

const styles = StyleSheet.create((theme) => ({
  slot: { paddingHorizontal: theme.ui.space["4"] },
  preview: {
    flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: theme.ui.space["3"], paddingHorizontal: 14,
    borderRadius: 22, borderCurve: "continuous", backgroundColor: theme.ui.color.fill,
  },
  icon: { width: 38, height: 38, borderRadius: 9 },
  previewText: { flex: 1, minWidth: 0 },
  previewTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: theme.ui.space["2"] },
  // Ink on a white chip: pink on gray was too faint (owner, 2026-10-14).
  time: { height: 34, paddingHorizontal: 11, borderRadius: theme.ui.radius.sm, backgroundColor: theme.ui.color.bg, justifyContent: "center" },
}));
