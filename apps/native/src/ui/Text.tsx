import type { UiTypeRole } from "@pinkslip/tokens/types";
import type { ReactNode } from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { faces, useUiFontsLoaded } from "./fonts";

export type TextRole = UiTypeRole;
/** `ink-4` is missing on purpose: it's for strokes and disabled marks, never text. */
export type TextTone = "ink" | "ink-2" | "ink-3" | "accent" | "accent-ink" | "badge-ink" | "good" | "bad" | "bg";
export type TextWeight = "regular" | "medium";

export interface TextProps extends Pick<RNTextProps, "accessibilityRole" | "accessibilityLabel" | "selectable" | "onPress" | "testID"> {
  role?: TextRole;
  tone?: TextTone;
  /** Text roles only; display roles are always Founders Grotesk Semibold. */
  weight?: TextWeight;
  lines?: number;
  align?: "left" | "center" | "right";
  /** Shrinks in a row instead of pushing its neighbours (a title beside an age). */
  flex?: boolean;
  children: ReactNode;
}

/** Text on Apple's text styles: Founders Grotesk for display, Untitled Sans for
 * text, the system font for tab labels. It scales with Dynamic Type. */
export function Text({ role = "body", tone = "ink", weight = "regular", lines, align, flex, children, ...rest }: TextProps) {
  const { theme } = useUnistyles();
  const fontsLoaded = useUiFontsLoaded();
  const type = theme.ui.type[role];
  const display = type.face === "display";
  const family = !fontsLoaded || type.face === "system" ? undefined
    : display ? faces.display : weight === "medium" ? faces.textMedium : faces.text;
  // The system font (and the fallback before the Klim files load) takes a weight.
  const fontWeight = family ? undefined : display ? "600" : weight === "medium" ? "500" : "400";
  return <RNText {...rest} numberOfLines={lines} maxFontSizeMultiplier={display ? 1.5 : 2}
    style={[styles.root(tone), {
      fontFamily: family, fontWeight, fontSize: type.size, lineHeight: type.line, letterSpacing: type.tracking,
    }, align && { textAlign: align }, flex && styles.flex]}>
    {children}
  </RNText>;
}

const styles = StyleSheet.create((theme) => ({
  root: (tone: TextTone) => ({ color: theme.ui.color[tone] }),
  flex: { flex: 1, minWidth: 0 },
}));
