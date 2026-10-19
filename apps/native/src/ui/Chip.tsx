import { StyleSheet } from "react-native-unistyles";
import { PressableScale } from "../kit/PressableScale";
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

const styles = StyleSheet.create((theme) => ({
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
