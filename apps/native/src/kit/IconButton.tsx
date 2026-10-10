import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { IconSize } from "./Icon";

export interface IconButtonProps {
  icon: PhosphorIcon;
  /** Required: the button has no visible text. */
  label: string;
  size?: "sm" | "default";
  iconSize?: IconSize;
  /** Toggle buttons (save): accent color and a filled icon when on. */
  pressed?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

/** A 44pt tap target around one icon. */
export function IconButton({ icon: Glyph, label, size = "default", iconSize, pressed, disabled, onPress }: IconButtonProps) {
  const { theme } = useUnistyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: pressed }}
    disabled={disabled} onPress={onPress} hitSlop={size === "sm" ? 6 : 0}
    style={({ pressed: down }) => [styles.root, size === "sm" && styles.small, down && styles.down, disabled && styles.disabled]}>
    <Glyph size={iconSize ?? (size === "sm" ? 18 : 22)} weight={pressed ? "fill" : "regular"}
      color={pressed ? theme.colors.accent : theme.colors["ink-2"]} />
  </Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  root: {
    width: theme.sizing["tap-min"],
    height: theme.sizing["tap-min"],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  small: { width: theme.sizing["control-height-small"], height: theme.sizing["control-height-small"] },
  down: { backgroundColor: theme.colors["control-bg"] },
  disabled: { opacity: 0.4 },
}));
