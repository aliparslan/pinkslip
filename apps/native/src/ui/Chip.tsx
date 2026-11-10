import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { PressableScale, usePressScale } from "../kit/PressableScale";
import { Icon } from "./Icon";
import { motion, spring, timing } from "./motion";
import { useMotionTrial } from "./motion-trial";
import { Text } from "./Text";

export interface ChipProps {
  label: string;
  /** How many, after the label in ink-3 ("Applied 142"). */
  count?: number;
  selected?: boolean;
  /** `ink` filters what you see; `pink` is an answer saved to your search
   * (onboarding's questions). */
  tone?: "ink" | "pink";
  onPress?: () => void;
}

/** A 32pt capsule for filters, with an optional count after the label.
 * Selected is an ink fill with the background colour as text; pink never
 * means "on" for a filter. A chip that saves to your search is pink when on
 * (owner, 2026-10-19, Paper "Pink chips, refining E", 1): a pink line and
 * label, clear inside. Unselected is outlined, clear inside with a 1pt ring
 * (owner, 2026-10-15), so it reads the same on the page, on a card and in a
 * sheet. The label stays Regular either way, so a chip keeps its width
 * (owner, 2026-10-15). */
export function Chip({ label, count, selected = false, tone = "ink", onPress }: ChipProps) {
  const look = selected ? tone : "off";
  styles.useVariants({ look });
  const ink = look === "ink" ? "bg" : look === "pink" ? "accent" : "ink";
  return <PressableScale accessibilityRole="button" accessibilityLabel={count === undefined ? undefined : `${label}, ${count}`}
    accessibilityState={{ selected }} onPress={onPress} contentStyle={styles.root}>
    <Text role="subhead" tone={ink} lines={1}>{label}</Text>
    {count === undefined ? null : <Text role="subhead" tone={look === "off" ? "ink-3" : ink} lines={1}>{String(count)}</Text>}
  </PressableScale>;
}

const CARET = 12;
const CARET_GAP = 6;
const BORDER = 1;
/** Everything in a dropdown chip that isn't its words. */
const CHROME_LEFT = 16 + BORDER;
const CHROME_RIGHT = CARET_GAP + CARET + 12 + BORDER;

/** A chip making room moves like a row making room: the one spring. */
const GROW = spring(motion.list.move);
const FILL = timing({ duration: motion.list.fade, curve: [0.23, 1, 0.32, 1] });
// The old words are gone before the new ones show, so the two never read as one smear.
const WORDS_OUT = FadeOut.duration(80);
const WORDS_IN = FadeIn.duration(180).delay(70);
/** How long the drawn chip stands in after a change: past the spring and the fill. */
const SETTLE = 360;

export interface DropdownChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Puts what takes the tap inside a system menu. */
  menu?: (trigger: ReactNode) => ReactNode;
  /** The menu stays open while choices change, so its host can't be replaced. */
  staysOpen?: boolean;
}

/**
 * A chip that opens a choice (owner, 2026-11-09): when what it says changes it
 * grows or shrinks on the spring and pushes the chips beside it, its fill
 * comes up and its words cross-fade (Kit: "A picked chip grows").
 *
 * The chip is drawn apart from the menu. A system menu's trigger is hosted
 * in its own surface that can't follow a width changing every frame, so the
 * menu holds a layer laid over the top, at the chip's final size.
 *
 * iOS hides a menu's trigger while it's open and closes the glass back into
 * it, so a clear layer leaves the glass landing on the drawn chip and warping
 * its words (docs/chip-menu-glass-2026-11-09.md). At rest the layer is a real
 * copy of the chip and the drawn one is hidden; the drawn one only shows while
 * it's moving (Kit: "The menu lands on its chip"). The host keeps a stale width
 * and clips the copy square if it's only resized, so a new width gets a new
 * host. A menu that stays open can't lose its host, so it keeps the clear layer.
 */
