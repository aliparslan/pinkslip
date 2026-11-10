import { Button, Host, HStack, Image, Menu, ScrollView, Text, Toggle } from "@expo/ui/swift-ui";
import { accessibilityHidden, accessibilityLabel, animation, Animation, background, buttonStyle, font, foregroundStyle, frame, menuActionDismissBehavior, padding, shapes } from "@expo/ui/swift-ui/modifiers";
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
 * React Native: a change is one transaction, in which the width, the push on
 * the chips beside it, the fill and the words move together.
 */
export function FilterChips({ chips, onClear }: { chips: readonly FilterChipSpec[]; onClear?: () => void }) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const { color, size, space, type } = theme.ui;
  // iOS keeps clipping a menu's label to its old size for about a second after
  // the menu closes, so a chip that says something new is a new chip. It
  // cross-fades in place and the row makes room. A menu that stays open can't
  // be replaced under the person using it.
  const look = (chip: FilterChipSpec) => `${chip.id}|${chip.label}|${chip.selected}`;
  const change = chips.map(look).join() + (onClear ? "|clear" : "");
  const spring = Animation.spring({ response: motion.list.move.response, dampingFraction: motion.list.move.damping });

  const face = (chip: FilterChipSpec) => <HStack spacing={space["1"] + 2} modifiers={[
    padding({ leading: space["4"], trailing: space["3"] }),
    frame({ height: size.chip - BORDER * 2 }),
    background(chip.selected ? color.ink : color.bg, shapes.capsule()),
    padding({ all: BORDER }),
    background(chip.selected ? color.ink : color.outline, shapes.capsule()),
    accessibilityLabel(chip.label),
  ]}>
    <Text modifiers={[font({ size: type.subhead.size }), foregroundStyle(chip.selected ? color.bg : color.ink)]}>{chip.label}</Text>
    {/* intentional: a Phosphor caret can't be drawn inside a native menu label without a new build; at this size iOS's chevron matches it. */}
    <Image systemName="chevron.down" size={CARET} color={chip.selected ? color.bg : color["ink-2"]} modifiers={[accessibilityHidden()]} />
  </HStack>;

  return <Host ignoreSafeArea="all" style={{ height: size.chip, marginVertical: space["2"] }}>
    <ScrollView axes="horizontal" showsIndicators={false}>
      <HStack spacing={space["2"]} modifiers={[padding({ horizontal: size.gutter }), ...(reduced ? [] : [animation(spring, numberFor(change))])]}>
        {chips.map((chip) => chip.choices
          ? <Menu key={chip.keepOpen ? chip.id : look(chip)} label={face(chip)} modifiers={chip.keepOpen ? [menuActionDismissBehavior("disabled")] : undefined}>
            {chip.choices.map((choice) => <Toggle key={choice.id} label={choice.title} isOn={choice.on} onIsOnChange={() => choice.onSelect()} />)}
          </Menu>
          : <Button key={look(chip)} onPress={chip.onPress} modifiers={[buttonStyle("plain")]}>{face(chip)}</Button>)}
        {onClear
          ? <Button key="clear" onPress={onClear} modifiers={[buttonStyle("plain")]}>
            <Text modifiers={[font({ size: type.subhead.size }), foregroundStyle(color["ink-3"]), padding({ horizontal: space["2"] })]}>Clear</Text>
          </Button>
          : null}
      </HStack>
    </ScrollView>
  </Host>;
}
