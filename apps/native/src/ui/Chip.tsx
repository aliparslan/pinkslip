import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { PressableScale } from "../kit/PressableScale";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface ChipProps {
  label: string;
  /** How many, after the label in ink-3 ("Applied 142"). */
  count?: number;
  selected?: boolean;
  /** `ink` filters what you see; `pink` is an answer saved to your search
   * (onboarding's questions). */
  tone?: "ink" | "pink";
  /** A down caret after the label: the chip opens a choice. */
  caret?: boolean;
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
export function Chip({ label, count, selected = false, tone = "ink", caret = false, onPress }: ChipProps) {
  const look = selected ? tone : "off";
  styles.useVariants({ look });
  const ink = look === "ink" ? "bg" : look === "pink" ? "accent" : "ink";
  return <PressableScale accessibilityRole="button" accessibilityLabel={count === undefined ? undefined : `${label}, ${count}`}
    accessibilityState={{ selected }} onPress={onPress} contentStyle={[styles.root, caret && styles.withCaret]}>
    <Text role="subhead" tone={ink} lines={1}>{label}</Text>
    {count === undefined ? null : <Text role="subhead" tone={look === "off" ? "ink-3" : ink} lines={1}>{String(count)}</Text>}
    {caret ? <Icon name="down" size={12} tone={look === "off" ? "ink-2" : ink} /> : null}
  </PressableScale>;
}

/** A dropdown chip's look with no press of its own, as the trigger inside a
 * system menu, which takes the tap. */
export function ChipFace({ label, selected = false }: { label: string; selected?: boolean }) {
  const look = selected ? "ink" : "off";
  styles.useVariants({ look });
  return <View accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} style={[styles.root, styles.withCaret]}>
    <Text role="subhead" tone={selected ? "bg" : "ink"} lines={1}>{label}</Text>
    <Icon name="down" size={12} tone={selected ? "bg" : "ink-2"} />
  </View>;
}

/** Plain words at the end of a chip row: Clear. */
export function ChipAction({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
    <Text role="subhead" tone="ink-3">{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  withCaret: { paddingRight: theme.ui.space["3"] },
  action: { height: theme.ui.size.chip, justifyContent: "center", paddingHorizontal: theme.ui.space["2"] },
  actionPressed: { opacity: 0.5 },
  root: {
    height: theme.ui.size.chip,
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
