import { HStack, Host, Picker, Text as SwiftText } from "@expo/ui/swift-ui";
import { frame, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { Children, cloneElement, Fragment, isValidElement, memo, useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Pressable, Switch, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { face } from "./fonts";
import { Fold, OPEN_WHEEL } from "./Fold";
import { useMotionTrial } from "./motion-trial";
import { Icon } from "./Icon";
import { useFormField } from "./FormKeyboard";
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
        {/* A row that folds away takes its line with it. */}
        {index > 0 && isValidElement(row) && row.type === Fold
          ? cloneElement(row as ReactElement<{ lead?: ReactNode }>, { lead: <View style={styles.rule} /> })
          : <>{index > 0 ? <View style={styles.rule} /> : null}{row}</>}
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
  returnKeyType?: TextInputProps["returnKeyType"];
  onSubmitEditing?: () => void;
  onBlur?: () => void;
}

/** A field whose label sits in the value's place until you type, then
 * shrinks up above it (R2c). The label glides up and shrinks as the field
 * takes focus, and the value has one place from the start, so nothing jumps
 * as you type (owner, 2026-11-07: the text moved down and the label just
 * swapped). The whole field takes the tap, not only its line of text. */
export function TextField({ label, value, onChangeText, keyboardType, autoCapitalize, autoComplete, textContentType, multiline, autoFocus, returnKeyType, onSubmitEditing, onBlur }: TextFieldProps) {
  const { theme } = useUnistyles();
  const input = useRef<TextInput>(null);
  const form = useFormField(input);
  const [focused, setFocused] = useState(false);
  const raised = focused || value.length > 0;
  const lift = useSharedValue(raised ? 1 : 0);
  useEffect(() => { lift.value = withTiming(raised ? 1 : 0, LABEL_MOTION); }, [raised, lift]);
  const body = theme.ui.type.body;
  const small = theme.ui.type.footnote.size / body.size;
  // At rest it's centred in the field, where the value would be; raised, it
  // sits in the footnote's line above the value.
  const rest = (FIELD_HEIGHT - body.line) / 2 - FIELD_PAD;
  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - lift.value) * rest }, { scale: 1 - (1 - small) * lift.value }],
  }), [rest, small]);
  const url = keyboardType === "url" || keyboardType === "email-address";
  return <Pressable style={styles.field} onPress={() => input.current?.focus()} accessible={false}>
    <Animated.View pointerEvents="none" style={[styles.label, labelStyle]} importantForAccessibility="no-hide-descendants">
      <Text tone="ink-3" lines={1}>{label}</Text>
    </Animated.View>
    <TextInput ref={input} value={value} onChangeText={onChangeText}
      onFocus={() => { setFocused(true); form?.focused(); }} onBlur={() => { setFocused(false); onBlur?.(); }} accessibilityLabel={label}
      keyboardType={keyboardType} autoCapitalize={autoCapitalize ?? (url ? "none" : "sentences")} autoCorrect={!url}
      autoComplete={autoComplete} textContentType={textContentType} multiline={multiline} autoFocus={autoFocus}
      returnKeyType={returnKeyType} onSubmitEditing={onSubmitEditing} inputAccessoryViewID={form?.id}
      selectionColor={theme.ui.color.accent} style={[styles.input, face.text]} />
    {form?.bar}
  </Pressable>;
}

/** A field's height and the room above and below its lines. */
const FIELD_HEIGHT = 62;
const FIELD_PAD = 10;
/** The label's move: quick, easing out, as a field taking focus does. */
const LABEL_MOTION = { duration: 180, easing: Easing.out(Easing.cubic) };

