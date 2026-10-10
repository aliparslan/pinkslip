import { CaretDown, CaretRight } from "phosphor-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "./Text";

/** A summary row that folds its content away, closed by default. */
export function Disclosure({ summary, defaultOpen = false, children }: { summary: string; defaultOpen?: boolean; children: ReactNode }) {
  const { theme } = useUnistyles();
  const [open, setOpen] = useState(defaultOpen);
  const Caret = open ? CaretDown : CaretRight;
  return <View style={styles.root}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.summary}>
      <Caret size={14} weight="bold" color={theme.colors["ink-3"]} />
      <Text size="sm" weight="medium" tone="ink-2">{summary}</Text>
    </Pressable>
    {open ? <View style={styles.body}>{children}</View> : null}
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  root: { gap: theme.space["3"] },
  summary: { flexDirection: "row", alignItems: "center", gap: theme.space["2"], minHeight: theme.sizing["tap-min"] - 8 },
  body: { gap: theme.space["4"] },
}));
