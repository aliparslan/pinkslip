import { Image, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Text } from "./Text";

const icon = require("../../assets/icon.png");

/** A new-jobs alert as it lands, on the Lock Screen's rounded card: the app
 * icon, the push's own words (`worker/push.ts`), its time. Alerts shows it
 * over its choices; sign-in's alerts ask (S5) shows the same one. */
export function AlertPreview({ daily = false, at }: { daily?: boolean; at?: string }) {
  return <View style={styles.preview} accessibilityLabel="What an alert looks like">
    <Image source={icon} style={styles.icon} />
    <View style={styles.text}>
      <View style={styles.top}>
        <Text role="subhead" weight="medium">{daily ? "12 new jobs today" : "3 new jobs"}</Text>
        <Text role="footnote" tone="ink-3">{daily ? at : "now"}</Text>
      </View>
      <Text role="subhead">{daily ? "Datadog, Ramp, Mercury and 9 more" : "Datadog, Ramp, Mercury"}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  preview: {
    flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: theme.ui.space["3"], paddingHorizontal: 14,
    borderRadius: 22, borderCurve: "continuous", backgroundColor: theme.ui.color.fill,
  },
  icon: { width: 38, height: 38, borderRadius: 9 },
  text: { flex: 1, minWidth: 0 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: theme.ui.space["2"] },
}));
