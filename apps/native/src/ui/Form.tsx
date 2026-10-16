import { HStack, Host, Picker, Text as SwiftText } from "@expo/ui/swift-ui";
import { frame, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { Children, Fragment, useState, type ReactNode } from "react";
import { Pressable, Switch, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { faces, useUiFontsLoaded } from "./fonts";
import { Icon } from "./Icon";
import { Text } from "./Text";

/**
 * The editors' form parts (Paper "Resume and Answers editors · Oct 14", R2a
 * to R5, owner picks): fields in white cards on the Mist page, lines between
 * them, labels above values that sit in place until you type (R2c), dates as
 * chips that open an inline month wheel (R3), bullets as rows.
 */

/** A white card of fields, with a line between each, and its label 4 above
 * it lined up with the fields' text. */
export function FieldGroup({ label, children }: { label?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return <View style={styles.group}>
    {label ? <View style={styles.groupLabel}><Text role="footnote" weight="medium" tone="ink-2">{label}</Text></View> : null}
    <View style={styles.card}>
      {rows.map((row, index) => <Fragment key={index}>
        {index > 0 ? <View style={styles.rule} /> : null}
        {row}
      </Fragment>)}
    </View>
  </View>;
}

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  /** Several lines (a bullet). */
  multiline?: boolean;
  autoFocus?: boolean;
}

/** A field whose label sits in the value's place until you type, then
 * shrinks up above it (R2c). */
export function TextField({ label, value, onChangeText, keyboardType, autoCapitalize, autoComplete, textContentType, multiline, autoFocus }: TextFieldProps) {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  const [focused, setFocused] = useState(false);
  const raised = focused || value.length > 0;
  const url = keyboardType === "url" || keyboardType === "email-address";
  return <View style={styles.field}>
    {raised ? <Text role="footnote" tone="ink-3">{label}</Text> : null}
    <TextInput value={value} onChangeText={onChangeText} placeholder={raised ? undefined : label} placeholderTextColor={theme.ui.color["ink-3"]}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} accessibilityLabel={label}
      keyboardType={keyboardType} autoCapitalize={autoCapitalize ?? (url ? "none" : "sentences")} autoCorrect={!url}
      autoComplete={autoComplete} textContentType={textContentType} multiline={multiline} autoFocus={autoFocus}
      selectionColor={theme.ui.color.accent} style={[styles.input, { fontFamily: fonts ? faces.text : undefined }]} />
  </View>;
}

/** A value typed at the row's end (GPA). */
export function InlineField({ label, value, onChangeText, keyboardType }: Pick<TextFieldProps, "label" | "value" | "onChangeText" | "keyboardType">) {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  return <View style={styles.row}>
    <Text flex>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} accessibilityLabel={label} placeholder="Add" textAlign="right"
      placeholderTextColor={theme.ui.color["ink-3"]} selectionColor={theme.ui.color.accent}
      style={[styles.inline, { fontFamily: fonts ? faces.text : undefined }]} />
  </View>;
}

/** A setting's on and off, in the pink. */
export function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const { theme } = useUnistyles();
  return <View style={styles.row}>
    <Text flex>{label}</Text>
    <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.ui.color["accent-fill"] }} accessibilityLabel={label} />
  </View>;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((month) => month.slice(0, 3));

/** "2025-06" as "Jun 2025". */
export function monthLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return match ? `${SHORT[Number(match[2]) - 1]} ${match[1]}` : "";
}

/** A month and year (R3): the chip shows it ("Month" until set) and opens
 * the iPhone's wheel in place; the open chip is pink. Stored "YYYY-MM". */
export function MonthRow({ label, value, onChange, open, onToggle }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** One wheel open at a time: the page says which. */
  open: boolean;
  onToggle: () => void;
}) {
  const now = new Date();
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) : now.getMonth() + 1;
  const years = Array.from({ length: 60 }, (_, index) => now.getFullYear() + 6 - index);
  const set = (nextYear: number, nextMonth: number) => onChange(`${nextYear}-${String(nextMonth).padStart(2, "0")}`);
  const toggle = () => {
    // Opening an empty date starts it at this month.
    if (!open && !match) set(year, month);
    onToggle();
  };
  return <View>
    <View style={styles.row}>
      <Text flex>{label}</Text>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={`${label}, ${monthLabel(value) || "not set"}`}
        style={({ pressed }) => [styles.chip, open && styles.chipOpen, pressed && styles.pressed]}>
        <Text tone={open ? "accent" : value ? "ink" : "ink-3"}>{monthLabel(value) || "Month"}</Text>
      </Pressable>
    </View>
    {open ? <Host matchContents={{ vertical: true }} style={styles.wheel}>
      <HStack spacing={0}>
        <Picker selection={month} onSelectionChange={(next: number) => set(year, next)} modifiers={[pickerStyle("wheel"), frame({ maxWidth: 999 })]}>
          {MONTHS.map((name, index) => <SwiftText key={name} modifiers={[tag(index + 1)]}>{name}</SwiftText>)}
        </Picker>
        <Picker selection={year} onSelectionChange={(next: number) => set(next, month)} modifiers={[pickerStyle("wheel"), frame({ maxWidth: 999 })]}>
          {years.map((option) => <SwiftText key={option} modifiers={[tag(option)]}>{String(option)}</SwiftText>)}
        </Picker>
      </HStack>
    </Host> : null}
  </View>;
}

