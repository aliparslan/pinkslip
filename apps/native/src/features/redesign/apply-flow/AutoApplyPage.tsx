import type { AutoApplyMode, AutoApplyPause, AutoApplySettings } from "@pinkslip/core/api";
import { useAutoApplySettings, useCompanies, usePlan, useSaveAutoApplySettings } from "@pinkslip/data";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Menu } from "../../../kit";
import { Icon, Radio, RowPlaceholders, Text, toast } from "../../../ui";
import { YouPage } from "../you/Page";
import { howManyLabel, pausedLine } from "./auto-apply-facts";

/**
 * Auto-apply (owner, 2026-10-29, Paper "Auto-apply settings · Oct 29", after
 * the morning list was dropped): how a strong match is handled as it posts,
 * then Which jobs. Ask me, Apply for me (Pro; "Pro" where the radio would be
 * on Free) or Off, and Pause as a row that opens its menu in place, or
 * "Paused until …" with Resume. Which jobs says how many the plan allows and
 * opens the hidden companies. One footnote.
 */
export interface AutoApplyViewProps {
  settings: AutoApplySettings;
  /** "3 a week", "Up to 10 a day"; undefined while the plan loads. */
  howMany?: string;
  hidden?: number;
  onMode: (mode: AutoApplyMode) => void;
  /** null resumes. */
  onPause: (pause: AutoApplyPause | null) => void;
  onHidden: () => void;
}

const MODES: { mode: AutoApplyMode; title: string }[] = [
  { mode: "ask", title: "Ask me" },
  { mode: "auto", title: "Apply for me" },
  { mode: "off", title: "Off" },
];

export function AutoApplyView({ settings, howMany, hidden, onMode, onPause, onHidden }: AutoApplyViewProps) {
  return <YouPage title="Auto-apply">
    <Card>
      {MODES.map(({ mode, title }, index) => {
        const locked = mode === "auto" && !settings.can_automate;
        const row = <>
          <Text flex>{title}</Text>
          {locked ? <Text tone="ink-3">Pro</Text> : <Radio selected={settings.mode === mode} />}
        </>;
        return locked
          ? <View key={mode} style={[styles.row, index > 0 && styles.rule]}>{row}</View>
          : <Pressable key={mode} onPress={() => onMode(mode)} accessibilityRole="radio" accessibilityState={{ checked: settings.mode === mode }}
            style={({ pressed }) => [styles.row, index > 0 && styles.rule, pressed && styles.pressed]}>{row}</Pressable>;
      })}
      {settings.paused_until
        ? <View style={[styles.row, styles.rule]}>
          <Text flex>{pausedLine(settings)}</Text>
          <Pressable onPress={() => onPause(null)} accessibilityRole="button" hitSlop={8}><Text weight="medium">Resume</Text></Pressable>
        </View>
        : <View style={[styles.row, styles.rule]}>
          <Text flex>Pause</Text>
          <Menu title="" items={[
            { id: "day", title: "For a day", onSelect: () => onPause("day") },
            { id: "week", title: "For a week", onSelect: () => onPause("week") },
            { id: "until_resumed", title: "Until I turn it back on", onSelect: () => onPause("until_resumed") },
          ]}>
            <View style={styles.menuValue} accessibilityRole="button" accessibilityLabel="Pause"><Icon name="pick" size={12} tone="ink-4" /></View>
          </Menu>
        </View>}
    </Card>
    <View style={styles.group}>
      <View style={styles.label}><Text role="footnote" weight="medium" tone="ink-2">Which jobs</Text></View>
      <Card bare>
        <View style={styles.row}>
          <Text flex>How many</Text>
          {howMany ? <Text tone="ink-3">{howMany}</Text> : null}
          <View style={styles.room} />
        </View>
        <Pressable onPress={onHidden} accessibilityRole="button" style={({ pressed }) => [styles.row, styles.rule, pressed && styles.pressed]}>
          <Text flex>Hidden companies</Text>
          {hidden !== undefined ? <Text tone="ink-3">{String(hidden)}</Text> : null}
          <Icon name="disclosure" size={12} tone="ink-4" />
        </Pressable>
      </Card>
      <View style={styles.label}><Text role="footnote" tone="ink-3">Only strong matches. A question only you can answer waits for you.</Text></View>
    </View>
  </YouPage>;
}

function Card({ children, bare }: { children: React.ReactNode; bare?: boolean }) {
  return <View style={bare ? null : styles.group}><View style={styles.card}>{children}</View></View>;
}

/** You → Auto-apply, on the live settings. Shown where sends are on. */
export function AutoApplyPage() {
  const settings = useAutoApplySettings();
  const save = useSaveAutoApplySettings();
  const plan = usePlan();
  const companies = useCompanies();
  if (!settings.data) return <YouPage title="Auto-apply"><RowPlaceholders rows={4} /></YouPage>;
  const failed = () => toast.error("Couldn't change that. Try again.");
  return <AutoApplyView settings={settings.data}
    howMany={howManyLabel(plan.data?.allowances.find((allowance) => allowance.kind === "auto_apply_send"))}
    hidden={companies.data?.filter((company) => Boolean(company.blocked)).length}
    onMode={(mode) => save.mutate({ mode }, {
      // Apply for me is Pro; the server says so if the plan lapsed meanwhile.
      onError: (error) => toast.error(error instanceof Error && error.message ? error.message : "Couldn't change that. Try again."),
    })}
    onPause={(pause) => save.mutate({ pause }, { onError: failed })}
    onHidden={() => router.push("/you/companies" as Href)} />;
}

/** The kit's copy (Paper S1 to S3); nothing is saved. */
export function SampleAutoApplyPage({ paused, pro }: { paused?: boolean; pro?: boolean }) {
  const [settings, setSettings] = useState<AutoApplySettings>({
    mode: pro ? "auto" : "ask",
    paused_until: paused ? new Date(Date.now() + 86_400_000).toISOString() : null,
    paused_indefinitely: false,
    can_automate: Boolean(pro),
  });
  return <AutoApplyView settings={settings} howMany={pro ? "Up to 10 a day" : "3 a week"} hidden={4}
    onMode={(mode) => setSettings({ ...settings, mode })}
    onPause={(pause) => setSettings({
      ...settings,
      paused_until: pause === null ? null : new Date(Date.now() + (pause === "week" ? 7 : pause === "day" ? 1 : 3650) * 86_400_000).toISOString(),
      paused_indefinitely: pause === "until_resumed",
    })}
    onHidden={() => router.push("/you/companies?sample=on" as Href)} />;
}

const styles = StyleSheet.create((theme) => ({
  group: { gap: theme.ui.space["1"], paddingHorizontal: theme.ui.size.gutter },
  label: { paddingHorizontal: theme.ui.space["4"] },
  card: { paddingHorizontal: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  row: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.ui.color.separator },
  pressed: { opacity: 0.6 },
  menuValue: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  room: { width: 12 },
}));
