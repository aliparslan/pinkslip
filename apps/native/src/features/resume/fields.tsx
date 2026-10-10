import { joinUsLocation, monthInputValue, splitUsLocation, US_STATES } from "@pinkslip/core/resume-fields";
import { Plus, X } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { View, type KeyboardTypeOptions } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, Field, IconButton, Inline, Input, Select, Stack, Switch, Text, Textarea } from "../../kit";

export function TextField({ label, value, onChange, optional, keyboardType, autoComplete, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: "name" | "email" | "tel" | "url" | "off";
  placeholder?: string;
}) {
  const url = keyboardType === "url" || keyboardType === "email-address";
  return <Field label={label} optional={optional}>
    <Input value={value} onChangeText={onChange} keyboardType={keyboardType} autoComplete={autoComplete} placeholder={placeholder}
      autoCapitalize={url ? "none" : "sentences"} autoCorrect={!url} />
  </Field>;
}

/** City and state, stored as "City, ST" like the web. */
export function CityState({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { city, state } = splitUsLocation(value);
  return <View style={styles.pair}>
    <View style={styles.half}><TextField label="City" optional value={city} onChange={(next) => onChange(joinUsLocation(next, state))} /></View>
    <View style={styles.half}><Field label="State" optional>
      <Select label="State" value={state} placeholder="None" onValueChange={(next) => onChange(joinUsLocation(city, next === "none" ? "" : next))}
        options={[{ value: "none", label: "None" }, ...US_STATES.map((option) => ({ value: option.value, label: option.label }))]} />
    </Field></View>
  </View>;
}

/** A month typed as YYYY-MM (older free-text dates read as months), saved
 * when it's complete or cleared. */
export function MonthField({ label, value, onChange, optional = true }: { label: string; value: string; onChange: (value: string) => void; optional?: boolean }) {
  const [text, setText] = useState(monthInputValue(value));
  useEffect(() => setText(monthInputValue(value)), [value]);
  return <Field label={label} optional={optional}>
    <Input value={text} placeholder="2024-05" keyboardType="numbers-and-punctuation" maxLength={7}
      onChangeText={(next) => {
        const digits = next.replace(/\D/g, "").slice(0, 6);
        const formatted = digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
        setText(formatted);
        if (formatted === "" || /^\d{4}-(0[1-9]|1[0-2])$/.test(formatted)) onChange(formatted);
      }} />
  </Field>;
}

/** Start and end months; "I'm still here" sets the end to Present. */
export function DateRange({ start, end, onChange, currentLabel }: { start: string; end: string; onChange: (start: string, end: string) => void; currentLabel?: string }) {
  const current = /^(present|current)$/i.test(end.trim());
  return <Stack gap="3">
    <View style={styles.pair}>
      <View style={styles.half}><MonthField label="Start" value={start} onChange={(next) => onChange(next, end)} /></View>
      {!current && <View style={styles.half}><MonthField label="End" value={end} onChange={(next) => onChange(start, next)} /></View>}
    </View>
    {currentLabel && <Inline justify="between"><Text>{currentLabel}</Text><Switch label={currentLabel} checked={current} onCheckedChange={(on) => onChange(start, on ? "Present" : "")} /></Inline>}
  </Stack>;
}

/** Accomplishment bullets, one box each, always at least one. */
export function Bullets({ label, items, placeholder, onChange }: { label: string; items: string[]; placeholder: string; onChange: (items: string[]) => void }) {
  return <Stack gap="2">
    <Text size="sm" weight="medium" tone="ink-2">{label}</Text>
    {items.map((item, index) => <View key={index} style={styles.removable}>
      <View style={styles.grow}><Textarea accessibilityLabel={`${label} ${index + 1}`} value={item} placeholder={placeholder} style={styles.bullet}
        onChangeText={(text) => onChange(items.map((current, at) => (at === index ? text : current)))} /></View>
      {items.length > 1 && <IconButton icon={X} label={`Remove ${label.toLowerCase()} ${index + 1}`} size="sm" onPress={() => onChange(items.filter((_, at) => at !== index))} />}
    </View>)}
    <View><Button size="compact" icon={Plus} onPress={() => onChange([...items, ""])}>Add another</Button></View>
  </Stack>;
}

export interface Pair { category: string; items: string }

/** Named groups (skills, certifications…): a title and its details. */
export function PairList({ titleLabel, detailLabel, detailPlaceholder, items, onChange }: {
  titleLabel: string; detailLabel: string; detailPlaceholder: string; items: Pair[]; onChange: (items: Pair[]) => void;
}) {
  const update = (index: number, patch: Partial<Pair>) => onChange(items.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  return <Stack gap="5">
    {items.map((item, index) => <Stack key={index} gap="3">
      <View style={styles.removable}>
        <View style={styles.grow}><TextField label={titleLabel} value={item.category} onChange={(category) => update(index, { category })} /></View>
        <IconButton icon={X} label={`Remove ${item.category || `item ${index + 1}`}`} size="sm" onPress={() => onChange(items.filter((_, at) => at !== index))} />
      </View>
      <Field label={detailLabel}><Textarea value={item.items} placeholder={detailPlaceholder} style={styles.bullet} onChangeText={(text) => update(index, { items: text })} /></Field>
    </Stack>)}
    <View><Button size="compact" icon={Plus} onPress={() => onChange([...items, { category: "", items: "" }])}>Add another</Button></View>
  </Stack>;
}

const styles = StyleSheet.create((theme) => ({
  pair: { flexDirection: "row", gap: theme.space["3"] },
  half: { flex: 1 },
  removable: { flexDirection: "row", alignItems: "flex-end", gap: theme.space["2"] },
  grow: { flex: 1 },
  bullet: { minHeight: 72 },
}));
