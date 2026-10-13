import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Modal, Pressable, View, useWindowDimensions, type LayoutChangeEvent, type ScrollViewProps } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView, type PanGesture } from "react-native-gesture-handler";
import Animated, {
  LayoutAnimationConfig, scrollTo, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { Icon } from "./Icon";
import { motion, rubberBand, timing } from "./motion";
import { Text } from "./Text";

/** Vaul's drawer motion, from the tokens: one curve, quick off the mark with
 * a long soft landing, for opening, closing, resizing and settling back. */
const OPEN = timing(motion.sheet.open);
const CLOSE = timing(motion.sheet.close);
const RESIZE = timing(motion.sheet.resize);
const SETTLE = timing(motion.sheet.settle);
const STEP_IN = timing(motion.sheet.stepIn);
const STEP_OUT = timing(motion.sheet.stepOut);
/** Let go past this share of the sheet's height, or flick down faster than
 * this, and it closes. */
const CLOSE_SHARE = motion.sheet.closeShare;
const CLOSE_SPEED = motion.sheet.closeSpeed;
/** The gap between the sheet and the screen's edges. */
const INSET = 8;
/** Room above a step's first line, which is also where a drag usually starts. */
const TOP = 24;

interface SheetContextValue {
  close: () => void;
  drag: PanGesture;
  /** How far the step's list is scrolled; the sheet only follows a drag down from the top. */
  scrollY: SharedValue<number>;
  /** How many lists the sheet holds; with one, a drag up scrolls instead of nudging the sheet. */
  lists: SharedValue<number>;
  offset: SharedValue<number>;
  /** A step reports its height here, and the card eases to it. */
  measure: (height: number) => void;
  /** The tallest a step can be: the screen below the status bar. */
  maxHeight: number;
}

const SheetContext = createContext<SheetContextValue | null>(null);

function useSheetContext() {
  const sheet = useContext(SheetContext);
  if (!sheet) throw new Error("Sheet parts used outside a Sheet");
  return sheet;
}

/** Closes the sheet it's inside: slides it away, then runs onClosed. */
export function useSheet() {
  return { close: useSheetContext().close };
}

export interface SheetProps {
  /** Runs once the sheet has slid away. */
  onClosed: () => void;
  children: ReactNode;
}

/**
 * Pinkslip's own sheet, in place of the system's: it floats 8pt in from the
 * screen's edges with 40pt corners, sizes to what it holds, and changes
 * height in place when its content changes, so one sheet can step through a
 * choice and back (Paper "Filters and Apply · Oct 12"). Steps stand on the
 * card's bottom edge and cross-fade where they are, so only the top edge
 * moves. Drag or flick it down from anywhere, or tap the page behind it, to
 * close. What a sheet holds is a plain menu (Choices); paper objects stay on
 * their pages.
 */
export function Sheet({ onClosed, children }: SheetProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const offset = useSharedValue(height);
  const shade = useSharedValue(0);
  const cardHeight = useSharedValue(height);
  const scrollY = useSharedValue(0);
  const lists = useSharedValue(0);
  const anchor = useSharedValue(0);
  const opened = useRef(false);
  const maxHeight = height - insets.top - INSET;

  // The card follows its step's height: set at first, so it slides in
  // with the whole trip on screen, then eased from step to step.
  const measure = useCallback((contentHeight: number) => {
    if (opened.current) {
      cardHeight.value = withTiming(contentHeight, RESIZE);
      return;
    }
    opened.current = true;
    cardHeight.value = contentHeight;
    offset.value = contentHeight + INSET;
    offset.value = withTiming(0, OPEN);
    shade.value = withTiming(1, OPEN);
  }, [cardHeight, offset, shade]);

  const close = useCallback(() => {
    shade.value = withTiming(0, CLOSE);
    offset.value = withTiming(cardHeight.value + INSET + 24, CLOSE, (done) => {
      if (done) scheduleOnRN(onClosed);
    });
  }, [cardHeight, offset, shade, onClosed]);

  const drag = useMemo(() => Gesture.Pan().activeOffsetY([-10, 10]).onStart(() => {
    anchor.value = 0;
  }).onUpdate((event) => {
    // While the list is scrolled, the drag scrolls it back; the sheet follows from the top.
    if (scrollY.value > 0.5) {
      anchor.value = event.translationY;
      return;
    }
    const travel = event.translationY - anchor.value;
    // Down follows the finger; up stretches like a rubber band (or the list scrolls).
    offset.value = travel > 0 ? travel : lists.value > 0 ? 0 : -rubberBand(-travel, cardHeight.value);
    shade.value = 1 - Math.min(Math.max(offset.value, 0) / cardHeight.value, 1);
  }).onEnd((event) => {
    if (offset.value > CLOSE_SHARE * cardHeight.value || (offset.value > 0 && event.velocityY > CLOSE_SPEED)) {
      scheduleOnRN(close);
    } else {
      offset.value = withTiming(0, SETTLE);
      shade.value = withTiming(1, SETTLE);
    }
  }), [anchor, scrollY, lists, offset, shade, cardHeight, close]);

  const card = useAnimatedStyle(() => ({ height: cardHeight.value, transform: [{ translateY: offset.value }] }));
  const scrim = useAnimatedStyle(() => ({ opacity: shade.value }));
  const value = useMemo(() => ({ close, drag, scrollY, lists, offset, measure, maxHeight }),
    [close, drag, scrollY, lists, offset, measure, maxHeight]);

  return <SheetContext.Provider value={value}>
    <View style={styles.fill}>
      <Animated.View style={[styles.scrim, scrim]}>
        <Pressable style={styles.fill} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <GestureDetector gesture={drag}>
        <Animated.View style={[styles.card, card]} accessibilityViewIsModal>
          {/* A full-height stage pinned to the card's bottom edge, so a step
              (and one fading out) holds still while the card resizes. */}
          <View pointerEvents="box-none" style={[styles.stage, { height: maxHeight }]}>
            {/* The first step is simply there; later ones fade in. */}
            <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  </SheetContext.Provider>;
}

export interface SheetModalProps extends SheetProps {
  open: boolean;
}

/** A Sheet over everything on screen, the tab bar included. The page you
 * were on stays in view behind it. */
export function SheetModal({ open, onClosed, children }: SheetModalProps) {
  if (!open) return null;
  return <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClosed}>
    <GestureHandlerRootView style={styles.fill}>
      <Sheet onClosed={onClosed}>{children}</Sheet>
    </GestureHandlerRootView>
  </Modal>;
}

