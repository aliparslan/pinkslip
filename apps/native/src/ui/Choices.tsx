import { Children, Fragment, type ReactNode } from "react";
import { Pressable, Switch, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Grain } from "./Grain";
import { Radio } from "./List";
import { Text } from "./Text";

/** A paper card of choices (the ticket's stock: grain, a slight lift),
 * with a printed rule between rows. */
export function Choices({ children }: { children: ReactNode }) {
  const { theme } = useUnistyles();
  const rows = Children.toArray(children);
  return <View style={styles.card}>
    <Grain radius={theme.ui.radius.lg} />
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
}

/** A row to pick: title on the left, the round check on the right. */
export function Choice({ title, detail, selected, onPress, multiple = false }: ChoiceProps) {
  return <Pressable onPress={onPress} accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityState={{ checked: selected }}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.text}>
      <Text weight="medium">{title}</Text>
      {detail ? <Text role="footnote" tone="ink-3">{detail}</Text> : null}
    </View>
    <Radio selected={selected} />
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
    borderRadius: theme.ui.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color["bg-grouped"],
    boxShadow: theme.ui.shadow.card,
  },
  rule: { height: 1, backgroundColor: theme.ui.color.separator },
  row: { minHeight: theme.ui.size.listRow + 12, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["3"] },
  text: { flex: 1, gap: 2 },
  pressed: { opacity: 0.6 },
}));
