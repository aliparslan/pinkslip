import { useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Menu, type MenuItem } from "../../../kit";
import { Icon, Radio, Text, toast } from "../../../ui";
import { YouPage } from "../you/Page";

/**
 * Auto-apply (owner, 2026-10-15, Paper "Auto-apply settings" A, after the
 * audit's Q6; O12 and A2): two groups. The mode with its time, Pause as a
 * row (Paused until … with Resume once paused); then Which jobs, each rule
 * opening the iPhone's menu in place. One footnote. Automatic shows only
 * "Pro". The settings aren't on the backend yet, so this runs on a sample.
 */
export interface AutoApplySettings {
  mode: "ask" | "off";
  time: string;
  pausedUntil: string | null;
  matches: string;
  companies: string;
  posted: string;
  perCompany: string;
  hidden: number;
}

const TIMES = ["7:00 AM", "8:00 AM", "9:00 AM", "12:00 PM", "6:00 PM"];

export function AutoApplyView({ settings, onChange, free }: { settings: AutoApplySettings; onChange: (next: AutoApplySettings) => void; free?: boolean }) {
  const set = (patch: Partial<AutoApplySettings>) => onChange({ ...settings, ...patch });
  const pause = (days: number, label: string) => {
    const until = new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    set({ pausedUntil: until });
    toast.show({ message: `Paused for ${label}` });
  };
  return <YouPage title="Auto-apply">
    <Card>
      <View style={styles.row}>
        <Text flex>Ask each morning</Text>
        <Menu title="" items={TIMES.map((time) => ({ id: time, title: time, checked: settings.time === time, onSelect: () => set({ time, mode: "ask" }) }))}>
          <View style={styles.timeChip}><Text>{settings.time}</Text></View>
        </Menu>
        <Pressable onPress={() => set({ mode: "ask" })} hitSlop={8} accessibilityRole="radio" accessibilityState={{ checked: settings.mode === "ask" }}><Radio selected={settings.mode === "ask"} /></Pressable>
      </View>
      <View style={[styles.row, styles.rule]}>
        <Text flex>Send as jobs post</Text>
        <Text tone="ink-3">Pro</Text>
      </View>
      <Pressable onPress={() => set({ mode: "off" })} style={[styles.row, styles.rule]} accessibilityRole="radio" accessibilityState={{ checked: settings.mode === "off" }}>
        <Text flex>Off</Text>
        <Radio selected={settings.mode === "off"} />
      </Pressable>
      {settings.pausedUntil
        ? <View style={[styles.row, styles.rule]}>
          <Text flex>{`Paused until ${settings.pausedUntil}`}</Text>
          <Pressable onPress={() => set({ pausedUntil: null })} accessibilityRole="button" hitSlop={8}><Text weight="medium">Resume</Text></Pressable>
        </View>
        : <MenuRow label="Pause" value="" items={[
          { id: "day", title: "For a day", onSelect: () => pause(1, "a day") },
          { id: "week", title: "For a week", onSelect: () => pause(7, "a week") },
          { id: "two", title: "For two weeks", onSelect: () => pause(14, "two weeks") },
        ]} rule />}
    </Card>
    <View style={styles.group}>
      <View style={styles.label}><Text role="footnote" weight="medium" tone="ink-2">Which jobs</Text></View>
      <Card bare>
        <MenuRow label="Matches" value={settings.matches} items={["Strong only", "Strong and good"].map((option) => ({ id: option, title: option, checked: settings.matches === option, onSelect: () => set({ matches: option }) }))} />
        <MenuRow rule label="Companies" value={settings.companies} items={["Any", "Ones I follow"].map((option) => ({ id: option, title: option, checked: settings.companies === option, onSelect: () => set({ companies: option }) }))} />
        <MenuRow rule label="Posted in the last" value={settings.posted} items={["1 day", "3 days", "A week"].map((option) => ({ id: option, title: option, checked: settings.posted === option, onSelect: () => set({ posted: option }) }))} />
        {free ? <View style={[styles.row, styles.rule]}><Text flex>How many</Text><Text tone="ink-3">3 a week on Free</Text><View style={styles.room} /></View>
          : <MenuRow rule label="A day" value="Up to 10" items={["Up to 5", "Up to 10", "Up to 20"].map((option) => ({ id: option, title: option, checked: option === "Up to 10", onSelect: () => undefined }))} />}
        <MenuRow rule label="At one company" value={settings.perCompany} items={["1 a month", "3 a month", "5 a month"].map((option) => ({ id: option, title: option, checked: settings.perCompany === option, onSelect: () => set({ perCompany: option }) }))} />
        <View style={[styles.row, styles.rule]}>
          <Text flex>Hidden companies</Text>
          <Text tone="ink-3">{String(settings.hidden)}</Text>
          <Icon name="disclosure" size={12} tone="ink-4" />
        </View>
      </Card>
      <View style={styles.label}><Text role="footnote" tone="ink-3">It never answers visa or work-status questions. When it doesn't know an answer, that job waits for you.</Text></View>
    </View>
  </YouPage>;
}

function Card({ children, bare }: { children: React.ReactNode; bare?: boolean }) {
  return <View style={bare ? null : styles.group}><View style={styles.card}>{children}</View></View>;
}

function MenuRow({ label, value, items, rule }: { label: string; value: string; items: MenuItem[]; rule?: boolean }) {
  return <View style={[styles.row, rule && styles.rule]}>
    <Text flex>{label}</Text>
    <Menu title="" items={items}>
      <View style={styles.menuValue} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`}>
        {value ? <Text tone="ink-3">{value}</Text> : null}
        <Icon name="pick" size={12} tone="ink-4" />
      </View>
    </Menu>
  </View>;
}

/** The kit's copy (O12, or A2 once paused); nothing is saved. */
export function SampleAutoApplyPage({ paused, free }: { paused?: boolean; free?: boolean }) {
  const [settings, setSettings] = useState<AutoApplySettings>({
    mode: "ask", time: "8:00 AM", pausedUntil: paused ? "Wed, Oct 22" : null,
    matches: "Strong only", companies: "Ones I follow", posted: "3 days", perCompany: "3 a month", hidden: 4,
  });
  return <AutoApplyView settings={settings} onChange={setSettings} free={free} />;
}

const styles = StyleSheet.create((theme) => ({
  group: { gap: theme.ui.space["1"], paddingHorizontal: theme.ui.size.gutter },
  label: { paddingHorizontal: theme.ui.space["4"] },
  card: { paddingHorizontal: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  row: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.ui.color.separator },
  timeChip: { height: 34, justifyContent: "center", paddingHorizontal: 11, borderRadius: theme.ui.radius.sm, borderCurve: "continuous", backgroundColor: theme.ui.color.bg },
  menuValue: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  room: { width: 12 },
}));
