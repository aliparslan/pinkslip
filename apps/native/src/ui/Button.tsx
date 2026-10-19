import type { ReactNode } from "react";
import { ActivityIndicator } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { PressableScale } from "../kit/PressableScale";
import { Icon, type IconName } from "./Icon";
import { Text, type TextTone } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "outline" | "plain" | "text";
export type ButtonSize = "large" | "small";

export interface ButtonProps {
  /** One pink button per screen: `primary` is the thing to do. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** The icon after the words, for ↗ (the button leaves Pinkslip): Paper's
   * Open application and Sign up. */
  iconAfter?: boolean;
  pending?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
  children: ReactNode;
}

const tones: Record<ButtonVariant, TextTone> = { primary: "accent-ink", secondary: "ink", outline: "accent", plain: "ink-2", text: "ink" };

/**
 * A capsule (docs/design-system.md, "Buttons"): `primary` is the pink with
 * white text, the one action a view exists for; `secondary` the gray fill
 * for everything else; `outline` a pink edge and label, for a pink action
 * that repeats down a list or sits in a card; `plain` the quiet way out in
 * ink-2 (Not now); `text` a tappable word in ink, like the other answer
 * under a primary (Discard changes). A disabled button turns gray, never
 * faded pink. Large is Apple's 50; small is 36.
 */
export function Button({ variant = "secondary", size = "large", icon, iconAfter, pending, disabled, fullWidth, accessibilityLabel, onPress, children }: ButtonProps) {
  const { theme } = useUnistyles();
  styles.useVariants({ variant, size });
  const tone: TextTone = disabled ? "ink-3" : tones[variant];
  const color = theme.ui.color[tone];
  const inactive = disabled || pending;
  return <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled: inactive, busy: pending }} disabled={inactive} onPress={onPress}
    style={fullWidth ? styles.full : styles.hug} contentStyle={[styles.root, disabled && variant !== "plain" && variant !== "text" && styles.disabled]}>
    {pending ? <ActivityIndicator size="small" color={color} />
      : icon && !iconAfter ? <Icon name={icon} size={size === "large" ? 20 : 16} tone={tone} /> : null}
    <Text role={size === "large" ? "body" : "subhead"} weight="medium" tone={tone} lines={1}>{children}</Text>
    {!pending && icon && iconAfter ? <Icon name={icon} size={size === "large" ? 20 : 16} tone={tone} /> : null}
  </PressableScale>;
}

const styles = StyleSheet.create((theme) => ({
  // No flexGrow: in a column it stretched the capsule down the whole screen.
  // A full-width button fills across through `full`, which stretches the press
  // area, and the capsule inside follows it.
  root: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.ui.space["2"],
    borderRadius: theme.ui.radius.full,
    variants: {
      variant: {
        primary: { backgroundColor: theme.ui.color["accent-fill"] },
        secondary: { backgroundColor: theme.ui.color.fill },
        outline: { borderWidth: 1.5, borderColor: theme.ui.color.accent },
        plain: {},
        text: {},
      },
      size: {
        large: { minHeight: theme.ui.size.button, paddingHorizontal: theme.ui.space["6"] },
        small: { minHeight: 36, paddingHorizontal: theme.ui.space["4"] },
      },
    },
  },
  full: { alignSelf: "stretch" },
  hug: { alignSelf: "flex-start" },
  disabled: { backgroundColor: theme.ui.color.fill, borderWidth: 0 },
}));
