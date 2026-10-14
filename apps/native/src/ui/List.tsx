import { Children, Fragment, type ReactNode } from "react";
import { Pressable, Switch, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** The slot for a row's leading icon, so titles line up down the card. */
const LEADING = 28;

export interface ListGroupProps {
  /** Footnote-sized label above the card. */
  header?: string;
  /** Quiet note under the card (what stays free, what a setting does). */
  footer?: string;
  /** Where separators start: 16 for plain rows, or under the title when rows lead with an icon. */
  inset?: "gutter" | "leading";
  children: ReactNode;
}

/** An inset grouped list: a 12pt card on the grouped background, 16 from the
 * screen edges, with hairlines between rows. */
export function ListGroup({ header, footer, inset = "gutter", children }: ListGroupProps) {
  const rows = Children.toArray(children);
  return <View style={styles.group}>
    {header ? <View style={styles.header}><Text role="footnote" weight="medium" tone="ink-2">{header}</Text></View> : null}
    <View style={styles.card}>
      {rows.map((row, index) => <Fragment key={index}>
        {index > 0 ? <View style={[styles.separator, inset === "leading" ? styles.leadingInset : styles.gutter]} /> : null}
        {row}
      </Fragment>)}
    </View>
    {footer ? <View style={styles.footer}><Text role="footnote" tone="ink-3">{footer}</Text></View> : null}
  </View>;
}

export type ListAccessory = "chevron" | "check" | "radio" | "switch" | "none";

export interface ListItemProps {
  title: string;
  /** A second, quieter line under the title, or beside it with `inline`. */
  detail?: string;
  inline?: boolean;
  /** The current value on the right (Daily, $24.99, 8:00 AM). */
  value?: string;
  leading?: ReactNode;
  accessory?: ListAccessory;
  selected?: boolean;
  onPress?: () => void;
  /** With `accessory="switch"`: the switch flips `selected`. */
  onToggle?: (value: boolean) => void;
}

/** A list row: at least 44pt, title on the left, value and accessory on the right. */
export function ListItem({ title, detail, inline, value, leading, accessory = "none", selected = false, onPress, onToggle }: ListItemProps) {
  const { theme } = useUnistyles();
  if (accessory === "switch") {
    return <View style={styles.row}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Text>{title}</Text>
        {detail ? <Text role="subhead" tone="ink-3">{detail}</Text> : null}
      </View>
      {/* The system switch, tinted with the pink fill as in the design. */}
      <Switch value={selected} onValueChange={onToggle} trackColor={{ true: theme.ui.color["accent-fill"] }} accessibilityLabel={title} />
    </View>;
  }
  const content = <>
    {leading ? <View style={styles.leading}>{leading}</View> : null}
    <View style={[styles.text, inline && styles.inline]}>
      <Text weight={accessory === "radio" ? "medium" : "regular"}>{title}</Text>
      {detail ? <Text role="subhead" tone="ink-3">{detail}</Text> : null}
    </View>
    {value ? <Text tone="ink-2">{value}</Text> : null}
    {accessory === "chevron" ? <Icon name="disclosure" size={14} tone="ink-3" /> : null}
    {accessory === "check" && selected ? <Icon name="done" size={17} tone="accent" /> : null}
    {accessory === "radio" ? <Radio selected={selected} /> : null}
  </>;
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return <Pressable accessibilityRole={accessory === "radio" ? "radio" : "button"} accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{content}</Pressable>;
}

/** 24pt: an empty ring, or an ink disc with a check. */
export function Radio({ selected }: { selected: boolean }) {
  const { theme } = useUnistyles();
  return <View style={[styles.radio, selected ? styles.radioOn : styles.radioOff]}>
    {selected ? <Icon name="done" size={12} tone="accent-ink" /> : null}
  </View>;
}

export interface SectionHeaderProps {
  title: string;
  /** How many, right after the label in ink-3. */
  count?: string | number;
  /** Pink only when something is waiting on you. */
  needsYou?: boolean;
  /** A mark before the label: Tracker's stage ring. */
  leading?: ReactNode;
  /** Makes the header the way into its group, with a chevron after the
   * count ("Applied 142 ›"). */
  onPress?: () => void;
}

/** The label above a run of plain rows (New today, Earlier this week), with
 * its count after it the way chips carry theirs. */
export function SectionHeader({ title, count, needsYou, leading, onPress }: SectionHeaderProps) {
  const content = <>
    {leading}
    <View style={styles.sectionLabel}>
      <Text role="footnote" weight="medium" tone={needsYou ? "accent" : "ink-2"}>{title}</Text>
      {count !== undefined ? <Text role="footnote" tone="ink-3">{String(count)}</Text> : null}
      {onPress ? <View style={styles.sectionChevron}><Icon name="disclosure" size={11} tone="ink-3" /></View> : null}
    </View>
  </>;
  if (!onPress) return <View style={styles.section} accessibilityRole="header">{content}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={count === undefined ? title : `${title}, ${count}`}
    style={({ pressed }) => [styles.section, pressed && styles.sectionPressed]}>{content}</Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  group: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.space["4"] },
  header: { paddingHorizontal: theme.ui.space["4"] },
  footer: { paddingHorizontal: theme.ui.space["4"] },
  card: { borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-elev"], overflow: "hidden" },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: theme.ui.color.separator },
  gutter: { marginLeft: theme.ui.space["4"] },
  leadingInset: { marginLeft: theme.ui.space["4"] + LEADING + theme.ui.space["3"] },
  row: {
    minHeight: theme.ui.size.listRow,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.ui.space["3"],
    paddingHorizontal: theme.ui.space["4"],
    paddingVertical: theme.ui.space["2"],
  },
  pressed: { backgroundColor: theme.ui.color.fill },
  leading: { width: LEADING, alignItems: "center" },
  text: { flex: 1, minWidth: 0 },
  inline: { flexDirection: "row", alignItems: "baseline", gap: theme.ui.space["2"] },
  radio: { width: theme.ui.size.hole, height: theme.ui.size.hole, borderRadius: theme.ui.radius.full, alignItems: "center", justifyContent: "center" },
  // A check or switch changes a setting, so "on" is pink (docs/design-system.md).
  radioOn: { backgroundColor: theme.ui.color["accent-fill"] },
  radioOff: { borderWidth: 1.75, borderColor: theme.ui.color["ink-4"] },
  section: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.ui.space["2"],
    paddingHorizontal: theme.ui.space["4"],
    paddingTop: theme.ui.space["4"],
    paddingBottom: theme.ui.space["1"],
  },
  sectionLabel: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  // Tucked toward the count, centred on the text rather than its baseline.
  sectionChevron: { alignSelf: "center", marginLeft: -2 },
  sectionPressed: { opacity: 0.6 },
}));
