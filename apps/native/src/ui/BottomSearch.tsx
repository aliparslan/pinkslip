import { forwardRef, useEffect, useRef, useState } from "react";
import { useWindowDimensions, View, type TextInput } from "react-native";
import Animated, {
  interpolate, useAnimatedKeyboard, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, Extrapolation,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { motion, spring } from "./motion";
import { PageBarButton } from "./PageBar";
import { SearchField, type SearchFieldProps } from "./SearchField";
import { takeSearchHandoff, waitingSearchHandoff, useSearchTabPress, useTabBarFrame, useTabBarLine, type SearchHandoff } from "./TabBar";
import { useToastLift } from "./Toast";

/** The pill stretching into the field, on the spring fitted to Photos. */
const HANDOFF = spring(motion.search.handoff);

export interface BottomSearchProps extends Omit<SearchFieldProps, "floating" | "contentStyle"> {
  /** While the Search tab is in front. */
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
 *
 * Picked from the bar, the field starts out as the bar's pill and stretches
 * into place, its X growing out of the right end and its words fading in
 * once it's mostly formed (owner, 2026-10-24, after Photos' search tab).
 * Coming back from a page, it's already there, moving with its screen;
 * leaving with the X is a cut back to the bar, as Photos does.
 */
export const BottomSearch = forwardRef<TextInput, BottomSearchProps>(function BottomSearch({ shown, onLeave, ...field }, ref) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const keyboard = useAnimatedKeyboard();
  const { width: screen } = useWindowDimensions();
  const size = theme.ui.size.iconButton;
  const gap = theme.ui.space["2"];
  const gutter = theme.ui.size.gutter;
  const line = useTabBarFrame();
  const rest = useTabBarLine(size);
  const above = theme.ui.space["2"];
  useToastLift(shown ? rest + size : null);

  // 0 is the pill it was picked from, 1 the field and its X in place.
  const [waiting] = useState(waitingSearchHandoff);
  const formed = useSharedValue(waiting && !reduced ? 0 : 1);
  const from = useSharedValue<SearchHandoff>(waiting ?? { width: screen - gutter * 2, height: size, drop: 0 });
  // It springs once the field is laid out and in front. Started at the
  // press, it would run unseen while the tab switch is drawn (about 120ms
  // here) and land all at once.
  const laidOut = useRef(false);
  const inFront = useRef(shown);
  const waitingToForm = useRef(false);
  const springIfReady = () => {
    if (!waitingToForm.current || !laidOut.current || !inFront.current) return;
    waitingToForm.current = false;
    formed.value = withSpring(1, HANDOFF);
  };
  const form = () => {
    const pill = takeSearchHandoff();
    if (!pill || reduced) return;
    from.value = pill;
    formed.value = 0;
    waitingToForm.current = true;
    springIfReady();
  };
  const onLayout = () => {
    laidOut.current = true;
    springIfReady();
  };
  useEffect(() => {
    inFront.current = shown;
    springIfReady();
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  // The first time, the screen is new, so the press came before it was here.
  useEffect(form, []); // eslint-disable-line react-hooks/exhaustive-deps
  useSearchTabPress(form);

  // All of it moves by transforms, the field sitting where it ends up: a
  // change of size goes through layout every frame, and the ride up with
  // the keyboard waited behind it.
  const fieldWidth = screen - gutter * 2 - size - gap;
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: from.value.drop * (1 - formed.value) - Math.max(0, keyboard.height.value + above - rest) }],
  }));
  // The field starts as the pill, centred on the screen and the pill's size.
  const slot = useAnimatedStyle(() => {
    const t = formed.value;
    return {
      transform: [
        { translateX: (screen / 2 - (gutter + fieldWidth / 2)) * (1 - t) },
        { scaleX: from.value.width / fieldWidth + (1 - from.value.width / fieldWidth) * t },
        { scaleY: from.value.height / size + (1 - from.value.height / size) * t },
      ],
    };
  });
  const words = useAnimatedStyle(() => ({ opacity: interpolate(formed.value, [0.35, 0.85], [0, 1], Extrapolation.CLAMP) }));
  // The X grows out of the pill's right end, inside it at first.
  const close = useAnimatedStyle(() => {
    const t = formed.value;
    const start = screen / 2 + from.value.width / 2 - size / 2;
    const end = screen - gutter - size / 2;
    return { transform: [{ translateX: (start - end) * (1 - t) }, { scale: Math.max(0, t) }] };
  });

  return <Animated.View pointerEvents={shown ? "box-none" : "none"} onLayout={onLayout}
    style={[styles.line, { bottom: line.bottom, height: line.height }, lift]}>
    <View pointerEvents="box-none" style={styles.bar}>
      <Animated.View style={[styles.slot, slot]}>
        <SearchField ref={ref} floating contentStyle={words} {...field} />
      </Animated.View>
      <Animated.View style={close}>
        <PageBarButton icon="close" label="Close search" onPress={onLeave} />
      </Animated.View>
    </View>
  </Animated.View>;
});

const styles = StyleSheet.create((theme) => ({
  line: { position: "absolute", left: 0, right: 0 },
  bar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: theme.ui.size.gutter,
    right: theme.ui.size.gutter,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.ui.space["2"],
  },
  slot: { flex: 1, height: theme.ui.size.iconButton },
}));
