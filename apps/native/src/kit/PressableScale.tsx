import type { ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { durations, easeOut } from "./motion";

/** Shrinks a view a little while its press is held: the feedback lands on
 * touch-down, runs on the UI thread, and lets go on release. */
export function usePressScale(scale = 0.97) {
  const value = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: value.value }] }));
  const to = (target: number) => { value.value = withTiming(target, { duration: durations.instant, easing: easeOut }); };
  return { style, onPressIn: () => to(scale), onPressOut: () => to(1) };
}

export type PressableScaleProps = Omit<PressableProps, "style" | "children" | "onPressIn" | "onPressOut"> & {
  /** Layout for the touch target (e.g. alignSelf). */
  style?: StyleProp<ViewStyle>;
  /** The look: background, padding, border. This is the part that shrinks. */
  contentStyle?: StyleProp<ViewStyle>;
  scale?: number;
  children: ReactNode;
};

/** A Pressable whose content shrinks to 97% while held (buttons, chips). */
export function PressableScale({ style, contentStyle, scale, children, ...props }: PressableScaleProps) {
  const press = usePressScale(scale);
  return <Pressable {...props} style={style} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
    <Animated.View style={[contentStyle, press.style]}>{children}</Animated.View>
  </Pressable>;
}
