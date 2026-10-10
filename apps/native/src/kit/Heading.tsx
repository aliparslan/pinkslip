import type { ReactNode } from "react";
import { Text as RNText } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type HeadingVariant = "display-lg" | "display-md" | "display-sm" | "section";

/** In-content headings. Screen titles are the native navigation bar's
 * (large titles on root screens), so there is no root/screen variant here. */
export function Heading({ variant = "section", children, lines }: { variant?: HeadingVariant; children: ReactNode; lines?: number }) {
  styles.useVariants({ variant });
  return <RNText accessibilityRole="header" numberOfLines={lines} maxFontSizeMultiplier={1.8} style={styles.root}>{children}</RNText>;
}

const styles = StyleSheet.create((theme) => ({
  root: {
    color: theme.colors.ink,
    fontWeight: "600",
    variants: {
      variant: {
        "display-lg": { fontSize: theme.fontSize["4xl"], lineHeight: 36, letterSpacing: -0.6 },
        "display-md": { fontSize: theme.fontSize["2xl"], lineHeight: 28, letterSpacing: -0.3 },
        "display-sm": { fontSize: theme.fontSize.xl, lineHeight: 26, letterSpacing: -0.2 },
        section: { fontSize: theme.fontSize.md, lineHeight: 22, color: theme.colors["ink-2"] },
      },
    },
  },
}));
