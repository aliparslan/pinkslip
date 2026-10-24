import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { Text as RNText, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion, withTiming } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { durations, easeOut } from "../kit/motion";
import { PressableScale } from "../kit/PressableScale";
import { haptics } from "../platform/haptics";
import { faces } from "./fonts";
import { Icon } from "./Icon";
import { SHEET_GROUP_RADIUS } from "./sheet-geometry";
import { Text, type TextTone } from "./Text";

/** How long the check stands in for the copy icon. */
const COPIED_MS = 1500;

const GLYPH = { duration: durations.instant, easing: easeOut };

/** The arriving glyph grows from 60% as it clears in (Motion lab #3, owner
 * 2026-10-24)... */
function glyphIn() {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
    animations: { opacity: withTiming(1, GLYPH), transform: [{ scale: withTiming(1, GLYPH) }] },
  };
}

/** ...as the leaving one shrinks to 60% and clears. */
function glyphOut() {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: { opacity: withTiming(0, GLYPH), transform: [{ scale: withTiming(0.6, GLYPH) }] },
  };
}

/** Copies `value`; `copied` is true for a moment after. */
export function useCopy(value: string) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = () => {
    void Clipboard.setStringAsync(value);
    haptics.tap();
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };
  return { copied, copy };
}

/** The copy mark, which turns into the check while `copied`: the two trade
 * places rather than swap (Motion lab #3). It stands in a box its own size;
 * appearing, it shows still. */
export function CopyGlyph({ copied, size, tone }: { copied: boolean; size: number; tone?: TextTone }) {
  const reduced = useReducedMotion();
  // Only a copy trades the glyphs; the mark appearing shows its icon still.
  const shown = useRef(false);
  useEffect(() => { shown.current = true; }, []);
  return <View style={[styles.glyphBox, { width: size, height: size }]}>
    <Animated.View key={copied ? "done" : "copy"} style={styles.glyph}
      entering={!shown.current ? undefined : reduced ? FadeIn.duration(durations.instant) : glyphIn}
      exiting={reduced ? FadeOut.duration(durations.instant) : glyphOut}>
      <Icon name={copied ? "done" : "copy"} size={size} tone={tone} />
    </Animated.View>
  </View>;
}

export interface CopyFieldProps {
  value: string;
  /** What shows, when it differs from what's copied (a code in groups of three). */
  text?: string;
  label: string;
  /** `line`: an address, the button to its right. `code`: a big code the
   * same way. `block`: a long value like a filter, the button in the top
   * right corner. */
  display?: "line" | "code" | "block";
}

/** A value to paste somewhere else, on a gray field with its copy button:
 * the two squares in a 36pt round button (owner, 2026-10-14), which turns
 * into a check for a moment once it's copied. Tapping the value copies too. */
export function CopyField({ value, text = value, label, display = "line" }: CopyFieldProps) {
  const { copied, copy } = useCopy(value);
  const block = display === "block";
  return <View style={[styles.field, block ? styles.block : styles.line]}>
    {block
      ? <Text role="footnote" tone="ink-2" selectable flex>{text}</Text>
      : <RNText onPress={copy} selectable maxFontSizeMultiplier={1.4} style={[styles.value, display === "code" && styles.code]}>{text}</RNText>}
    <PressableScale accessibilityRole="button" accessibilityLabel={copied ? `Copied ${label}` : `Copy ${label}`}
      onPress={copy} scale={0.9} hitSlop={4} contentStyle={styles.button}>
      <CopyGlyph copied={copied} size={20} />
    </PressableScale>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  button: {
    width: 36,
    height: 36,
    borderRadius: theme.ui.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ui.color.fill,
  },
  // Both glyphs stand in the box's middle while they trade places.
  glyphBox: { alignItems: "center", justifyContent: "center" },
  glyph: { position: "absolute" },
  field: {
    flexDirection: "row",
    gap: theme.ui.space["3"],
    borderRadius: SHEET_GROUP_RADIUS,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color["sheet-group"],
  },
  // The button sits 10 in from the field's edges, centred on a one-line value.
  line: { alignItems: "center", minHeight: 56, paddingLeft: theme.ui.space["4"], paddingRight: 10, paddingVertical: 10 },
  block: { alignItems: "flex-start", padding: theme.ui.space["4"], paddingTop: 10, paddingRight: 10 },
  // An address or a code is set in Founders like a ticket's facts; both sit
  // outside the type scale, as the date tile does.
  value: { flex: 1, fontFamily: faces.display, fontSize: 17, lineHeight: 22, color: theme.ui.color.ink },
  code: { fontSize: 40, lineHeight: 44, letterSpacing: 2.4 },
}));
