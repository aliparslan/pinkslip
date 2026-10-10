import type { Icon as PhosphorIcon } from "phosphor-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Heading } from "./Heading";
import { Text } from "./Text";

/** Centered icon, title, one line of message, and optional actions. */
export function EmptyState({ icon: Glyph, title, message, actions }: { icon?: PhosphorIcon; title: string; message?: string; actions?: ReactNode }) {
  const { theme } = useUnistyles();
  return <View style={styles.root}>
    {Glyph ? <View style={styles.icon}><Glyph size={24} color={theme.colors["ink-2"]} /></View> : null}
    <Heading variant="display-sm">{title}</Heading>
    {message ? <Text tone="ink-3" align="center">{message}</Text> : null}
    {actions ? <View style={styles.actions}>{actions}</View> : null}
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  root: { alignItems: "center", gap: theme.space["3"], paddingVertical: theme.space["10"], paddingHorizontal: theme.space["6"] },
  icon: {
    width: 48, height: 48, borderRadius: theme.radius.lg, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors["control-bg"], marginBottom: theme.space["1"],
  },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: theme.space["2"], marginTop: theme.space["2"] },
}));
