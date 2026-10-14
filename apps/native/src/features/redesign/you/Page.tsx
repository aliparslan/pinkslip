import { router, Stack } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { Icon, IconButton, Text, useTabBarScroll } from "../../../ui";

/** A page under You (Paper "You · Oct 14"): Back, the title right under it,
 * then the page's cards 24 apart on white. */
export function YouPage({ title, children, scroll = true }: { title: string; children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const tabBarScroll = useTabBarScroll();
  const top = <>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.nav}><IconButton icon="back" label="Back" onPress={() => router.back()} /></View>
    <View style={styles.title}><Text role="title1" accessibilityRole="header">{title}</Text></View>
  </>;
  if (!scroll) {
    return <View style={[styles.fill, styles.content, { paddingTop: insets.top }]}>{top}{children}</View>;
  }
  return <ScrollView {...tabBarScroll} style={styles.fill} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
    contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 32 }]}>
    {top}
    {children}
  </ScrollView>;
}

/** A page for something on the way (Paper Tailoring): the wrench, what's
 * coming and one line on it, a little above the middle. */
export function ComingSoon({ title, message }: { title: string; message: string }) {
  return <View style={styles.soon}>
    <View style={styles.wrench}><Icon name="soon" size={40} tone="ink-3" /></View>
    <Text role="title2" align="center">{title}</Text>
    <Text tone="ink-2" align="center">{message}</Text>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  content: { gap: theme.ui.space["6"] },
  // The title sits right under Back, as on Email tracking.
  nav: { paddingHorizontal: theme.ui.size.gutter, height: 44, justifyContent: "center", marginBottom: -theme.ui.space["4"] },
  title: { paddingHorizontal: theme.ui.size.gutter },
  soon: { alignItems: "center", gap: theme.ui.space["2"], paddingHorizontal: theme.ui.space["8"], paddingTop: 150 },
  wrench: { marginBottom: theme.ui.space["2"] },
}));
