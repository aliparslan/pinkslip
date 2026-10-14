import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, Text } from "../../../ui";

/** At the top of Tracker until email tracking is set up or put away (Paper
 * 1B, owner 2026-10-14). Its button is the outline pink: an action in a card. */
export function TrackerNudge({ onSetUp, onDismiss }: { onSetUp: () => void; onDismiss: () => void }) {
  return <View style={styles.card}>
    <View style={styles.text}>
      <Text weight="medium">Let Tracker move on its own</Text>
      <Text role="subhead" tone="ink-2">Forward your job email to Pinkslip, and stages change when companies write.</Text>
    </View>
    <View style={styles.actions}>
      <Button variant="outline" size="small" onPress={onSetUp}>Set it up</Button>
      <Button variant="plain" size="small" onPress={onDismiss}>Not now</Button>
    </View>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    marginHorizontal: theme.ui.size.gutter,
    marginTop: theme.ui.space["4"],
    padding: theme.ui.space["4"],
    gap: theme.ui.space["3"],
    borderRadius: theme.ui.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color["bg-grouped"],
  },
  text: { gap: theme.ui.space["1"] },
  actions: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
}));