/** A value typed at the row's end (GPA). */
export function InlineField({ label, value, onChangeText, keyboardType }: Pick<TextFieldProps, "label" | "value" | "onChangeText" | "keyboardType">) {
  const { theme } = useUnistyles();
  const input = useRef<TextInput>(null);
  const form = useFormField(input);
  return <View style={styles.row}>
    <Text flex>{label}</Text>
    <TextInput ref={input} onFocus={form?.focused} inputAccessoryViewID={form?.id} value={value} onChangeText={onChangeText} keyboardType={keyboardType} accessibilityLabel={label} placeholder="Add" textAlign="right"
      placeholderTextColor={theme.ui.color["ink-3"]} selectionColor={theme.ui.color.accent}
      style={[styles.inline, face.text]} />
    {form?.bar}
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

/** After a page's push has settled. */
const WHEEL_WARM_MS = 700;
/** iOS's wheel, and the room under it. */
const WHEEL_HEIGHT = 216;
const WHEEL_GAP = 8;

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
  const latest = useRef(onChange);
  latest.current = onChange;
  const pick = useCallback((nextYear: number, nextMonth: number) => latest.current(`${nextYear}-${String(nextMonth).padStart(2, "0")}`), []);
  const set = pick;
  const toggle = () => {
    // Opening an empty date starts it at this month.
    if (!open && !match) set(year, month);
    onToggle();
  };
  // The wheel's space opens and closes instead of jumping, and the wheel
  // is drawn at its full size from the start so iOS sizes it once (flow run
  // 5.2; Kit → Motion fixes).
  const smooth = useMotionTrial("wheel");
  // Built a moment after the page opens, while nothing is moving, so a
  // tap opens it at once instead of waiting for iOS to build it.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    if (!smooth) return;
    const timer = setTimeout(() => setWarm(true), WHEEL_WARM_MS);
    return () => clearTimeout(timer);
  }, [smooth]);
  // Drawn again only when its own month or year changes: rebuilding both
  // wheels' 72 rows on every tap held a tap up by about 200ms (owner,
  // 2026-11-08: lag before Ended's wheel opened after setting Started).
  const picker = <Wheel year={year} month={month} onPick={pick} sized={smooth} />;
  // In a frame of iOS's own wheel height, set up front instead of measured
  // as it draws.
  const wheel = smooth ? <View style={styles.wheelFrame}>{picker}</View> : picker;
  return <View>
    <View style={styles.row}>
      <Text flex>{label}</Text>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={`${label}, ${monthLabel(value) || "not set"}`}
        style={({ pressed }) => [styles.chip, open && styles.chipOpen, pressed && styles.pressed]}>
        <Text tone={open ? "accent" : value ? "ink" : "ink-3"}>{monthLabel(value) || "Month"}</Text>
      </Pressable>
    </View>
    {smooth ? <Fold shown={open} motion={OPEN_WHEEL} warm={warm} height={WHEEL_HEIGHT + WHEEL_GAP}>{wheel}</Fold> : open ? wheel : null}
  </View>;
}

const WHEEL_MODIFIERS = [pickerStyle("wheel"), frame({ maxWidth: 999 })];
const MONTH_ROWS = MONTHS.map((name, index) => <SwiftText key={name} modifiers={[tag(index + 1)]}>{name}</SwiftText>);
const THIS_YEAR = new Date().getFullYear();
const YEAR_ROWS = Array.from({ length: 60 }, (_, index) => THIS_YEAR + 6 - index)
  .map((option) => <SwiftText key={option} modifiers={[tag(option)]}>{String(option)}</SwiftText>);

/** iOS's month and year wheels. */
const Wheel = memo(function Wheel({ year, month, onPick, sized }: {
  year: number; month: number; onPick: (year: number, month: number) => void; sized: boolean;
}) {
  return <Host matchContents={sized ? undefined : { vertical: true }} style={sized ? styles.wheelFill : styles.wheel}>
    <HStack spacing={0}>
      <Picker selection={month} onSelectionChange={(next: number) => onPick(year, next)} modifiers={WHEEL_MODIFIERS}>{MONTH_ROWS}</Picker>
      <Picker selection={year} onSelectionChange={(next: number) => onPick(next, month)} modifiers={WHEEL_MODIFIERS}>{YEAR_ROWS}</Picker>
    </HStack>
  </Host>;
});

/** What you did, a line each, with "Add a line" at the end. An emptied line
 * goes when you leave it. */
export function BulletRows({ items, onChange, label = "Add a line" }: { items: string[]; onChange: (items: string[]) => void; label?: string }) {
  const { theme } = useUnistyles();
  const [fresh, setFresh] = useState<number | null>(null);
  const font = face.text;
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
  // The value's line sits under the label's, from the start.
  field: { minHeight: FIELD_HEIGHT, paddingTop: FIELD_PAD + theme.ui.type.footnote.line, paddingBottom: FIELD_HEIGHT - FIELD_PAD - theme.ui.type.footnote.line - theme.ui.type.body.line },
  label: { position: "absolute", top: FIELD_PAD, left: 0, right: 0, transformOrigin: "0% 0%" },
  input: { padding: 0, fontSize: theme.ui.type.body.size, lineHeight: theme.ui.type.body.line, color: theme.ui.color.ink },
  row: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  inline: { minWidth: 80, padding: 0, fontSize: theme.ui.type.body.size, lineHeight: theme.ui.type.body.line, color: theme.ui.color.ink },
  chip: { height: 34, justifyContent: "center", paddingHorizontal: 11, borderRadius: theme.ui.radius.sm, borderCurve: "continuous", backgroundColor: theme.ui.color.bg },
  chipOpen: { backgroundColor: theme.ui.color["accent-soft"] },
  wheel: { marginBottom: WHEEL_GAP },
  wheelFrame: { height: WHEEL_HEIGHT, marginBottom: WHEEL_GAP },
  wheelFill: { flex: 1 },
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
