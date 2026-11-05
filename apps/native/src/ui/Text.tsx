import type { UiTypeRole } from "@pinkslip/tokens/types";
import type { ReactNode } from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { face } from "./fonts";

export type TextRole = UiTypeRole;

/** An apostrophe between letters, as Apple sets it: "don’t", not "don't".
 * Only the words on screen change; what a field holds, or what's sent, keeps
 * whatever was typed. */
export function typeset(text: string): string {
  return text.replace(/([A-Za-z\u00C0-\u024F])'(?=[A-Za-z\u00C0-\u024F])/g, "$1\u2019");
}

const setChildren = (node: ReactNode): ReactNode =>
  typeof node === "string" ? typeset(node) : Array.isArray(node) ? node.map(setChildren) : node;

/** `ink-4` is missing on purpose: it's for strokes and disabled marks, never text. */
export type TextTone = "ink" | "ink-2" | "ink-3" | "accent" | "accent-ink" | "good" | "bad" | "bg";
export type TextWeight = "regular" | "medium";

export interface TextProps extends Pick<RNTextProps, "accessibilityRole" | "accessibilityLabel" | "selectable" | "onPress" | "testID"> {
  role?: TextRole;
  tone?: TextTone;
  /** Text roles only; display roles are always the display face's semibold. */
  weight?: TextWeight;
  lines?: number;
  align?: "left" | "center" | "right";
  /** Shrinks in a row instead of pushing its neighbours (a title beside an age). */
  flex?: boolean;
  children: ReactNode;
}

/** Text on Apple's text styles in the app's faces (SF for now, ui/fonts.ts),
 * the system font for tab labels. It scales with Dynamic Type, breaks lines
 * as UIKit's labels do (no word left alone on the last line), and curls
 * apostrophes. */
export function Text({ role = "body", tone = "ink", weight = "regular", lines, align, flex, children, ...rest }: TextProps) {
  const { theme } = useUnistyles();
  const type = theme.ui.type[role];
  const display = type.face === "display";
  // Each role's face (ui/fonts.ts: SF for now); tab labels are always the system font.
  const { fontFamily: family, fontWeight } = type.face === "system"
    ? { fontFamily: undefined, fontWeight: weight === "medium" ? "500" as const : "400" as const }
    : display ? face.display : weight === "medium" ? face.textMedium : face.text;
  return <RNText {...rest} numberOfLines={lines} maxFontSizeMultiplier={display ? 1.5 : 2} lineBreakStrategyIOS="standard"
    style={[styles.root(tone), {
      fontFamily: family, fontWeight, fontSize: type.size, lineHeight: type.line, letterSpacing: type.tracking,
    }, align && { textAlign: align }, flex && styles.flex]}>
    {setChildren(children)}
  </RNText>;
}

const styles = StyleSheet.create((theme) => ({
  root: (tone: TextTone) => ({ color: theme.ui.color[tone] }),
  flex: { flex: 1, minWidth: 0 },
}));
