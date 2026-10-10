import { companyMark } from "@pinkslip/core/utils";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { API_URL } from "../../platform/session";

function hostname(domain: string | null | undefined): string | null {
  const host = domain?.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return host || null;
}

/** The company's logo on a white tile (both modes), through the API's logo
 * proxy; initials when there's none. The image carries its own white
 * background so the two clip as one layer, with no light fringe at the
 * corners. The hairline sits on top, in light mode only: there a white tile
 * needs an edge against the page, while in dark mode a light ring reads as a
 * halo around dark logos like Uber's. */
export function CompanyLogo({ name, domain, size = 24 }: { name: string; domain?: string | null; size?: 24 | 32 | 44 }) {
  const { theme } = useUnistyles();
  const host = hostname(domain);
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = host && failed !== host;
  const radius = size >= 44 ? 10 : 6;
  const outlined = theme.mode === "light" || theme.mode === "lightContrast";
  return <View style={[styles.tile, { width: size, height: size, borderRadius: radius }, !showImage && styles.blank]}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {showImage
      ? <Image source={{ uri: `${API_URL}/logo?domain=${encodeURIComponent(host)}` }} style={[styles.image, { width: size, height: size, borderRadius: radius }]} onError={() => setFailed(host)} />
      : <Text style={[styles.mark, { fontSize: size * 0.4 }]}>{companyMark(name || "?")}</Text>}
    {outlined && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.outline, { borderRadius: radius }]} />}
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  tile: { alignItems: "center", justifyContent: "center", overflow: "hidden", borderCurve: "continuous" },
  blank: { backgroundColor: theme.colors["logo-tile"] },
  image: { backgroundColor: theme.colors["logo-tile"] },
  outline: { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors["image-outline"] },
  mark: { color: "#3a3a3d", fontWeight: "600" },
}));
