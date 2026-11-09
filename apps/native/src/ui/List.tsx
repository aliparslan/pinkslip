import { Menu, type MenuItem } from "../kit/Menu";
import { Children, createContext, Fragment, useContext, type ReactNode } from "react";
import { Pressable, Switch, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** The slot for a row's leading icon, so titles line up down the card. */
const LEADING = 28;

/** Rows in a gray card on a white page are settings (Paper "You · Oct 14"):
 * 50 tall, with quieter values (`ink-3`), chevrons (`ink-4`) and details
 * (Footnote), as iOS draws Settings. */
const SettingsCard = createContext(false);

export interface ListGroupProps {
  /** The section's name above the card. */
  header?: string;
  /** How many, at the far right in the header's own size and color. */
  count?: number;
  /** The header in pink: Admin's Needs you. */
  needsYou?: boolean;
  /** Quiet note under the card (what stays free, what a setting does). */
  footer?: string;
  /** Where separators start: 16 for plain rows, or under the title when rows lead with an icon. */
  inset?: "gutter" | "leading";
  /** `elevated`, the white card, on a grouped screen; `fill`, a gray card,
   * on a white page (Paper "Email tracking · Oct 14"). */
  surface?: "elevated" | "fill";
  children: ReactNode;
}

/** An inset grouped list: a 12pt card on the grouped background, 16 from the
 * screen edges, with hairlines between rows. */
export function ListGroup({ header, count, needsYou, footer, inset = "gutter", surface = "elevated", children }: ListGroupProps) {
  const rows = Children.toArray(children);
  return <View style={styles.group}>
    {header ? <View style={[styles.header, surface === "fill" && styles.headerOnEdge, styles.headerRow]}>
      <Text role="section" tone={needsYou ? "accent" : "ink"} flex>{header}</Text>
      {count !== undefined ? <Text role="section" tone={needsYou ? "accent" : "ink"}>{String(count)}</Text> : null}
    </View> : null}
    <View style={[styles.card, surface === "fill" && styles.fill]}>
      <SettingsCard.Provider value={surface === "fill"}>
        {rows.map((row, index) => <Fragment key={index}>
          {index > 0 ? <View style={[styles.separator, inset === "leading" ? styles.leadingInset : styles.gutter, surface === "fill" && styles.gutterEnd]} /> : null}
          {row}
        </Fragment>)}
      </SettingsCard.Provider>
    </View>
    {footer ? <View style={styles.footer}><Text role="footnote" tone="ink-3">{footer}</Text></View> : null}
  </View>;
}

/** `pick` is the up-and-down caret of a row whose value opens a menu in place. */
export type ListAccessory = "chevron" | "pick" | "check" | "radio" | "switch" | "none";

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
  /** A small mark after the value, in place of an accessory (copy). */
  trailing?: ReactNode;
  /** Red, for a row that deletes or clears (Delete account, Clear resume). */
  destructive?: boolean;
  /** The thing to do, as a verb (Admin's Needs you): the title in Medium and
   * the detail a Subhead in `ink-2` under it. */
  headline?: boolean;
}

/** A list row: at least 44pt, title on the left, value and accessory on the right. */
export function ListItem({ title, detail, inline, value, leading, accessory = "none", selected = false, onPress, onToggle, trailing, destructive, headline }: ListItemProps) {
  const { theme } = useUnistyles();
  const settings = useContext(SettingsCard);
  const row = [styles.row, leading || settings ? styles.tall : null];
  if (accessory === "switch") {
    return <View style={row}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Text>{title}</Text>
        {detail ? <Text role={settings ? "footnote" : "subhead"} tone="ink-3">{detail}</Text> : null}
      </View>
      {/* The system switch, tinted with the pink fill as in the design. */}
      <Switch value={selected} onValueChange={onToggle} trackColor={{ true: theme.ui.color["accent-fill"] }} style={styles.switch} accessibilityLabel={title} />
    </View>;
  }
  const content = <>
    {leading ? <View style={styles.leading}>{leading}</View> : null}
    <View style={[styles.text, inline && styles.inline]}>
      <Text weight={(accessory === "radio" && !settings) || headline ? "medium" : "regular"} tone={destructive ? "bad" : "ink"}>{title}</Text>
      {detail ? <Text role={settings && !headline ? "footnote" : "subhead"} tone={headline ? "ink-2" : "ink-3"} lines={headline ? 1 : undefined}>{detail}</Text> : null}
    </View>
    {/* A long value (a resume's file name) gives way before the title does. */}
    {value ? <View style={styles.value}><Text tone={settings ? "ink-3" : "ink-2"} lines={1}>{value}</Text></View> : null}
    {trailing}
    {/* A value without a chevron keeps the chevron's room, so values line up
        down a card (owner, 2026-10-15). */}
    {value && !trailing && accessory === "none" ? <View style={styles.chevronRoom} /> : null}
    {accessory === "chevron" ? <Icon name="disclosure" size={12} tone="ink-4" /> : null}
    {accessory === "pick" ? <Icon name="pick" size={12} tone="ink-4" /> : null}
    {accessory === "check" && selected ? <Icon name="done" size={17} tone="accent" /> : null}
    {accessory === "radio" ? <Radio selected={selected} /> : null}
  </>;
  if (!onPress) return <View style={row}>{content}</View>;
  return <Pressable accessibilityRole={accessory === "radio" ? "radio" : "button"} accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [...row, pressed && styles.pressed]}>{content}</Pressable>;
}

