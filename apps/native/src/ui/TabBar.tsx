import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { usePathname, useScrollToTop } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { makeMutable, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "../platform/haptics";
import { Icon, type IconName } from "./Icon";
import { motion, spring } from "./motion";
import { useToastLift } from "./Toast";

/** A tab is a 56 slot with its 24 icon in the middle (Paper "C · Closer
 * icons, pink outline, drag"). */
const PITCH = 56;
const ICON = 24;
const ICON_INSET = (PITCH - ICON) / 2;
const SLOT_HEIGHT = 46;
/** The tab you're on is a 64 oval around its icon, with no name (owner,
 * 2026-10-15: the names from "Tab bar labels · Oct 14" went). */
const LIT = 64;
const PAD = 5;
/** The lit tab grows and shrinks on Apple's no-bounce spring (tokens). */
const GLIDE = spring(motion.tab.glide);
const PILL = SLOT_HEIGHT + PAD * 2;
/** iOS 26 draws real Liquid Glass; earlier versions get solid paper. */
const GLASS = isLiquidGlassAvailable();

/** The tabs the bar knows (their order is the layout's: Jobs, Tracker,
 * Search, You); routes it doesn't know stay hidden. The name is for
 * VoiceOver only. */
const TABS: Record<string, { icon: IconName; label: string }> = {
  "(jobs)": { icon: "jobs", label: "Jobs" },
  "(library)": { icon: "tracker", label: "Tracker" },
  "(search)": { icon: "search", label: "Search" },
  "(you)": { icon: "you", label: "You" },
};
/** The lit icon's stroke, a touch heavier than the 1.75 at rest (owner, 2026-10-12). */
const LIT_STROKE = 2;

/** 0 is the full bar; 1 is the smaller one it becomes while you scroll down
 * (owner, 2026-10-14, as iOS 26 tucks its tab bar away). */
const compact = makeMutable(0);
/** The bar at its smallest, shrinking towards the bottom edge. */
const COMPACT_SCALE = 0.84;
/** How far a list must move in one direction before the bar follows it. */
const SCROLL_SLOP = 6;
/** Near the top of a list the bar is always full. */
const TOP_ZONE = 24;

function setCompact(next: boolean) {
  const target = next ? 1 : 0;
  if (compact.value === target) return;
  compact.value = withSpring(target, GLIDE);
}

/** A list a tab can send back to its top (a FlashList). */
interface TopScrollable {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
  getNativeScrollRef: () => { getNativeScrollRef: () => { measureInWindow: (callback: (x: number, y: number) => void) => void } | null } | null;
}

/** Spread onto a list under the tab bar (`{...useTabBarScroll()}`): scrolling
 * down shrinks the bar, scrolling up or reaching the top brings it back.
 * Given the list, tapping the tab you're on scrolls it back to the top, and
 * the list may be scrolled above zero (`scrollToOverflowEnabled`): React
 * Native otherwise stops a scroll at zero, short of the status bar's inset. */
export function useTabBarScroll(list?: RefObject<TopScrollable | null>) {
  const last = useRef(0);
  const insets = useSafeAreaInsets();
  const statusBar = useRef(insets.top);
  statusBar.current = insets.top;
  // The router's own scroll to the top goes to zero, which tucks the large
  // title under the clock: iOS insets a list by however much of the status
  // bar it sits under, and its scroll events don't report that inset, so
  // it's measured.
  const top = useRef({
    scrollToTop: () => {
      const target = list?.current;
      target?.getNativeScrollRef()?.getNativeScrollRef()?.measureInWindow((_x, y) =>
        target.scrollToOffset({ offset: -Math.max(0, statusBar.current - y), animated: true }));
    },
  });
  useScrollToTop(top);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const y = contentOffset.y + Math.max(0, contentInsetTop(event));
    const moved = y - last.current;
    last.current = y;
    // The bounce past the end isn't a change of direction.
    if (contentOffset.y + layoutMeasurement.height > contentSize.height) return;
    if (y <= TOP_ZONE) setCompact(false);
    else if (moved > SCROLL_SLOP) setCompact(true);
    else if (moved < -SCROLL_SLOP) setCompact(false);
  }, []);
  return list ? { onScroll, scrollEventThrottle: 16, scrollToOverflowEnabled: true } : { onScroll, scrollEventThrottle: 16 };
}

/** Lists that adjust for the status bar start at minus its height. */
function contentInsetTop(event: NativeSyntheticEvent<NativeScrollEvent>) {
  return event.nativeEvent.contentInset?.top ?? 0;
}

/** The pill's distance from the bottom edge: just above the home indicator. */
function pillBottom(insetBottom: number) {
  return Math.max(insetBottom - 7, 12);
}

/** Space a screen leaves under its content so the last row clears the pill. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return pillBottom(insets.bottom) + PILL + 12;
}

/** How wide a tab is: 56, or the 64 oval while it's lit. */
function slotWidth(lit: boolean) {
  "worklet";
  return lit ? LIT : PITCH;
}

