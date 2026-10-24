import { forwardRef, useEffect } from "react";
import type { TextInput } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { motion, spring } from "./motion";
import { PageBarButton } from "./PageBar";
import { SearchField, type SearchFieldProps } from "./SearchField";
import { useTabBarLine } from "./TabBar";
import { useToastLift } from "./Toast";

/** It comes in on the tab bar's own spring, as the bar steps aside. */
const ARRIVE = spring(motion.tab.glide);

export interface BottomSearchProps extends Omit<SearchFieldProps, "floating"> {
  /** While the Search tab is in front; the bar steps aside for it then. */
  shown: boolean;
  /** The X: back to the tab you were on. */
  onLeave: () => void;
}

/**
 * Search's field at the bottom with its X beside it (owner, 2026-10-22,
 * Paper "Search at the bottom · Oct 22", A): both 44 and floating like the
 * page bar's buttons. With the keyboard down they sit on the tab bar's
 * line, where the bar was; with it up they ride 8 above it, so the way out
 * never moves out of reach.
 */
export const BottomSearch = forwardRef<TextInput, BottomSearchProps>(function BottomSearch({ shown, onLeave, ...field }, ref) {
  const { theme } = useUnistyles();
  const keyboard = useAnimatedKeyboard();
  const size = theme.ui.size.iconButton;
  const rest = useTabBarLine(size);
  const above = theme.ui.space["2"];
  useToastLift(shown ? rest + size : null);
  const arrived = useSharedValue(shown ? 1 : 0);
  useEffect(() => {
    arrived.value = withSpring(shown ? 1 : 0, ARRIVE);
  }, [shown, arrived]);
  const style = useAnimatedStyle(() => ({
    opacity: arrived.value,
    transform: [{ translateY: -Math.max(0, keyboard.height.value + above - rest) }, { scale: 0.96 + 0.04 * arrived.value }],
  }));
  return <Animated.View pointerEvents={shown ? "box-none" : "none"} style={[styles.bar, { bottom: rest }, style]}>
    <SearchField ref={ref} floating {...field} />
    <PageBarButton icon="close" label="Close search" onPress={onLeave} />
  </Animated.View>;
});

const styles = StyleSheet.create((theme) => ({
  bar: {
    position: "absolute",
    left: theme.ui.size.gutter,
    right: theme.ui.size.gutter,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.ui.space["2"],
  },
}));
