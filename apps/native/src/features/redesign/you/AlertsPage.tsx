import { DatePicker, Host } from "@expo/ui/swift-ui";
import { datePickerStyle, tint } from "@expo/ui/swift-ui/modifiers";
import { useApi, useNotificationSettings, useUpdateNotificationSettings } from "@pinkslip/data";
import { useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { enableDevicePush, openNotificationSettings } from "../../../platform/push";
import { AlertPreview, EmptyState, GroupPlaceholders, ListGroup, ListItem, toast } from "../../../ui";
import { useDevicePush } from "../../alerts/Alerts";
import { YouPage } from "./Page";

export type NewJobAlerts = "post" | "daily" | "off";

export interface AlertsViewProps {
  newJobs: NewJobAlerts;
  /** Once a day's time ("08:00"); without it, Once a day isn't offered yet. */
  dailyAt?: string;
  /** Application changes; undefined until the server sends alerts by kind. */
  applicationChanges?: boolean;
  /** Pinkslip's notifications are off in the iPhone's Settings. */
  blocked?: boolean;
  actions: {
    setNewJobs: (choice: NewJobAlerts) => void;
    /** A new time for Once a day ("07:30"), which also picks it. */
    setDailyTime: (time: string) => void;
    setApplicationChanges?: (on: boolean) => void;
    sendTest: () => Promise<void>;
  };
}


/** Alerts (Paper "You · Oct 14", B, owner 2026-10-14): what an alert looks
 * like, then how often new jobs come, then the other kinds and a test. */
export function AlertsView({ newJobs, dailyAt, applicationChanges, blocked = false, actions }: AlertsViewProps) {
  const { theme } = useUnistyles();
  const [testing, setTesting] = useState(false);
  const test = () => {
    setTesting(true);
    actions.sendTest().finally(() => setTesting(false));
  };
  return <YouPage title="Alerts">
    {newJobs !== "off" ? <View style={styles.slot}><AlertPreview daily={newJobs === "daily"} at={dailyAt ? formatDailyTime(dailyAt) : undefined} /></View> : null}
    <ListGroup surface="fill" header="New jobs"
      footer={blocked ? "Notifications are off for Pinkslip in the iPhone's Settings." : undefined}>
      {/* Off, the default, comes first (owner, 2026-11-07). */}
      <ListItem title="Off" accessory="radio" selected={newJobs === "off"} onPress={() => actions.setNewJobs("off")} />
      <ListItem title="As they post" accessory="radio" selected={newJobs === "post"} onPress={() => actions.setNewJobs("post")} />
      {/* The time is iOS's own picker, as on a step's date (owner,
          2026-10-24: the chip looked like one and did nothing). */}
      {dailyAt ? <ListItem title="Once a day" accessory="radio" selected={newJobs === "daily"} onPress={() => actions.setNewJobs("daily")}
        trailing={<Host matchContents>
          <DatePicker selection={dailyDate(dailyAt)} displayedComponents={["hourAndMinute"]}
            onDateChange={(date) => actions.setDailyTime(dailyValue(date))}
            modifiers={[datePickerStyle("compact"), tint(theme.ui.color["accent-fill"])]} />
        </Host>} /> : null}
    </ListGroup>
    <ListGroup surface="fill">
      {applicationChanges !== undefined && actions.setApplicationChanges
        ? <ListItem title="Application changes" detail="When an email moves one to a new stage" accessory="switch"
          selected={applicationChanges} onToggle={actions.setApplicationChanges} />
        : null}
      {blocked ? <ListItem title="Open Settings" onPress={() => void openNotificationSettings()} />
        : <ListItem title="Send a test" onPress={testing ? undefined : test} trailing={testing ? <Spinner /> : undefined} />}
    </ListGroup>
  </YouPage>;
}

function Spinner() {
  const { theme } = useUnistyles();
  return <ActivityIndicator color={theme.ui.color["ink-3"]} />;
}

/** "08:00" → "8:00 AM", as the sample alert says it. */
export function formatDailyTime(value: string): string {
  const [hours = 8, minutes = 0] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** "08:00" → today at 8:00, for the picker. */
function dailyDate(value: string): Date {
  const [hours = 8, minutes = 0] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** The picker's time → "08:00", as the server keeps it. */
function dailyValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Alerts on the live account: new jobs as they post, once a day at the
 * time picked (8:00 until one is), or off, and application changes (N3).
 * Turning alerts on asks the iPhone first. The daily alert goes out on the
 * quarter-hour check, so within 15 minutes of the time. */
export function AlertsPage() {
  const api = useApi();
  const settings = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const { status, setStatus } = useDevicePush();
  const [choice, setChoice] = useState<NewJobAlerts | null>(null);
  const [timeChoice, setTimeChoice] = useState<string | null>(null);
  const [changesChoice, setChangesChoice] = useState<boolean | null>(null);

  if (settings.isPending) return <YouPage title="Alerts"><GroupPlaceholders groups={[3, 2]} /></YouPage>;
  if (settings.isError) {
    return <YouPage title="Alerts"><EmptyState title="Alerts didn't load" message="Check your connection and try again."
      action={{ label: "Try again", variant: "secondary", onPress: () => void settings.refetch() }} /></YouPage>;
  }

  const newJobsSetting = settings.data.kinds.new_jobs;
  const current: NewJobAlerts = newJobsSetting.enabled ? newJobsSetting.mode : "off";
  // Blocked in Settings, no alert arrives, so Off is what's picked; the
  // saved choice comes back once they're allowed (owner, 2026-11-07).
  const blocked = current !== "off" && status === "denied";
  const newJobs = blocked ? "off" : choice ?? current;

  // N3: shown once the server sends it (the kind is listed when it's live).
  const changesSetting = settings.data.kinds.application_moved;
  const setApplicationChanges = changesSetting ? (on: boolean) => {
    setChangesChoice(on);
    update.mutate({ kinds: { application_moved: { enabled: on } } }, {
      onSettled: () => setChangesChoice(null),
      onError: () => toast.error("Couldn't update alerts. Try again."),
    });
  } : undefined;
  const save = (next: NewJobAlerts, time?: string) => {
    setChoice(next);
    if (time) setTimeChoice(time);
    update.mutate(
      { kinds: { new_jobs: next === "off" ? { enabled: false } : { enabled: true, mode: next, ...(time ? { daily_time: time } : {}) } } },
      {
        onSuccess: () => {
          setChoice(null);
          setTimeChoice(null);
        },
        onError: () => {
          setChoice(null);
          setTimeChoice(null);
          toast.error("Couldn't update alerts. Try again.");
        },
      },
    );
  };
  const setNewJobs = async (next: NewJobAlerts, time?: string) => {
    if (next === "off") return save("off");
    if (status === "denied") {
      Alert.alert("Notifications are off", "Turn them on for Pinkslip in Settings, then come back.", [
        { text: "Cancel", style: "cancel" },
        { text: "Settings", isPreferred: true, onPress: () => void openNotificationSettings() },
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
    save(next, time);
  };
  return <AlertsView newJobs={newJobs} dailyAt={timeChoice ?? newJobsSetting.daily_time}
    applicationChanges={changesSetting ? changesChoice ?? changesSetting.enabled : undefined}
    blocked={blocked} actions={{
      setNewJobs: (next) => void setNewJobs(next),
      setDailyTime: (time) => void setNewJobs("daily", time),
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
}));
