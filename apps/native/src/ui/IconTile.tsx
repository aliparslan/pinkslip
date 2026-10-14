import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Icon, type IconName } from "./Icon";

/** What a settings row is for, which sets its tile's color. */
export type TileMeaning = "find" | "apply" | "pro" | "app";

export interface IconTileProps {
  icon: IconName;
  meaning: TileMeaning;
}

/** A settings row's icon on a soft 28pt tile (Paper "You · Oct 14", B4,
 * owner 2026-10-14). The color says what the row is for: blue finds jobs,
 * green is what you apply with, pink is Pro, gray is the app. */
export function IconTile({ icon, meaning }: IconTileProps) {
  const { theme } = useUnistyles();
  const color = theme.ui.color;
  return <View style={[styles.tile, { backgroundColor: color[`tile-${meaning}`] }]}>
    <Icon name={icon} size={18} color={color[`tile-${meaning}-ink`]} />
  </View>;
}

const styles = StyleSheet.create({
  tile: { width: 28, height: 28, borderRadius: 7, borderCurve: "continuous", alignItems: "center", justifyContent: "center" },
});
