import type { ReactNode } from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type TextSize = "2xs" | "xs" | "sm" | "md" | "lg";
export type TextTone = "ink" | "ink-2" | "ink-3" | "ink-4" | "accent" | "good" | "warn" | "bad";
export type TextWeight = "regular" | "medium" | "semibold";

export interface TextProps extends Pick<RNTextProps, "accessibilityRole" | "selectable" | "onPress" | "testID"> {
  size?: TextSize;
  tone?: TextTone;
  weight?: TextWeight;
  /** One line with an ellipsis (the web kit's `truncate`). */
  truncate?: boolean;
  lines?: number;
  align?: "left" | "center";
  children: ReactNode;
}

const weights = { regular: "400", medium: "500", semibold: "600" } as const;

/** Body text on the ink ramp, the same size/tone/weight vocabulary as the web
 * kit. Scales with Dynamic Type. */
export function Text({ size = "md", tone = "ink", weight = "regular", truncate, lines, align, children, ...rest }: TextProps) {
  styles.useVariants({ size });
  return <RNText {...rest} numberOfLines={truncate ? 1 : lines} maxFontSizeMultiplier={2}
    style={[styles.root, styles.tone(tone), { fontWeight: weights[weight] }, align && { textAlign: align }]}>
    {children}
  </RNText>;
}

const styles = StyleSheet.create((theme) => ({
  root: {
    color: theme.colors.ink,
    variants: {
      size: {
        "2xs": { fontSize: theme.fontSize["2xs"], lineHeight: 16 },
        xs: { fontSize: theme.fontSize.xs, lineHeight: 18 },
        sm: { fontSize: theme.fontSize.sm, lineHeight: 20 },
        md: { fontSize: theme.fontSize.md, lineHeight: 23 },
        lg: { fontSize: theme.fontSize.lg, lineHeight: 25 },
      },
    },
  },
  tone: (tone: TextTone) => ({ color: theme.colors[tone] }),
}));