/** 24pt: an empty ring, or an ink disc with a check. */
export function Radio({ selected }: { selected: boolean }) {
  const { theme } = useUnistyles();
  return <View style={[styles.radio, selected ? styles.radioOn : styles.radioOff]}>
    {selected ? <Icon name="done" size={12} tone="accent-ink" lit /> : null}
  </View>;
}

export interface SectionHeaderProps {
  title: string;
  /** How many, at the far right in the label's own size and color. */
  count?: string | number;
  /** Pink, the number too, only when something is waiting on you. */
  needsYou?: boolean;
  /** A mark before the label: Tracker's stage ring, in its stage's color. */
  leading?: ReactNode;
  /** Opens a system menu from the name, with a down caret: the sort on Jobs. */
  menu?: ReadonlyArray<MenuItem>;
  /** Makes the header the way into its group, with a chevron at the far
   * right after the count. */
  onPress?: () => void;
  /** The first thing under the title or chips: 16 above it. After a list
   * it's 36 (owner, 2026-11-08). */
  first?: boolean;
}

/** The name above a run of plain rows (New today, Earlier this week), with
 * its count at the far right in the same size and color (owner, 2026-11-08,
 * Paper "Section headers and counts · Nov 8", D). */
export function SectionHeader({ title, count, needsYou, leading, onPress, first, menu }: SectionHeaderProps) {
  const tone = needsYou ? "accent" : "ink";
  const label = count === undefined ? title : `${title}, ${count}`;
  const content = <>
    {leading ? <View style={styles.sectionLeading}>{leading}</View> : null}
    <View style={[styles.sectionLabel, menu && styles.sectionLabelCentered]}>
      {menu ? <View style={styles.sectionMenu}>
        <Menu items={menu}>
          <View style={styles.sectionMenuName} accessibilityRole="button" accessibilityLabel={`Sorted by ${title}`}>
            <Text role="section" tone={tone}>{title}</Text>
            <Icon name="down" size={12} tone={tone} />
          </View>
        </Menu>
      </View> : <Text role="section" tone={tone} flex>{title}</Text>}
      {count !== undefined ? <Text role="section" tone={tone}>{String(count)}</Text> : null}
      {onPress ? <View style={styles.sectionChevron}><Icon name="disclosure" size={13} tone="ink-3" /></View> : null}
    </View>
  </>;
  if (menu) return <View style={[styles.section, first && styles.sectionFirst]}>{content}</View>;
  if (!onPress) return <View style={[styles.section, first && styles.sectionFirst]} accessible accessibilityRole="header" accessibilityLabel={label}>{content}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    style={({ pressed }) => [styles.section, first && styles.sectionFirst, pressed && styles.sectionPressed]}>{content}</Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  // A menu's host has no baseline to line up with.
  sectionLabelCentered: { alignItems: "center" },
  sectionMenu: { flex: 1, alignItems: "flex-start" },
  sectionMenuName: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["1"] + 2 },
  // React Native pins a switch to the top of its row; iOS 26's shows it.
  switch: { alignSelf: "center" },
  group: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.space["4"] },
  header: { paddingHorizontal: theme.ui.space["4"] },
  headerRow: { flexDirection: "row", alignItems: "baseline", gap: theme.ui.space["2"] },
  // A settings card's label sits on the card's edge, 6 above it (Paper Alerts B).
  headerOnEdge: { paddingHorizontal: 0, marginBottom: -2 },
  footer: { paddingHorizontal: theme.ui.space["4"] },
  card: { borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-elev"], overflow: "hidden" },
  fill: { backgroundColor: theme.ui.color["bg-grouped"] },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: theme.ui.color.separator },
  gutter: { marginLeft: theme.ui.space["4"] },
  // A gray card's lines stop short of its right edge too, as Paper draws them.
  gutterEnd: { marginRight: theme.ui.space["4"] },
  leadingInset: { marginLeft: theme.ui.space["4"] + LEADING + theme.ui.space["3"] },
  row: {
    minHeight: theme.ui.size.listRow,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.ui.space["3"],
    paddingHorizontal: theme.ui.space["4"],
    paddingVertical: theme.ui.space["2"],
  },
  // Settings rows, and any row that leads with a tile, are 50 (B4).
  tall: { minHeight: 50 },
  pressed: { backgroundColor: theme.ui.color.fill },
  leading: { width: LEADING, alignItems: "center" },
  chevronRoom: { width: 12 },
  text: { flex: 1, minWidth: 0 },
  value: { flexShrink: 1, maxWidth: "60%" },
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
    paddingTop: 36,
    paddingBottom: theme.ui.space["2"],
  },
  sectionFirst: { paddingTop: theme.ui.space["4"] },
  // One width for every stage's mark, so the labels start on one line and
  // the ring's edge sits on the margin (its box has 2 of air each side).
  sectionLeading: { width: 20, marginLeft: -2, alignItems: "center" },
  sectionLabel: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: theme.ui.space["1"] },
  // Centred on the text rather than its baseline.
  sectionChevron: { alignSelf: "center" },
  sectionPressed: { opacity: 0.6 },
}));
