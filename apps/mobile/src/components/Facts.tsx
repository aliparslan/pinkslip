/* A line of facts split by middle dots that wraps cleanly, as on the web:
   each dot sits in a slot before its fact, the row is pulled left by one
   slot, and its parent clips that slot away, so a fact that starts a new
   line drops its dot. */

import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { type, usePalette } from "../theme";

const SLOT = 18;

export function Facts({ children }: { children: ReactNode[] }) {
  const palette = usePalette();
  const items = children.filter(Boolean);
  return (
    <View style={{ overflow: "hidden" }}>
      <View style={{ marginLeft: -SLOT, flexDirection: "row", flexWrap: "wrap", rowGap: 4 }}>
        {items.map((item, index) => (
          <View key={index} style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[type("ui"), { width: SLOT, textAlign: "center", color: palette.ink3 }]} aria-hidden>
              ·
            </Text>
            {item}
          </View>
        ))}
      </View>
    </View>
  );
}
