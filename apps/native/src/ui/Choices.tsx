import { Children, Fragment, useEffect, useRef, type ReactNode } from "react";
import { Pressable, Switch, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { faces, useUiFontsLoaded } from "./fonts";
import { Icon } from "./Icon";
import { Radio } from "./List";
import { SHEET_GROUP_BOTTOM_RADIUS, SHEET_GROUP_RADIUS } from "./sheet-geometry";
import { Text } from "./Text";

/** A sheet's plain menu (Paper "Filters · plain menu", owner 2026-10-12): a
 * flat card, white on the sheet's Mist in light (Sheets A, 2026-10-15), no
 * lift or grain, with a rule between rows. Paper objects
 * stay on pages; inside a sheet everything is a menu. Its corners run
 * parallel to the sheet's; `last` when nothing follows it, so its bottom
 * corners follow the sheet's bottom. */
export function Choices({ last = false, children }: { last?: boolean; children: ReactNode }) {
  const rows = Children.toArray(children);
  return <View style={[styles.card, last && styles.last]}>
    {rows.map((row, index) => <Fragment key={index}>
      {index > 0 ? <View style={styles.rule} /> : null}
      {row}
    </Fragment>)}
  </View>;
}

export interface ChoiceProps {
  title: string;
  /** A quieter line under the title ("Graduating this year or last"). */
  detail?: string;
  selected: boolean;
  onPress: () => void;
  /** One of several (a radio) or one of a set you can mix (a checkbox). */
  multiple?: boolean;
  /** A mark before the title, in a 24 slot (a stage's ring). */
  leading?: ReactNode;
  /** What it costs or holds, before the check ("$24.99"). */
  value?: string;
  /** One line each, 48 tall, Regular until picked (Report's reasons). */
  plain?: boolean;
  /** Something typed at the row's end, before the check (an AmountInput). */
  trailing?: ReactNode;
}

/** A row to pick: title on the left, the round check on the right. */
export function Choice({ title, detail, selected, onPress, multiple = false, leading, value, plain = false, trailing }: ChoiceProps) {
  return <Pressable onPress={onPress} accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityState={{ checked: selected }}
    accessibilityLabel={title} style={({ pressed }) => [styles.row, plain && styles.plain, pressed && styles.pressed]}>
    {leading ? <View style={styles.leading}>{leading}</View> : null}
    <View style={styles.text}>
      <Text weight={plain && !selected ? "regular" : "medium"}>{title}</Text>
      {detail ? <Text role="footnote" tone="ink-3">{detail}</Text> : null}
    </View>
    {value ? <Text>{value}</Text> : null}
    {trailing}
    <Radio selected={selected} />
  </Pressable>;
}

export interface AmountInputProps {
  /** Whole dollars, or null while it's empty. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** The most it takes; digits past it don't go in. */
  max: number;
  /** Focus it now: its row was just picked. */
  focused: boolean;
  onFocus?: () => void;
  label: string;
}

/** Whole dollars typed at a choice's end, where Plan's prices sit (Paper
 * "Support Pinkslip · Oct 22", A3, owner 2026-10-24): "$7" in Body ink with
 * the pink caret, on the number pad. Nothing below $1 or above `max` goes in,
 * so there's no error to show. */
export function AmountInput({ value, onChange, max, focused, onFocus, label }: AmountInputProps) {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  const input = useRef<TextInput>(null);
  useEffect(() => {
    if (focused) input.current?.focus();
  }, [focused]);
  return <TextInput ref={input} value={value === null ? "" : `$${value}`} placeholder="Amount" placeholderTextColor={theme.ui.color["ink-3"]}
    onChangeText={(text) => {
      const digits = text.replace(/\D/g, "");
      if (!digits) return onChange(null);
      const next = Number(digits);
      if (next >= 1 && next <= max) onChange(next);
    }}
    onFocus={onFocus} keyboardType="number-pad" textAlign="right" accessibilityLabel={label}
    selectionColor={theme.ui.color.accent} style={[styles.amount, { fontFamily: fonts ? faces.text : undefined }]} />;
}

export interface ChoiceLinkProps {
  title: string;
  /** The current value, before the chevron ("SWE, Frontend +2", "Off"). */
  value?: string;
  /** Without it the row is a placeholder: its value and no chevron ("Soon"). */
  onPress?: () => void;
}

/** A menu row that opens something: its value, then a chevron. */
export function ChoiceLink({ title, value, onPress }: ChoiceLinkProps) {
  const content = <>
    <Text>{title}</Text>
    <Text tone="ink-3" align="right" lines={1} flex>{value}</Text>
    {onPress ? <Icon name="disclosure" size={12} tone="ink-4" /> : null}
  </>;
  if (!onPress) return <View style={[styles.row, styles.link]}>{content}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, styles.link, pressed && styles.pressed]}>
    {content}
  </Pressable>;
}

export interface ChoiceSwitchProps {
  title: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

/** A row with an on/off switch, tinted with the pink fill as in the design. */
export function ChoiceSwitch({ title, value, onChange }: ChoiceSwitchProps) {
  const { theme } = useUnistyles();
  return <View style={styles.row}>
    <View style={styles.text}><Text weight="medium">{title}</Text></View>
    <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.ui.color["accent-fill"] }} accessibilityLabel={title} />
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    paddingHorizontal: theme.ui.space["4"],
    borderRadius: SHEET_GROUP_RADIUS,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color["sheet-group"],
  },
  last: { borderBottomLeftRadius: SHEET_GROUP_BOTTOM_RADIUS, borderBottomRightRadius: SHEET_GROUP_BOTTOM_RADIUS },
  rule: { height: 1, backgroundColor: theme.ui.color.separator },
  row: { minHeight: theme.ui.size.listRow + 12, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["3"] },
  plain: { minHeight: 48, paddingVertical: theme.ui.space["2"] },
  /** A menu row is 50 tall, as drawn. */
  link: { minHeight: 50, gap: theme.ui.space["2"], paddingVertical: 0 },
  text: { flex: 1, gap: 2 },
  leading: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  amount: { minWidth: 72, padding: 0, fontSize: theme.ui.type.body.size, lineHeight: theme.ui.type.body.line, color: theme.ui.color.ink },
  pressed: { opacity: 0.6 },
}));
