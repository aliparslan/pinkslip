import { CaretRight, type Icon as PhosphorIcon } from "phosphor-react-native";
import { Children, Fragment, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "./Text";

/** A grouped, inset list surface (You's settings groups), with an optional
 * small label above it. Rows are separated by hairlines. */
export function ListSection({ label, children }: { label?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return <View style={styles.section}>
    {label ? <Text size="xs" weight="semibold" tone="ink-4">{label}</Text> : null}
    <View style={styles.surface}>
      {rows.map((row, index) => <Fragment key={index}>{index > 0 && <View style={styles.separator} />}{row}</Fragment>)}
    </View>
  </View>;
}

export interface ListRowProps {
  title: string;
  detail?: string;
  icon?: PhosphorIcon;
  /** Defaults to a chevron when the row navigates. */
  accessory?: ReactNode;
  destructive?: boolean;
  onPress?: () => void;
}

/** One row: icon, title over a one-line detail, trailing accessory. */
export function ListRow({ title, detail, icon: Glyph, accessory, destructive, onPress }: ListRowProps) {
  const { theme } = useUnistyles();
  const content = <>
    {Glyph ? <Glyph size={20} color={destructive ? theme.colors.bad : theme.colors["ink-2"]} /> : null}
    <View style={styles.copy}>
      <Text weight="medium" tone={destructive ? "bad" : "ink"}>{title}</Text>
      {detail ? <Text size="sm" tone="ink-3" truncate>{detail}</Text> : null}
    </View>
    {accessory ?? (onPress ? <CaretRight size={16} weight="bold" color={theme.colors["ink-4"]} /> : null)}
  </>;
  return onPress
    ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{content}</Pressable>
    : <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create((theme) => ({
  section: { gap: theme.space["2"] },
  surface: {
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors["bg-elev"],
    overflow: "hidden",
  },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: theme.space["4"], backgroundColor: theme.colors.line },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["3"],
    minHeight: theme.sizing["control-height"] + 4,
    paddingHorizontal: theme.space["4"],
    paddingVertical: theme.space["3"],
  },
  copy: { flex: 1, gap: 2 },
  pressed: { backgroundColor: theme.colors["control-bg"] },
}));
