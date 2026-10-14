import { StyleSheet } from "react-native-unistyles";
import { PressableScale } from "../kit/PressableScale";
import { Text } from "./Text";

export interface ChipProps {
  label: string;
  /** How many, after the label in ink-3 ("Applied 142"). */
  count?: number;
  selected?: boolean;
  onPress?: () => void;
}

/** A 32pt capsule for filters, with an optional count after the label.
 * Selected is an ink fill with the background colour as text; pink never
 * means "on". */
export function Chip({ label, count, selected = false, onPress }: ChipProps) {
  styles.useVariants({ selected });
  return <PressableScale accessibilityRole="button" accessibilityLabel={count === undefined ? undefined : `${label}, ${count}`}
    accessibilityState={{ selected }} onPress={onPress} contentStyle={styles.root}>
    <Text role="subhead" weight={selected ? "medium" : "regular"} tone={selected ? "bg" : "ink"} lines={1}>{label}</Text>
    {count === undefined ? null : <Text role="subhead" tone={selected ? "bg" : "ink-3"} lines={1}>{String(count)}</Text>}
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
    variants: {
      selected: {
        true: { backgroundColor: theme.ui.color.ink },
        false: { backgroundColor: theme.ui.color.fill },
      },
    },
  },
}));
