import type { Icon as PhosphorIcon } from "phosphor-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator, Text as RNText } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { PressableScale } from "./PressableScale";

export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "default" | "compact";

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: PhosphorIcon;
  /** Draws the icon filled (a toggle that's on, e.g. Saved). */
  iconFill?: boolean;
  /** Shows a spinner in place of the icon and blocks presses. */
  pending?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
  children: ReactNode;
}

const ink = { primary: "accent-ink", secondary: "ink", danger: "bad" } as const;

/** The web kit's Button: primary (pink), secondary (control surface), and
 * danger (red text on the control surface, as iOS draws destructive actions).
 * It shrinks to 97% while pressed, as the web button does. */
export function Button({ variant = "secondary", size = "default", icon: Glyph, iconFill, pending, disabled, fullWidth, accessibilityLabel, onPress, children }: ButtonProps) {
  const { theme } = useUnistyles();
  // "default" is reserved in Unistyles variants, so the style uses "regular".
  styles.useVariants({ variant, size: size === "compact" ? "compact" : "regular" });
  const color = theme.colors[ink[variant]];
  const inactive = disabled || pending;
  return <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled: inactive, busy: pending }} disabled={inactive} onPress={onPress}
    style={fullWidth && styles.full} contentStyle={[styles.root, disabled && styles.disabled]}>
    {pending ? <ActivityIndicator size="small" color={color} />
      : Glyph ? <Glyph size={size === "compact" ? 16 : 18} weight={iconFill ? "fill" : "bold"} color={color} /> : null}
    <RNText style={[styles.label, { color }]} maxFontSizeMultiplier={1.6} numberOfLines={1}>{children}</RNText>
  </PressableScale>;
}

const styles = StyleSheet.create((theme) => ({
  root: {
    // Fills the touch target when a row stretches it.
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space["2"],
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    variants: {
      variant: {
        primary: { backgroundColor: theme.colors["accent-fill"] },
        secondary: { backgroundColor: theme.colors["control-bg"], borderWidth: 1, borderColor: theme.colors["control-border"] },
        danger: { backgroundColor: theme.colors["control-bg"], borderWidth: 1, borderColor: theme.colors["control-border"] },
      },
      size: {
        regular: { minHeight: theme.sizing["control-height"], paddingHorizontal: theme.space["5"] },
        compact: { minHeight: theme.sizing["control-height-compact"], paddingHorizontal: theme.space["4"] },
      },
    },
  },
  label: {
    fontWeight: "600",
    variants: {
      size: { regular: { fontSize: theme.fontSize.md }, compact: { fontSize: theme.fontSize.sm } },
    },
  },
  full: { alignSelf: "stretch" },
  disabled: { opacity: 0.45 },
}));
