import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Text } from "./Text";

export interface ToggleOption<Value extends string> { value: Value; label: string; disabled?: boolean }

function Chip({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}>
    <Text size="sm" weight="medium" tone={selected ? "ink" : "ink-2"}>{label}</Text>
  </Pressable>;
}

/** Single-choice chips; pressing the chosen one again clears it when
 * `onClear` is given (the web kit's ToggleGroup). */
export function ToggleGroup<Value extends string>({ label, options, value, onValueChange, onClear }: {
  label: string;
  options: ReadonlyArray<ToggleOption<Value>>;
  value: Value | undefined;
  onValueChange: (value: Value) => void;
  onClear?: () => void;
}) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
    {options.map((option) => <Chip key={option.value} label={option.label} disabled={option.disabled} selected={option.value === value}
      onPress={() => (option.value === value ? onClear?.() : onValueChange(option.value))} />)}
  </View>;
}

/** Multiple-choice chips, keeping at least `min` selected. */
export function MultiToggleGroup<Value extends string>({ label, options, value, onValueChange, min = 0 }: {
  label: string;
  options: ReadonlyArray<ToggleOption<Value>>;
  value: readonly Value[];
  onValueChange: (value: Value[]) => void;
  min?: number;
}) {
  return <View accessibilityLabel={label} style={styles.group}>
    {options.map((option) => {
      const selected = value.includes(option.value);
      return <Chip key={option.value} label={option.label} selected={selected} disabled={option.disabled || (selected && value.length <= min)}
        onPress={() => onValueChange(selected ? value.filter((item) => item !== option.value) : [...value, option.value])} />;
    })}
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  group: { flexDirection: "row", flexWrap: "wrap", gap: theme.space["2"] },
  chip: {
    minHeight: theme.sizing["pill-height"] + 4,
    paddingHorizontal: theme.space["4"],
    justifyContent: "center",
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors["control-border"],
    backgroundColor: theme.colors["control-bg"],
  },
  selected: { backgroundColor: theme.colors["control-selected-bg"], borderColor: theme.colors["control-selected-border"] },
  pressed: { opacity: 0.7 },
}));
