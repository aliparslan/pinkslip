import { router, Stack, useIsFocused } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { Icon, IconButton, Text, useTabBarScroll, useTabBarStepsAside, useToastLift } from "../../../ui";

/** The pinned bar's own height: a 50 button with 12 above it. */
const BAR = 62;

/** A page under You (Paper "You · Oct 14"): Back, the title right under it,
 * then the page's cards 24 apart on white. A page action (Add experience,
 * Send) is `bar`: pinned to the bottom on the page's Mist, the tab bar
 * stepping aside, with a line above only once content scrolls under it
 * (owner, 2026-10-14). */
export function YouPage({ title, children, scroll = true, bar }: { title: string; children: ReactNode; scroll?: boolean; bar?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const tabBarScroll = useTabBarScroll();
  const focused = useIsFocused();
  useTabBarStepsAside(Boolean(bar) && focused);
  const barBottom = Math.max(insets.bottom, 16);
  useToastLift(bar && focused ? barBottom + BAR : null);
  const [box, setBox] = useState({ content: 0, frame: 0 });
  // While you type, the bar stands 8 above the keyboard.
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboard.height.value > 0 ? -(keyboard.height.value + 8 - barBottom) : 0 }],
  }));
  const under = box.content > box.frame;
  const top = <>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.nav}><IconButton icon="back" label="Back" onPress={() => router.back()} /></View>
    <View style={styles.title}><Text role="title1" accessibilityRole="header">{title}</Text></View>
  </>;
  if (!scroll) {
    return <View style={[styles.fill, styles.content, { paddingTop: insets.top }]}>{top}{children}</View>;
  }
  const page = <ScrollView {...(bar ? {} : tabBarScroll)} style={styles.fill} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
    onLayout={(event) => { const frame = event.nativeEvent.layout.height - (bar ? barBottom + BAR : 0); setBox((current) => ({ ...current, frame })); }}
    onContentSizeChange={(_width, content) => setBox((current) => ({ ...current, content }))}
    contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: bar ? barBottom + BAR + 24 : insets.bottom + 32 }]}>
    {top}
    {children}
  </ScrollView>;
  if (!bar) return page;
  return <View style={styles.fill}>
    {page}
    <Animated.View style={[styles.bar, under && styles.barLine, { paddingBottom: barBottom }, lift]}>{bar}</Animated.View>
  </View>;
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
  bar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingTop: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter, backgroundColor: theme.ui.color.bg,
  },
  barLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.ui.color.separator },
  content: { gap: theme.ui.space["6"] },
  // The title sits right under Back, as on Email tracking.
  nav: { paddingHorizontal: theme.ui.size.gutter, height: 44, justifyContent: "center", marginBottom: -theme.ui.space["4"] },
  title: { paddingHorizontal: theme.ui.size.gutter },
  soon: { alignItems: "center", gap: theme.ui.space["2"], paddingHorizontal: theme.ui.space["8"], paddingTop: 150 },
  wrench: { marginBottom: theme.ui.space["2"] },
}));
