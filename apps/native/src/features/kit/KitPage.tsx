import { Stack } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { PAGE_BAR, PageBar, Text, useTabBarSpace } from "../../ui";

/** A kit page on the same top as every pushed page (owner, 2026-10-19,
 * option A): Back floating in the page bar, the title big in the page. The
 * kit's own spacing stays its own (`contentStyle`). */
export function KitPage({ title, style, contentStyle, children }: {
  title: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  return <View style={[styles.fill, style]}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView style={styles.fill} contentContainerStyle={[contentStyle, { paddingTop: insets.top + PAGE_BAR + 8, paddingBottom: tabSpace }]}>
      <View style={styles.title}><Text role="title1" accessibilityRole="header">{title}</Text></View>
      {children}
    </ScrollView>
    <PageBar />
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1 },
  title: { paddingHorizontal: theme.ui.size.gutter, paddingBottom: theme.ui.space["4"] },
}));
