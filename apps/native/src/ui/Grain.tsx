import { useSyncExternalStore } from "react";
import { ImageBackground, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** Seamless paper textures from scripts/paper-textures.py; `noise` is the first, per-pixel grain. */
const textures = {
  stock: require("../../assets/paper-stock.png"),
  cotton: require("../../assets/paper-cotton.png"),
  recycled: require("../../assets/paper-recycled.png"),
  noise: require("../../assets/grain.png"),
} as const;

export type PaperTexture = keyof typeof textures;

// The texture is chosen in the redesign kit while the options are compared.
let texture: PaperTexture = "cotton";
const listeners = new Set<() => void>();
export function setPaperTexture(next: PaperTexture) {
  texture = next;
  for (const listener of listeners) listener();
}
export function usePaperTexture(): PaperTexture {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => texture);
}

/** The paper texture of the ticket and the punch card: a tile repeated and
 * tinted by mode, clipped to the paper's corners. */
export function Grain({ radius, flatBottom = false, flatTop = false }: { radius: number; flatBottom?: boolean; flatTop?: boolean }) {
  const { theme } = useUnistyles();
  const current = usePaperTexture();
  return <View pointerEvents="none" style={[styles.grain, { borderRadius: radius }, flatBottom && styles.flatBottom, flatTop && styles.flatTop]}>
    <ImageBackground source={textures[current]} resizeMode="repeat" style={styles.fill}
      imageStyle={{ tintColor: theme.ui.color.grain }} />
  </View>;
}

const styles = StyleSheet.create({
  grain: { ...StyleSheet.absoluteFillObject, borderCurve: "continuous", overflow: "hidden" },
  flatBottom: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  flatTop: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  fill: { flex: 1 },
});
