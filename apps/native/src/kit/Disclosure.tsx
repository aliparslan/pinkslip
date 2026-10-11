import { CaretRight } from "phosphor-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { durations, easeOut } from "./motion";
import { Text } from "./Text";

/** A summary row that folds its content away, closed by default. The caret
 * turns to show the state and the content fades in as it opens. */
export function Disclosure({ summary, defaultOpen = false, children }: { summary: string; defaultOpen?: boolean; children: ReactNode }) {
  const { theme } = useUnistyles();
  const [open, setOpen] = useState(defaultOpen);
  const turn = useSharedValue(defaultOpen ? 90 : 0);
  useEffect(() => { turn.value = withTiming(open ? 90 : 0, { duration: durations.fast, easing: easeOut }); }, [open, turn]);
  const caret = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return <View style={styles.root}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.summary}>
      <Animated.View style={caret}><CaretRight size={14} weight="bold" color={theme.colors["ink-3"]} /></Animated.View>
      <Text size="sm" weight="medium" tone="ink-2">{summary}</Text>
    </Pressable>
    {open ? <Animated.View entering={FadeIn.duration(durations.fast).easing(easeOut)} style={styles.body}>{children}</Animated.View> : null}
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  root: { gap: theme.space["3"] },
  summary: { flexDirection: "row", alignItems: "center", gap: theme.space["2"], minHeight: theme.sizing["tap-min"] - 8 },
  body: { gap: theme.space["4"] },
}));
