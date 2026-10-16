import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Modal, Pressable, View, useWindowDimensions, type LayoutChangeEvent, type ScrollViewProps } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView, type PanGesture } from "react-native-gesture-handler";
import Animated, {
  scrollTo, useAnimatedKeyboard, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { Icon } from "./Icon";
import { motion, rubberBand, timing } from "./motion";
import { SHEET_BOTTOM_RADIUS, SHEET_INSET, SHEET_PADDING, SHEET_RADIUS } from "./sheet-geometry";
import { Text } from "./Text";

/** Vaul's drawer motion, from the tokens: one curve, quick off the mark with
 * a long soft landing, for opening, closing and settling back. */
const OPEN = timing(motion.sheet.open);
const CLOSE = timing(motion.sheet.close);
const SETTLE = timing(motion.sheet.settle);
/** Between steps each step is its own card: the new one slides in at its
 * own size as the old one slides out the other way. */
const PUSH = timing(motion.sheet.push);
/** A step whose content changes (a list loading in) eases to its new height. */
const RESIZE = timing(motion.sheet.resize);
/** Let go past this share of the sheet's height, or flick down faster than
 * this, and it closes. */
const CLOSE_SHARE = motion.sheet.closeShare;
const CLOSE_SPEED = motion.sheet.closeSpeed;
/** Room above a step's first line, under the grab bar, which is also where a
 * drag usually starts. */
const TOP = 24;

interface SheetContextValue {
  close: () => void;
  /** Set while a step has something to lose: a swipe or a tap behind the
   * sheet runs it instead of closing. */
  guard: RefObject<(() => void) | null>;
  drag: PanGesture;
  /** How far the step's list is scrolled; the sheet only follows a drag down from the top. */
  scrollY: SharedValue<number>;
  /** How many lists the sheet holds; with one, a drag up scrolls instead of nudging the sheet. */
  lists: SharedValue<number>;
  offset: SharedValue<number>;
  /** Each step reports its height here: the first opens the sheet. */
  measure: (height: number) => void;
  /** Set once the sheet has laid out: the step it opened with doesn't slide in. */
  opened: RefObject<boolean>;
  /** The tallest a step can be: the screen below the status bar. */
  maxHeight: number;
  /** How far a step slides: the width of the screen. */
  width: number;
  /** Closes unless a step's guard asks first. */
  dismiss: () => void;
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

/** While `active`, swiping the sheet away or tapping behind it runs
 * `onBlocked` (say, to ask about unsaved changes) and the sheet settles back.
 * `close()` from useSheet always closes. */
export function useSheetGuard(active: boolean, onBlocked: () => void) {
  const { guard } = useSheetContext();
  const latest = useRef(onBlocked);
  useEffect(() => {
    latest.current = onBlocked;
  });
  useEffect(() => {
    if (!active) return;
    guard.current = () => latest.current();
    return () => {
      guard.current = null;
    };
  }, [active, guard]);
}

export interface SheetProps {
  /** Runs once the sheet has slid away. */
  onClosed: () => void;
  children: ReactNode;
}

/**
 * Pinkslip's own sheet, in place of the system's: it floats 8pt in from the
 * screen's edges with 40pt corners, sizes to each step, and wears a grab bar
 * instead of a close button (Paper "Filters and Apply"). Each step is its
 * own card: one opened from the menu slides in from the right at its own
 * size while the menu slides off to the left, and Back reverses it. Drag or
 * flick it down to close, or tap the page behind it; a list only hands the
 * drag to the sheet when it was already at its top. A step with unsaved
 * changes can ask first (useSheetGuard). What a sheet holds is a plain menu
 * (Choices); paper objects stay on their pages.
 */
export function Sheet({ onClosed, children }: SheetProps) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const offset = useSharedValue(height);
  const shade = useSharedValue(0);
  /** The height of the step in front, which sets how far a drag has to go. */
  const cardHeight = useSharedValue(height);
  const scrollY = useSharedValue(0);
  const lists = useSharedValue(0);
  const anchor = useSharedValue(0);
  const fromTop = useSharedValue(true);
  const opened = useRef(false);
  const guard = useRef<(() => void) | null>(null);
  const maxHeight = height - insets.top - SHEET_INSET;

  // The first step to lay out opens the sheet, rising its own height.
  const measure = useCallback((contentHeight: number) => {
    cardHeight.value = contentHeight;
    if (opened.current) return;
    opened.current = true;
    offset.value = contentHeight + SHEET_INSET;
    offset.value = withTiming(0, OPEN);
    shade.value = withTiming(1, OPEN);
  }, [cardHeight, offset, shade]);

  const close = useCallback(() => {
    shade.value = withTiming(0, CLOSE);
    offset.value = withTiming(cardHeight.value + SHEET_INSET + 24, CLOSE, (done) => {
      if (done) scheduleOnRN(onClosed);
    });
  }, [cardHeight, offset, shade, onClosed]);

  // A swipe, a tap behind or VoiceOver's escape: a guarded step gets asked
  // instead, and the sheet settles back where it was.
  const dismiss = useCallback(() => {
    const blocked = guard.current;
    if (!blocked) {
      close();
      return;
    }
    offset.value = withTiming(0, SETTLE);
    shade.value = withTiming(1, SETTLE);
    blocked();
  }, [close, offset, shade]);

  const drag = useMemo(() => Gesture.Pan().activeOffsetY([-10, 10]).onStart(() => {
    anchor.value = 0;
    // A swipe that starts down a list only scrolls it, even once it reaches
    // the top; the sheet waits for the next one (as iOS and Vaul do).
    fromTop.value = scrollY.value <= 0.5;
  }).onUpdate((event) => {
    if (!fromTop.value) return;
    // Scrolled back down within this drag: the sheet follows again from the top.
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
      scheduleOnRN(dismiss);
    } else {
      offset.value = withTiming(0, SETTLE);
      shade.value = withTiming(1, SETTLE);
    }
  }), [anchor, fromTop, scrollY, lists, offset, shade, cardHeight, dismiss]);

  // A step with a field (Report's note) rises with the keyboard, standing
  // the same 8 above it as above the screen's edge.
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value - keyboard.height.value }] }));
  const scrim = useAnimatedStyle(() => ({ opacity: shade.value }));
  const value = useMemo(() => ({ close, guard, dismiss, drag, scrollY, lists, offset, measure, opened, maxHeight, width }),
    [close, dismiss, drag, scrollY, lists, offset, measure, maxHeight, width]);

  return <SheetContext.Provider value={value}>
    <View style={styles.fill}>
      <Animated.View style={[styles.scrim, scrim]}>
        <Pressable style={styles.fill} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <GestureDetector gesture={drag}>
        {/* The steps stand on the bottom edge of a stage as tall as a step
            can be; it rises, drags and closes as one, and taps around the
            card reach the page behind. */}
        <Animated.View pointerEvents="box-none" style={[styles.stage, { height: maxHeight }, lift]}
          accessibilityViewIsModal onAccessibilityEscape={dismiss}>
          {children}
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
  /** Changes when the step does, so the old card leaves and the new arrives. */
  id: string;
  /** Opened from the menu: it slides in from the right and back out that
   * way, while the menu slides off to the left and back. */
  inner?: boolean;
  children: ReactNode;
}

