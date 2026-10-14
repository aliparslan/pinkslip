import { Text as RNText, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { faces } from "./fonts";
import { Icon } from "./Icon";

export interface DateTileProps {
  /** "OCT". */
  month: string;
  /** "15". */
  day: string;
}

/** A day in the logo's slot (Coming up rows, an application's Next row):
 * the month small over the day, in Founders, on the gray fill. */
export function DateTile({ month, day }: DateTileProps) {
  return <View style={styles.tile} accessible={false}>
    <RNText style={styles.month} maxFontSizeMultiplier={1.2}>{month}</RNText>
    <RNText style={styles.day} maxFontSizeMultiplier={1.2}>{day}</RNText>
  </View>;
}

/** The tile with no date yet: a dashed outline round a plus. */
export function EmptyDateTile() {
  const { theme } = useUnistyles();
  return <View style={[styles.tile, styles.empty, { borderColor: theme.ui.color["ink-4"] }]}>
    <Icon name="add" size={16} tone="ink-3" />
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  tile: {
    width: theme.ui.size.logo,
    height: theme.ui.size.logo,
    borderRadius: theme.ui.size.logo / 4,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ui.color.fill,
  },
  empty: { backgroundColor: "transparent", borderWidth: 1.5, borderStyle: "dashed" },
  month: { fontFamily: faces.display, fontSize: 11, lineHeight: 12, letterSpacing: 0.88, color: theme.ui.color["ink-3"] },
  day: { fontFamily: faces.display, fontSize: 20, lineHeight: 20, color: theme.ui.color.ink },
}));