export interface SheetStepProps {
  /** Changes when the step does, so the old content leaves and the new arrives. */
  id: string;
  children: ReactNode;
}

/** A step fades in where it stands... */
function arriving() {
  "worklet";
  return { initialValues: { opacity: 0 }, animations: { opacity: withTiming(1, STEP_IN) } };
}

/** ...and the one it replaces fades out, a little quicker, in place. */
function leaving() {
  "worklet";
  return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(0, STEP_OUT) } };
}

/** One step of a sheet, standing on its bottom edge. The sheet resizes
 * around it as it changes. */
export function SheetStep({ id, children }: SheetStepProps) {
  const { measure, maxHeight } = useSheetContext();
  const onLayout = (event: LayoutChangeEvent) => measure(event.nativeEvent.layout.height);
  return <Animated.View key={id} entering={arriving} exiting={leaving} onLayout={onLayout} style={[styles.step, { maxHeight }]}>
    {children}
  </Animated.View>;
}

/**
 * A list inside a step that scrolls when the step is taller than the
 * screen allows. Dragging down from its top moves the sheet instead, so
 * it closes the way a short sheet does.
 */
export function SheetScroll({ children, ...props }: Pick<ScrollViewProps, "children" | "contentContainerStyle" | "style">) {
  const { drag, scrollY, lists, offset } = useSheetContext();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const native = useMemo(() => Gesture.Native().simultaneousWithExternalGesture(drag), [drag]);
  useEffect(() => {
    lists.value += 1;
    return () => {
      lists.value -= 1;
      scrollY.value = 0;
    };
  }, [lists, scrollY]);
  const onScroll = useAnimatedScrollHandler((event) => {
    // While the sheet is pulled down the list holds still at its top.
    if (offset.value > 0) {
      scrollTo(ref, 0, 0, false);
      scrollY.value = 0;
    } else {
      scrollY.value = event.contentOffset.y;
    }
  });
  return <GestureDetector gesture={native}>
    <Animated.ScrollView ref={ref} {...props} onScroll={onScroll} scrollEventThrottle={16} bounces={false} showsVerticalScrollIndicator={false}>
      {children}
    </Animated.ScrollView>
  </GestureDetector>;
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
    <Icon name={icon} size={16} tone="ink-2" />
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
  stage: { position: "absolute", left: 0, right: 0, bottom: 0 },
  step: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: theme.ui.space["5"],
    paddingTop: TOP,
    paddingHorizontal: theme.ui.space["5"],
    paddingBottom: theme.ui.space["5"],
  },
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
