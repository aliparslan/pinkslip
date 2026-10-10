import { Check } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "./Text";

/** A labelled checkbox row; the whole row toggles. */
export function Checkbox({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  const { theme } = useUnistyles();
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled}
    onPress={() => onCheckedChange(!checked)} style={styles.row}>
    <View style={[styles.box, checked && styles.on]}>
      {checked ? <Check size={14} weight="bold" color={theme.colors["accent-ink"]} /> : null}
    </View>
    <Text>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: "row", alignItems: "center", gap: theme.space["3"], minHeight: theme.sizing["tap-min"] },
  box: {
    width: 22, height: 22, borderRadius: theme.radius.xs, borderWidth: 1.5,
    borderColor: theme.colors["control-border"], alignItems: "center", justifyContent: "center",
  },
  on: { backgroundColor: theme.colors["accent-fill"], borderColor: theme.colors["accent-fill"] },
}));
