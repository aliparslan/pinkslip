import { Button, Host, HStack, Image, Menu, ScrollView, Text, Toggle } from "@expo/ui/swift-ui";
import { accessibilityHidden, accessibilityLabel, animation, Animation, background, buttonStyle, contentTransition, fixedSize, font, foregroundStyle, frame, menuActionDismissBehavior, padding, shapes } from "@expo/ui/swift-ui/modifiers";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";
import { motion } from "./motion";

export interface FilterChoice {
  id: string;
  title: string;
  on: boolean;
  onSelect: () => void;
}

export interface FilterChipSpec {
  id: string;
  label: string;
  selected: boolean;
  /** Opens a system menu of these. */
  choices?: readonly FilterChoice[];
  /** The menu stays open after a choice, for picking several. */
  keepOpen?: boolean;
  /** Or a tap does this, for lists too long for a menu. */
  onPress?: () => void;
}

const BORDER = 1;
const CARET = 12;

/** iOS reports a pick while its glass is still closing; this is what's left of that. */
const MENU_CLOSES = 320;

const looksOf = (chips: readonly FilterChipSpec[]) => Object.fromEntries(chips.map((chip) => [chip.id, { label: chip.label, selected: chip.selected }]));

/** SwiftUI watches a number, so any change to the row has to change it. */
function numberFor(text: string) {
  let number = 0;
  for (let index = 0; index < text.length; index += 1) number = (number * 31 + text.charCodeAt(index)) | 0;
  return number;
}

/**
 * The row of dropdown chips under Jobs' search, drawn by iOS as one SwiftUI
 * row. iOS grows a menu out of its label and closes it back in, and that only
 * looks right when the label is really its own, so nothing here is drawn by
 * React Native.
 *
 * One rule for every change: the colors and the words flip at once, and only
 * the width moves, pushing the chips beside it. Fading them instead overlaps
 * two words and passes through a gray where neither reads. SwiftUI animates
 * everything in a change, so the colors go first, unanimated, and the words
 * and widths follow on the spring two frames later.
 */
export function FilterChips({ chips, onClear }: { chips: readonly FilterChipSpec[]; onClear?: () => void }) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const { color, size, space, type } = theme.ui;
  const now = chips.map((chip) => `${chip.id}|${chip.label}|${chip.selected}`).join() + (onClear ? "|clear" : "");
  const [colors, setColors] = useState({ looks: looksOf(chips), picks: {} as Readonly<Record<string, number>> });
  const [words, setWords] = useState({ now, looks: looksOf(chips), clear: Boolean(onClear) });
  const picked = useRef<string | null>(null);
  useEffect(() => {
    if (now === words.now) return;
    const looks = looksOf(chips);
    const clear = Boolean(onClear);
    const chip = picked.current;
    picked.current = null;
    let frame = 0;
    const play = () => {
      // iOS keeps clipping a menu's label to its old size for about a second
      // after the menu closes, so a pick makes that chip a new one. Only a
      // pick: Clear moves the chips it has.
      setColors((shown) => ({ looks, picks: chip ? { ...shown.picks, [chip]: (shown.picks[chip] ?? 0) + 1 } : shown.picks }));
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setWords({ now, looks, clear }));
      });
    };
    // The glass lands on the chip it left, as iOS's own do, and then it changes.
    const timer = chip ? setTimeout(play, MENU_CLOSES) : undefined;
    if (!chip) play();
    return () => {
      if (timer) clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` stands for the chips and Clear
  }, [now, words.now]);
  const pick = (chip: FilterChipSpec, choice: FilterChoice) => {
    // A menu that stays open has no glass to wait for, and can't lose its chip.
    if (!choice.on && !chip.keepOpen) picked.current = chip.id;
    choice.onSelect();
  };
  const spring = Animation.spring({ response: motion.list.move.response, dampingFraction: motion.list.move.damping });

  const face = (chip: FilterChipSpec) => {
    const selected = colors.looks[chip.id]?.selected ?? chip.selected;
    return <HStack spacing={space["1"] + 2} modifiers={[
    // A row wider than the screen scrolls; left alone, iOS squeezes a chip instead.
    fixedSize({ horizontal: true, vertical: false }),
    padding({ leading: space["4"], trailing: space["3"] }),
    frame({ height: size.chip - BORDER * 2 }),
    background(selected ? color.ink : color.bg, shapes.capsule()),
    padding({ all: BORDER }),
    background(selected ? color.ink : color.outline, shapes.capsule()),
    accessibilityLabel(chip.label),
  ]}>
    <Text modifiers={[font({ size: type.subhead.size }), foregroundStyle(selected ? color.bg : color.ink), contentTransition("identity")]}>{words.looks[chip.id]?.label ?? chip.label}</Text>
    {/* intentional: a Phosphor caret can't be drawn inside a native menu label without a new build; at this size iOS's chevron matches it. */}
    <Image systemName="chevron.down" size={CARET} color={selected ? color.bg : color["ink-2"]} modifiers={[accessibilityHidden()]} />
  </HStack>;
  };

  return <Host ignoreSafeArea="all" style={{ height: size.chip, marginVertical: space["2"] }}>
    <ScrollView axes="horizontal" showsIndicators={false}>
      <HStack spacing={space["2"]} modifiers={[padding({ horizontal: size.gutter }), ...(reduced ? [] : [animation(spring, numberFor(words.now))])]}>
        {chips.map((chip) => chip.choices
          ? <Menu key={`${chip.id}|${colors.picks[chip.id] ?? 0}`} label={face(chip)} modifiers={chip.keepOpen ? [menuActionDismissBehavior("disabled")] : undefined}>
            {chip.choices.map((choice) => <Toggle key={choice.id} label={choice.title} isOn={choice.on} onIsOnChange={() => pick(chip, choice)} />)}
          </Menu>
          : <Button key={chip.id} onPress={chip.onPress} modifiers={[buttonStyle("plain")]}>{face(chip)}</Button>)}
        {words.clear
          ? <Button key="clear" onPress={() => onClear?.()} modifiers={[buttonStyle("plain")]}>
            <Text modifiers={[font({ size: type.subhead.size }), foregroundStyle(color["ink-3"]), padding({ horizontal: space["2"] })]}>Clear</Text>
          </Button>
          : null}
      </HStack>
    </ScrollView>
  </Host>;
}