/** What you did, a line each, with "Add a line" at the end. An emptied line
 * goes when you leave it. */
export function BulletRows({ items, onChange, label = "Add a line" }: { items: string[]; onChange: (items: string[]) => void; label?: string }) {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  const [fresh, setFresh] = useState<number | null>(null);
  const font = { fontFamily: fonts ? faces.text : undefined };
  return <>
    {items.map((item, index) => <Fragment key={index}>
      {index > 0 ? <View style={styles.bulletRule} /> : null}
      <View style={styles.bullet}>
        <Text tone="ink-3">•</Text>
        <TextInput value={item} multiline autoFocus={fresh === index} scrollEnabled={false} accessibilityLabel={`Line ${index + 1}`}
          onChangeText={(text) => onChange(items.map((current, at) => at === index ? text : current))}
          onBlur={() => { if (!items[index]?.trim()) onChange(items.filter((_, at) => at !== index)); }}
          selectionColor={theme.ui.color.accent} style={[styles.bulletInput, font]} />
      </View>
    </Fragment>)}
    {items.length > 0 ? <View style={styles.bulletRule} /> : null}
    <Pressable accessibilityRole="button" onPress={() => { setFresh(items.length); onChange([...items, ""]); }}
      style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}>
      <Icon name="add" size={16} tone="ink-3" />
      <Text tone="ink-3">{label}</Text>
    </Pressable>
  </>;
}

/** "Add a second major": a quiet row that adds a field. */
export function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}>
    <Icon name="add" size={16} tone="ink-3" />
    <Text tone="ink-3">{label}</Text>
  </Pressable>;
}

/** A row that deletes, in red, in its own card. */
export function DangerRow({ label, onPress }: { label: string; onPress: () => void }) {
  return <View style={styles.dangerSlot}>
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.danger, pressed && styles.pressed]}>
      <Text tone="bad">{label}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  group: { gap: theme.ui.space["1"], paddingHorizontal: theme.ui.size.gutter },
  groupLabel: { paddingHorizontal: theme.ui.space["4"] },
  card: {
    paddingHorizontal: theme.ui.space["4"],
    borderRadius: theme.ui.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color["bg-grouped"],
  },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: theme.ui.color.separator },
  field: { minHeight: 62, justifyContent: "center", paddingVertical: 10 },
  input: { padding: 0, fontSize: theme.ui.type.body.size, lineHeight: theme.ui.type.body.line, color: theme.ui.color.ink },
  row: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  inline: { minWidth: 80, padding: 0, fontSize: theme.ui.type.body.size, lineHeight: theme.ui.type.body.line, color: theme.ui.color.ink },
  chip: { height: 34, justifyContent: "center", paddingHorizontal: 11, borderRadius: theme.ui.radius.sm, borderCurve: "continuous", backgroundColor: theme.ui.color.bg },
  chipOpen: { backgroundColor: theme.ui.color["accent-soft"] },
  wheel: { marginBottom: theme.ui.space["2"] },
  bullet: { flexDirection: "row", gap: 10, paddingVertical: 14 },
  bulletInput: { flex: 1, padding: 0, fontSize: theme.ui.type.body.size, lineHeight: theme.ui.type.body.line, color: theme.ui.color.ink },
  bulletRule: { height: StyleSheet.hairlineWidth, marginLeft: 18, backgroundColor: theme.ui.color.separator },
  addRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  dangerSlot: { paddingHorizontal: theme.ui.size.gutter },
  danger: {
    minHeight: 50, justifyContent: "center", paddingHorizontal: theme.ui.space["4"],
    borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"],
  },
  pressed: { opacity: 0.6 },
}));
