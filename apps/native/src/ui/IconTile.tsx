import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Icon, type IconName } from "./Icon";
import type { TileMeaning } from "./tile-meaning";

export type { TileMeaning };

export interface IconTileProps {
  icon: IconName;
  meaning: TileMeaning;
  /** Filled for Support Pinkslip's heart (owner, 2026-10-22). */
  weight?: "line" | "fill";
}

/** A settings row's icon on a soft 28pt tile (Paper "You · Oct 14", B4,
 * owner 2026-10-14). The color says what the row is for: blue finds jobs,
 * green is what you apply with, pink is Pro (and Support Pinkslip), gray is
 * the app. */
export function IconTile({ icon, meaning, weight }: IconTileProps) {
  const { theme } = useUnistyles();
  const color = theme.ui.color;
  return <View style={[styles.tile, { backgroundColor: color[`tile-${meaning}`] }]}>
    <Icon name={icon} size={18} color={color[`tile-${meaning}-ink`]} weight={weight} />
  </View>;
}

const styles = StyleSheet.create({
  tile: { width: 28, height: 28, borderRadius: 7, borderCurve: "continuous", alignItems: "center", justifyContent: "center" },
});
