import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** The line between job rows, inset to start under the text, past the logo. */
export function RowSeparator() {
  return <View style={styles.line} />;
}

const styles = StyleSheet.create((theme) => ({
  line: { height: StyleSheet.hairlineWidth, marginLeft: theme.gutter + 24 + theme.space["3"], backgroundColor: theme.colors.line },
}));
