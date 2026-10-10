import { Switch as RNSwitch } from "react-native";
import { useUnistyles } from "react-native-unistyles";

/** The system switch with the accent track. */
export function Switch({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  const { theme } = useUnistyles();
  return <RNSwitch value={checked} onValueChange={onCheckedChange} disabled={disabled} accessibilityLabel={label}
    trackColor={{ true: theme.colors["accent-fill"], false: theme.colors["control-selected-bg"] }} />;
}