/** A step slides in from one side... */
function arriving(from: 1 | -1, width: number) {
  return () => {
    "worklet";
    return {
      initialValues: { transform: [{ translateX: from * width }] },
      animations: { transform: [{ translateX: withTiming(0, PUSH) }] },
    };
  };
}

/** ...as the one it replaces slides out the other. */
function leaving(to: 1 | -1, width: number) {
  return () => {
    "worklet";
    return {
      initialValues: { transform: [{ translateX: 0 }] },
      animations: { transform: [{ translateX: withTiming(to * width, PUSH) }] },
    };
  };
}

/** One step of a sheet: its own card, standing on the bottom edge at the
 * height of what it holds. */
export function SheetStep({ id, inner = false, children }: SheetStepProps) {
  return <StepCard key={id} inner={inner}>{children}</StepCard>;
}

function StepCard({ inner, children }: { inner: boolean; children: ReactNode }) {
  const { dismiss, measure, opened, maxHeight, width } = useSheetContext();
  // The step the sheet opens with rises with it; only later steps slide in.
  const [initial] = useState(() => !opened.current);
  const height = useSharedValue(0);
  const sized = useRef(false);
  // Its first height is set at once; later ones (a list loading in) ease.
  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    height.value = sized.current ? withTiming(next, RESIZE) : next;
    sized.current = true;
    measure(next);
  };
  const side = inner ? 1 : -1;
  const card = useAnimatedStyle(() => ({ height: height.value }));
  return <Animated.View entering={initial ? undefined : arriving(side, width)} exiting={leaving(side, width)}
    style={[styles.card, card]}>
    {/* The content stands on the card's bottom edge, so it holds still while the card grows. */}
    <View onLayout={onLayout} style={[styles.step, { maxHeight }]}>
      {children}
    </View>
    {/* Drag it down to close; VoiceOver can close it from here. */}
    <View style={styles.grabber} accessible accessibilityRole="button" accessibilityLabel="Close" onAccessibilityTap={dismiss} />
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
}

/** The step's title in Founders. The grab bar above it closes the sheet. */
export function SheetHeader({ title }: SheetHeaderProps) {
  return <Text role="title1" accessibilityRole="header">{title}</Text>;
}

/** Back from a step inside the sheet: a round button at the bottom, to the
 * left of the step's Done (owner, 2026-10-13). Its chevron is 2pt, as the lit
 * tab's icon is, so it holds its own beside a Medium label (owner,
 * 2026-10-15). */
export function SheetBack({ onPress }: { onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Back"
    style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
    <Icon name="back" size={20} tone="ink" stroke={2} />
  </Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.ui.color.scrim },
  stage: { position: "absolute", left: SHEET_INSET, right: SHEET_INSET, bottom: SHEET_INSET },
  card: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: SHEET_RADIUS,
    borderBottomLeftRadius: SHEET_BOTTOM_RADIUS,
    borderBottomRightRadius: SHEET_BOTTOM_RADIUS,
    borderCurve: "continuous",
    overflow: "hidden",
    // The page's Mist in light, so groups in it sit white on gray as cards
    // do on a page (owner, 2026-10-15, Paper "Sheets · three ways" A).
    backgroundColor: theme.ui.color.sheet,
    boxShadow: theme.ui.shadow.pill,
  },
  step: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: theme.ui.space["5"],
    paddingTop: TOP,
    paddingHorizontal: SHEET_PADDING,
    paddingBottom: SHEET_PADDING,
  },
  grabber: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.ui.color["ink-4"],
  },
  back: {
    width: theme.ui.size.button,
    height: theme.ui.size.button,
    borderRadius: theme.ui.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ui.color.fill,
  },
  pressed: { opacity: 0.6 },
}));
