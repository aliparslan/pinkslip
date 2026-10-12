import { useState } from "react";
import { Image, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Text } from "./Text";

export interface CompanyLogoProps {
  name: string;
  /** The logo image. Without one, the tile shows the first letter. */
  uri?: string | null;
  /** The brand colour behind the letter when there's no image. */
  color?: string;
  size?: "row" | "page";
}

/** Logos sit on a white tile in both modes with a faint outline, so a dark
 * logo keeps its edge on graphite. 40pt in rows, 48 on a page; the corner is a
 * quarter of the size (10 and 12). */
export function CompanyLogo({ name, uri, color, size = "row" }: CompanyLogoProps) {
  styles.useVariants({ size });
  // A logo that fails to load falls back to the letter.
  const [failed, setFailed] = useState<string | null>(null);
  if (uri && failed !== uri) {
    return <View style={[styles.tile, styles.white]} accessibilityElementsHidden>
      <Image source={{ uri }} style={styles.image} resizeMode="contain" onError={() => setFailed(uri)} />
    </View>;
  }
  return <View style={[styles.tile, color ? { backgroundColor: color } : styles.blank]} accessibilityElementsHidden>
    <Text role={size === "page" ? "title2" : "body"} tone={color ? "bg" : "ink-2"}>{name.trim().charAt(0).toUpperCase()}</Text>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderCurve: "continuous",
    variants: {
      size: {
        row: { width: theme.ui.size.logo, height: theme.ui.size.logo, borderRadius: theme.ui.size.logo / 4 },
        page: { width: theme.ui.size.logoLarge, height: theme.ui.size.logoLarge, borderRadius: theme.ui.size.logoLarge / 4 },
      },
    },
  },
  white: { backgroundColor: theme.ui.color["logo-tile"], borderWidth: StyleSheet.hairlineWidth, borderColor: theme.ui.color["image-outline"] },
  blank: { backgroundColor: theme.ui.color.fill },
  image: { width: "80%", height: "80%" },
}));