/**
 * Pinkslip's own tab bar (Paper "Tab bar · Oct 12" C): a small floating pill
 * of glass. The tab you're on grows into a soft oval around its pink icon;
 * the others are icons. Press and slide along the bar to light each tab in
 * turn, ticking as you pass; let go to open it. Scrolling a list down
 * shrinks the bar. The job page and an application's have their own pinned
 * buttons, so the bar steps aside there.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const onJobPage = /^\/(jobs|applications)\/[^/]+$/.test(usePathname());
  // Toasts sit 12 above the pill; the job page's own bar takes over there.
  useToastLift(onJobPage ? null : pillBottom(insets.bottom) + PILL);
  const tabs = state.routes.filter((route) => TABS[route.name]);
  const selected = tabs.findIndex((route) => route.key === state.routes[state.index]?.key);
  const [hover, setHover] = useState<number | null>(null);
  const hovered = useSharedValue(-1);

  useEffect(() => {
    // A new tab starts with the full bar.
    if (selected >= 0) setCompact(false);
  }, [selected]);

  const open = (index: number, feedback: boolean) => {
    const route = tabs[index];
    if (!route) return;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (index !== selected && !event.defaultPrevented) {
      if (feedback) haptics.tap();
      navigation.navigate(route.name, route.params);
    }
  };
  // The drag is rebuilt as tabs change; it reaches today's handlers through here.
  const latest = useRef({ open, setHover });
  latest.current = { open, setHover };

  // Where each tab starts along the pill as it rests now, for the drag.
  const widths = tabs.map((_route, index) => slotWidth(index === selected));
  const drag = useMemo(() => {
    const showHover = (index: number | null) => latest.current.setHover(index);
    const release = (index: number) => {
      latest.current.setHover(null);
      latest.current.open(index, false);
    };
    const nearest = (x: number) => {
      "worklet";
      let start = PAD;
      for (let index = 0; index < widths.length; index += 1) {
        const end = start + widths[index]!;
        if (x < end) return index;
        start = end;
      }
      return widths.length - 1;
    };
    return Gesture.Pan().activeOffsetX([-8, 8]).onBegin(() => {
      // A finger on the small bar brings the full one back.
      compact.value = withSpring(0, GLIDE);
    }).onStart((event) => {
      hovered.value = nearest(event.x);
      scheduleOnRN(showHover, hovered.value);
    }).onUpdate((event) => {
      const index = nearest(event.x);
      if (index !== hovered.value) {
        hovered.value = index;
        scheduleOnRN(showHover, index);
        scheduleOnRN(haptics.tick);
      }
    }).onEnd((event) => {
      scheduleOnRN(release, nearest(event.x));
      hovered.value = -1;
    }).onFinalize(() => {
      // Cancelled mid-drag (a call, the app leaving): nothing changes.
      if (hovered.value === -1) return;
      hovered.value = -1;
      scheduleOnRN(showHover, null);
    });
    // Rebuilt when a tab's width changes; `widths` is read through its key.
  }, [widths.join(","), hovered]);

  const size = useAnimatedStyle(() => ({ transform: [{ scale: 1 - (1 - COMPACT_SCALE) * compact.value }] }));
  if (onJobPage) return null;

  const lit = hover ?? selected;
  const bottom = pillBottom(insets.bottom);
  return <View pointerEvents="box-none" style={[styles.bar, { paddingBottom: bottom }]}>
    <GestureDetector gesture={drag}>
      <Animated.View style={[styles.shrink, size]}>
        <GlassView glassEffectStyle="regular" isInteractive style={[styles.pill, !GLASS && styles.paper]} accessibilityRole="tablist">
          {tabs.map((route, index) => {
            const tab = TABS[route.name]!;
            return <TabSlot key={route.key} icon={tab.icon} label={tab.label}
              selected={index === selected} lit={index === lit} onPress={() => open(index, true)} />;
          })}
        </GlassView>
      </Animated.View>
    </GestureDetector>
  </View>;
}

/** One tab. Lit, it widens into the oval with its icon in the middle. */
function TabSlot({ icon, label, selected, lit, onPress }: {
  icon: IconName;
  label: string;
  selected: boolean;
  lit: boolean;
  onPress: () => void;
}) {
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => { on.value = withSpring(selected ? 1 : 0, GLIDE); }, [selected, on]);

  const box = useAnimatedStyle(() => ({ width: PITCH + (LIT - PITCH) * on.value }));
  const oval = useAnimatedStyle(() => ({ opacity: on.value }));
  const mark = useAnimatedStyle(() => ({ transform: [{ translateX: ((LIT - PITCH) / 2) * on.value }] }));

  return <Pressable onPress={onPress} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }}>
    <Animated.View style={[styles.slot, box]}>
      <Animated.View pointerEvents="none" style={[styles.oval, oval]} />
      {/* The outline icon; lit, it's pink and a touch heavier, and Tracker's
          end dot fills in (owner, 2026-10-12). */}
      <Animated.View style={[styles.icon, mark]}>
        {lit
          ? <Icon name={icon} size={ICON} tone="accent" stroke={LIT_STROKE} weight={icon === "tracker" ? "fill" : "line"} />
          : <Icon name={icon} size={ICON} tone="ink-2" />}
      </Animated.View>
    </Animated.View>
  </Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "flex-end" },
  // It shrinks towards the bottom edge, staying on the home indicator.
  shrink: { transformOrigin: "bottom" },
  pill: { flexDirection: "row", padding: PAD, borderRadius: PILL / 2 },
  paper: { backgroundColor: theme.ui.color["bg-elev"], boxShadow: theme.ui.shadow.pill },
  slot: { height: SLOT_HEIGHT, overflow: "hidden", borderRadius: SLOT_HEIGHT / 2, borderCurve: "continuous" },
  oval: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.ui.color.pill },
  icon: { position: "absolute", left: ICON_INSET, top: (SLOT_HEIGHT - ICON) / 2 },
}));