export function DropdownChip({ label, selected = false, onPress, menu, staysOpen = false }: DropdownChipProps) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const trial = useMotionTrial("chipGrow");
  const moves = trial && !reduced;
  const lands = useMotionTrial("chipLand") && Boolean(menu) && !staysOpen;
  const press = usePressScale();
  const [words, setWords] = useState<{ label: string; width: number } | null>(null);
  const width = useSharedValue(0);
  const filled = useSharedValue(selected ? 1 : 0);
  // The look the menu's copy has caught up with. Both layers change in the
  // same render, so the copy can't show a frame of the new look too early.
  const [landed, setLanded] = useState("");
  const look = words ? `${words.label}|${selected}|${words.width}` : "";
  const copyShows = lands && look !== "" && look === landed;
  useEffect(() => {
    if (look === "" || look === landed) return;
    const timer = setTimeout(() => setLanded(look), SETTLE);
    return () => clearTimeout(timer);
  }, [look, landed]);
  useEffect(() => {
    filled.value = moves ? withTiming(selected ? 1 : 0, FILL) : selected ? 1 : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the prop
  }, [selected, moves]);
  const ink = theme.ui.color.ink;
  const outline = theme.ui.color.outline;
  const clear = `${ink.slice(0, 7)}00`;
  const size = useAnimatedStyle(() => ({ width: width.value }));
  const face = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(filled.value, [0, 1], [clear, ink]),
    borderColor: interpolateColor(filled.value, [0, 1], [outline, ink]),
  }), [clear, ink, outline]);
  const caretOff = useAnimatedStyle(() => ({ opacity: 1 - filled.value }));
  const caretOn = useAnimatedStyle(() => ({ opacity: filled.value }));
  const measured = (textWidth: number) => {
    const next = Math.ceil(textWidth);
    const chip = next + CHROME_LEFT + CHROME_RIGHT;
    width.value = words && moves ? withSpring(chip, GROW) : chip;
    setWords({ label, width: next });
  };
  const chipWidth = words ? words.width + CHROME_LEFT + CHROME_RIGHT : undefined;
  const trigger = <View style={[styles.dropdownTrigger, { width: chipWidth }]} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }}>
    {lands && words ? <View style={[styles.dropdownCopy, { width: chipWidth, opacity: copyShows ? 1 : 0 }]}>
      <View style={[styles.dropdownFace, selected ? styles.dropdownFaceOn : styles.dropdownFaceOff]} />
      <View style={[styles.dropdownWords, { width: words.width + 1 }]}>
        <Text role="subhead" tone={selected ? "bg" : "ink"} lines={1}>{words.label}</Text>
      </View>
      <View style={styles.dropdownCaret}>
        <Icon name="down" size={CARET} tone={selected ? "bg" : "ink-2"} />
      </View>
    </View> : null}
  </View>;
  return <Animated.View style={[styles.dropdown, words ? size : styles.dropdownFirst, !menu && press.style]}>
    {/* Sizes the chip until its words are measured. */}
    {words ? null : <Text role="subhead" tone={selected ? "bg" : "ink"} lines={1}>{label}</Text>}
    <View style={[styles.dropdownDrawn, { opacity: copyShows ? 0 : 1 }]} pointerEvents="none">
      <Animated.View style={[styles.dropdownFace, face]} />
      {words
        ? <Animated.View key={words.label} style={[styles.dropdownWords, { width: words.width + 1 }]} entering={moves ? WORDS_IN : undefined} exiting={moves ? WORDS_OUT : undefined}>
          <Text role="subhead" tone={selected ? "bg" : "ink"} lines={1}>{words.label}</Text>
        </Animated.View>
        : null}
      <View style={styles.dropdownCaret}>
        <Animated.View style={[styles.dropdownCaretLayer, caretOff]}><Icon name="down" size={CARET} tone="ink-2" /></Animated.View>
        <Animated.View style={[styles.dropdownCaretLayer, caretOn]}><Icon name="down" size={CARET} tone="bg" /></Animated.View>
      </View>
    </View>
    {/* Measures the words at full width, whatever the chip's width is just now. */}
    <View style={styles.dropdownMeasure} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View key={label} onLayout={(event) => measured(event.nativeEvent.layout.width)}>
        <Text role="subhead" lines={1}>{label}</Text>
      </View>
    </View>
    {words ? <View key={lands ? chipWidth : undefined} style={styles.dropdownTap}>
      {menu ? menu(trigger) : <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}
        accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} style={[styles.dropdownTrigger, { width: chipWidth }]} />}
    </View> : null}
  </Animated.View>;
}

/** Plain words at the end of a chip row: Clear. */
export function ChipAction({ label, onPress }: { label: string; onPress: () => void }) {
  return <Animated.View entering={WORDS_IN} exiting={WORDS_OUT}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
      <Text role="subhead" tone="ink-3">{label}</Text>
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create((theme) => ({
  dropdown: { height: theme.ui.size.chip, justifyContent: "center" },
  // Until the words are measured the chip sizes itself, so nothing jumps.
  dropdownFirst: { paddingLeft: CHROME_LEFT, paddingRight: CHROME_RIGHT },
  dropdownDrawn: { ...StyleSheet.absoluteFillObject, justifyContent: "center" },
  dropdownCopy: { position: "absolute", top: 0, left: 0, height: theme.ui.size.chip, justifyContent: "center" },
  dropdownFace: { ...StyleSheet.absoluteFillObject, borderRadius: theme.ui.radius.full, borderWidth: BORDER, borderCurve: "continuous" },
  dropdownFaceOff: { borderColor: theme.ui.color.outline },
  dropdownFaceOn: { backgroundColor: theme.ui.color.ink, borderColor: theme.ui.color.ink },
  dropdownWords: { position: "absolute", left: CHROME_LEFT },
  dropdownCaret: { position: "absolute", top: 0, bottom: 0, right: 12 + BORDER, width: CARET, justifyContent: "center" },
  dropdownCaretLayer: { position: "absolute" },
  dropdownMeasure: { position: "absolute", opacity: 0, width: 1000, flexDirection: "row" },
  dropdownTap: { position: "absolute", top: 0, left: 0 },
  dropdownTrigger: { height: theme.ui.size.chip },
  action: { height: theme.ui.size.chip, justifyContent: "center", paddingHorizontal: theme.ui.space["2"] },
  actionPressed: { opacity: 0.5 },
  root: {
    // A floor, not a fixed height, so the label isn't cut at large text sizes.
    minHeight: theme.ui.size.chip,
    paddingVertical: theme.ui.space["1"],
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.ui.space["4"],
    borderRadius: theme.ui.radius.full,
    borderWidth: 1,
    variants: {
      look: {
        ink: { backgroundColor: theme.ui.color.ink, borderColor: theme.ui.color.ink },
        pink: { backgroundColor: "transparent", borderColor: theme.ui.color.accent },
        off: { backgroundColor: "transparent", borderColor: theme.ui.color.outline },
      },
    },
  },
}));
