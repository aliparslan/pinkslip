import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** Settles without a bounce: the sheet arrives, it doesn't wobble. */
const SPRING = { damping: 30, stiffness: 320, mass: 1 };
const RESIZE = LinearTransition.springify().damping(30).stiffness(320);
/** A drag this far, or a flick this fast, closes the sheet. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;
/** The gap between the sheet and the screen's edges. */
const INSET = 8;

const SheetContext = createContext<{ close: () => void } | null>(null);

/** Closes the sheet it's inside: slides it away, then leaves the route. */
export function useSheet() {
  const sheet = useContext(SheetContext);
  if (!sheet) throw new Error("useSheet() outside a Sheet");
  return sheet;
}

export interface SheetProps {
  /** Runs once the sheet has slid away (go back from the route here). */
  onClosed: () => void;
  children: ReactNode;
}

/**
 * Pinkslip's own sheet, in place of the system's: it floats 8pt in from the
 * screen's edges with 40pt corners, sizes to what it holds, and changes
 * height in place when its content changes, so one sheet can step through a
 * choice and back (Paper "Filters and Apply · Oct 12"). Drag its top down or
 * tap the page behind it to close.
 */
export function Sheet({ onClosed, children }: SheetProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const offset = useSharedValue(height);
  const shade = useSharedValue(0);

  useEffect(() => {
    offset.value = withSpring(0, SPRING);
    shade.value = withTiming(1, { duration: 220 });
  }, [offset, shade]);

  const close = useCallback(() => {
    shade.value = withTiming(0, { duration: 200 });
    offset.value = withTiming(height, { duration: 240, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) scheduleOnRN(onClosed);
    });
  }, [height, offset, shade, onClosed]);

  const drag = useMemo(() => Gesture.Pan().activeOffsetY([-8, 8]).onUpdate((event) => {
    // Down follows the finger; up resists, so the sheet only nudges.
    offset.value = event.translationY > 0 ? event.translationY : event.translationY / 6;
  }).onEnd((event) => {
    if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) scheduleOnRN(close);
    else offset.value = withSpring(0, SPRING);
  }), [offset, close]);

  const card = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const scrim = useAnimatedStyle(() => ({ opacity: shade.value }));
  const value = useMemo(() => ({ close }), [close]);

  return <SheetContext.Provider value={value}>
    <View style={styles.fill}>
      <Animated.View style={[styles.scrim, scrim]}>
        <Pressable style={styles.fill} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View layout={RESIZE} style={[styles.card, { maxHeight: height - insets.top - INSET }, card]} accessibilityViewIsModal>
        <GestureDetector gesture={drag}><View style={styles.handle} /></GestureDetector>
        {children}
      </Animated.View>
    </View>
  </SheetContext.Provider>;
}

export interface SheetModalProps extends SheetProps {
  open: boolean;
}

/** A Sheet over everything on screen, the navigation bar included, for a
 * sheet that isn't a route of its own (the Apply sheets on the job page). */
export function SheetModal({ open, onClosed, children }: SheetModalProps) {
  if (!open) return null;
  return <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClosed}>
    <GestureHandlerRootView style={styles.fill}>
      <Sheet onClosed={onClosed}>{children}</Sheet>
    </GestureHandlerRootView>
  </Modal>;
}

export interface SheetStepProps {
  /** Changes when the step does, so the old content fades out and the new fades in. */
  id: string;
  children: ReactNode;
}

/** One step of a sheet. The sheet resizes around it as it changes. */
export function SheetStep({ id, children }: SheetStepProps) {
  return <Animated.View key={id} entering={FadeIn.duration(180).delay(60)} exiting={FadeOut.duration(120)} style={styles.step}>
    {children}
  </Animated.View>;
}

export interface SheetHeaderProps {
  title: string;
  /** A back button above the title, for a step inside the sheet. */
  onBack?: () => void;
}

/** The sheet's title in Founders, with a round close button, and a back
 * button when this is a step inside the sheet. */
export function SheetHeader({ title, onBack }: SheetHeaderProps) {
  const { close } = useSheet();
  const closeButton = <RoundButton icon="close" label="Close" onPress={close} />;
  if (onBack) {
    return <View style={styles.stepHeader}>
      <View style={styles.buttons}>
        <RoundButton icon="back" label="Back" onPress={onBack} />
        {closeButton}
      </View>
      <Text role="title1" accessibilityRole="header">{title}</Text>
    </View>;
  }
  return <View style={styles.header}>
    <View style={styles.title}><Text role="title1" accessibilityRole="header">{title}</Text></View>
    {closeButton}
  </View>;
}

function RoundButton({ icon, label, onPress }: { icon: "close" | "back"; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
    style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
    <Icon name={icon} size={16} weight="bold" tone="ink-2" />
  </Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.ui.color.scrim },
  card: {
    position: "absolute",
    left: INSET,
    right: INSET,
    bottom: INSET,
    borderRadius: 40,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.ui.color["bg-elev"],
    boxShadow: theme.ui.shadow.pill,
  },
  /** A strip along the top edge to drag by; the content scrolls below it. */
  handle: { height: 24 },
  step: { flexShrink: 1, gap: theme.ui.space["5"], paddingHorizontal: theme.ui.space["5"], paddingBottom: theme.ui.space["5"] },
  header: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  stepHeader: { gap: theme.ui.space["3"] },
  buttons: { flexDirection: "row", justifyContent: "space-between" },
  title: { flex: 1 },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ui.color.fill,
  },
  pressed: { opacity: 0.6 },
}));
