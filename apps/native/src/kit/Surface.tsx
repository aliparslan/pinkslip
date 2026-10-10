import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "./Text";

/** A card on the elevated background. */
export function Surface({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Separator({ inset = false }: { inset?: boolean }) {
  return <View style={[styles.separator, inset && styles.inset]} />;
}

export function Spinner({ label }: { label?: string }) {
  const { theme } = useUnistyles();
  return <ActivityIndicator color={theme.colors["ink-3"]} accessibilityLabel={label} />;
}

export function Badge({ children }: { children: ReactNode }) {
  return <View style={styles.badge}><Text size="2xs" weight="medium" tone="ink-2">{children}</Text></View>;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    padding: theme.space["4"],
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors["bg-elev"],
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.line },
  inset: { marginLeft: theme.space["4"] },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.space["2"],
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["control-bg"],
  },
}));
