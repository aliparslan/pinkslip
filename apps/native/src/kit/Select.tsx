import { CaretUpDown } from "phosphor-react-native";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Menu } from "./Menu";
import { Text } from "./Text";

export interface SelectOption<Value extends string> { value: Value; label: string }

/** A field-shaped button that opens the system menu of options, checked on
 * the current one (the web kit's native `<select>`). */
export function Select<Value extends string>({ label, value, options, placeholder = "Choose", onValueChange, disabled }: {
  label: string;
  value: Value | "" | undefined;
  options: ReadonlyArray<SelectOption<Value>>;
  placeholder?: string;
  onValueChange: (value: Value) => void;
  disabled?: boolean;
}) {
  const { theme } = useUnistyles();
  const current = options.find((option) => option.value === value);
  return <Menu fill title={label} items={options.map((option) => ({
    id: option.value, title: option.label, icon: option.value === value ? "checkmark" : undefined, disabled, onSelect: () => onValueChange(option.value),
  }))}>
    <View style={styles.field} accessibilityRole="button" accessibilityLabel={`${label}, ${current?.label ?? placeholder}`}>
      <View style={styles.value}><Text tone={current ? "ink" : "ink-4"} truncate>{current?.label ?? placeholder}</Text></View>
      <CaretUpDown size={16} color={theme.colors["ink-3"]} />
    </View>
  </Menu>;
}

const styles = StyleSheet.create((theme) => ({
  field: {
    flexDirection: "row", alignItems: "center", gap: theme.space["2"], minHeight: theme.sizing["control-height"],
    paddingHorizontal: theme.space["4"], borderRadius: theme.radius.md, borderCurve: "continuous", borderWidth: 1,
    borderColor: theme.colors["control-border"], backgroundColor: theme.colors["input-bg"],
  },
  value: { flex: 1 },
}));
