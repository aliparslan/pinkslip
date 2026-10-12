import { StyleSheet } from "react-native-unistyles";
import { PressableScale } from "../kit/PressableScale";
import { Text } from "./Text";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

/** A 32pt capsule for filters. Selected is an ink fill with the background
 * colour as text; pink never means "on". */
export function Chip({ label, selected = false, onPress }: ChipProps) {
  styles.useVariants({ selected });
  return <PressableScale accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} contentStyle={styles.root}>
    <Text role="subhead" weight={selected ? "medium" : "regular"} tone={selected ? "bg" : "ink"} lines={1}>{label}</Text>
  </PressableScale>;
}

const styles = StyleSheet.create((theme) => ({
  root: {
    height: theme.ui.size.chip,
    justifyContent: "center",
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
