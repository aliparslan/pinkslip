import { companyMark } from "@pinkslip/core/utils";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { API_URL } from "../../platform/session";

function hostname(domain: string | null | undefined): string | null {
  const host = domain?.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return host || null;
}

/** The company's logo on a white tile (both modes), through the API's logo
 * proxy; initials when there's none. */
export function CompanyLogo({ name, domain, size = 24 }: { name: string; domain?: string | null; size?: 24 | 32 | 44 }) {
  const host = hostname(domain);
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = host && failed !== host;
  return <View style={[styles.tile, { width: size, height: size, borderRadius: size >= 44 ? 10 : 6 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {showImage
      ? <Image source={{ uri: `${API_URL}/logo?domain=${encodeURIComponent(host)}` }} style={{ width: size, height: size }} onError={() => setFailed(host)} />
      : <Text style={[styles.mark, { fontSize: size * 0.4 }]}>{companyMark(name || "?")}</Text>}
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: theme.colors["logo-tile"],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors["image-outline"],
  },
  mark: { color: "#3a3a3d", fontWeight: "600" },
}));
