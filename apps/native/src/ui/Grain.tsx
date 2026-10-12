import { ImageBackground, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** The paper texture of the ticket and the punch card: a small tile repeated
 * and tinted by mode, clipped to the paper's corners. */
export function Grain({ radius, flatBottom = false }: { radius: number; flatBottom?: boolean }) {
  const { theme } = useUnistyles();
  return <View pointerEvents="none" style={[styles.grain, { borderRadius: radius }, flatBottom && styles.flatBottom]}>
    <ImageBackground source={require("../../assets/grain.png")} resizeMode="repeat" style={styles.fill}
      imageStyle={{ tintColor: theme.ui.color.grain }} />
  </View>;
}

const styles = StyleSheet.create({
  grain: { ...StyleSheet.absoluteFillObject, borderCurve: "continuous", overflow: "hidden" },
  flatBottom: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  fill: { flex: 1 },
});
