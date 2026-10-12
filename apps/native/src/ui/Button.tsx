import type { Icon as PhosphorIcon } from "phosphor-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { PressableScale } from "../kit/PressableScale";
import { Text, type TextTone } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "plain";
export type ButtonSize = "large" | "small";

export interface ButtonProps {
  /** One pink button per screen: `primary` is the thing to do. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: PhosphorIcon;
  pending?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
  children: ReactNode;
}

const tones: Record<ButtonVariant, TextTone> = { primary: "accent-ink", secondary: "ink", plain: "ink-2" };

/** A capsule: `primary` is the pastel pink with dark text, `secondary` the grey
 * fill, `plain` a text button (Not now). Large is Apple's 50; small is 36. */
export function Button({ variant = "secondary", size = "large", icon: Glyph, pending, disabled, fullWidth, accessibilityLabel, onPress, children }: ButtonProps) {
  const { theme } = useUnistyles();
  styles.useVariants({ variant, size });
  const tone = tones[variant];
  const color = theme.ui.color[tone];
  const inactive = disabled || pending;
  return <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled: inactive, busy: pending }} disabled={inactive} onPress={onPress}
    style={fullWidth ? styles.full : styles.hug} contentStyle={[styles.root, disabled && styles.disabled]}>
    {pending ? <ActivityIndicator size="small" color={color} />
      : Glyph ? <Glyph size={size === "large" ? 18 : 16} weight="bold" color={color} /> : null}
    <Text role={size === "large" ? "body" : "subhead"} weight="medium" tone={tone} lines={1}>{children}</Text>
  </PressableScale>;
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.ui.space["2"],
    borderRadius: theme.ui.radius.full,
    variants: {
      variant: {
        primary: { backgroundColor: theme.ui.color["accent-fill"] },
        secondary: { backgroundColor: theme.ui.color.fill },
        plain: {},
      },
      size: {
        large: { minHeight: theme.ui.size.button, paddingHorizontal: theme.ui.space["6"] },
        small: { minHeight: 36, paddingHorizontal: theme.ui.space["4"] },
      },
    },
  },
  full: { alignSelf: "stretch" },
  hug: { alignSelf: "flex-start" },
  disabled: { opacity: 0.4 },
}));
