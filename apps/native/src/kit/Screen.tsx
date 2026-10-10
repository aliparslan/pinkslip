import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** A scrolling screen body under the native navigation bar: insets follow
 * the (large-title) header and the tab bar, with the screen gutter. */
export function Screen({ children, refreshing, onRefresh, padded = true }: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
}) {
  const { theme } = useUnistyles();
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="interactive" style={styles.scroll}
    refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={theme.colors["ink-3"]} /> : undefined}>
    <View style={[styles.body, padded && styles.padded]}>{children}</View>
  </ScrollView>;
}

const styles = StyleSheet.create((theme) => ({
  scroll: { flex: 1, backgroundColor: theme.colors.bg },
  body: { gap: theme.space["6"], paddingBottom: theme.space["10"] },
  padded: { paddingHorizontal: theme.gutter, paddingTop: theme.space["4"] },
}));
