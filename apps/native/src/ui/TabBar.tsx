import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { usePathname, useScrollToTop } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { makeMutable, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "../platform/haptics";
import { Badge } from "./Badge";
import { Icon, type IconName } from "./Icon";
import { motion, project, rubberBand, spring } from "./motion";
import { useToastLift } from "./Toast";

/** A tab is a 56 slot with its 24 icon in the middle (Paper "C · Closer
 * icons, pink outline, drag"). */
const PITCH = 56;
const ICON = 24;
const SLOT_HEIGHT = 46;
/** The tab you're on is a 64 oval around its icon, with no name (owner,
 * 2026-10-15: the names from "Tab bar labels · Oct 14" went). */
const LIT = 64;
const PAD = 5;
/** Room at each end of the pill for the oval to sit under the end icons. */
const PAD_X = PAD + (LIT - PITCH) / 2;
/** The oval glides to the tab you pick on Apple's no-bounce spring (tokens). */
const GLIDE = spring(motion.tab.glide);
const PILL = SLOT_HEIGHT + PAD * 2;
/** iOS 26 draws real Liquid Glass; earlier versions get solid paper. */
const GLASS = isLiquidGlassAvailable();

/** The tabs the bar knows (their order is the layout's: Today, Jobs,
 * Tracker, Search, You); routes it doesn't know stay hidden. The name is for
 * VoiceOver only. */
const TABS: Record<string, { icon: IconName; label: string }> = {
  "(today)": { icon: "today", label: "Today" },
  "(jobs)": { icon: "jobs", label: "Jobs" },
  "(library)": { icon: "tracker", label: "Tracker" },
  "(search)": { icon: "search", label: "Search" },
  "(you)": { icon: "you", label: "You" },
};

/** Pages with their own pinned action (Add experience, Send) ask the bar to
 * step aside while they're in front (owner, 2026-10-14). */
const asides = new Set<symbol>();
const asideListeners = new Set<() => void>();
function setAside(key: symbol, on: boolean) {
  if (on === asides.has(key)) return;
  if (on) asides.add(key);
  else asides.delete(key);
  for (const listener of asideListeners) listener();
}

/** While `active`, the tab bar steps aside for this page's pinned bar. */
export function useTabBarStepsAside(active: boolean) {
  const [key] = useState(() => Symbol("aside"));
  useEffect(() => {
    setAside(key, active);
    return () => setAside(key, false);
  }, [key, active]);
}

/** Whether a page has asked the bar to step aside. */
export function useTabBarSteppedAside(): boolean {
  return useSyncExternalStore((listener) => { asideListeners.add(listener); return () => asideListeners.delete(listener); }, () => asides.size > 0);
}

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

/**
 * Pinkslip's own tab bar (Paper "Tab bar · Oct 12" C): a small floating pill
 * of glass. The tab you're on sits in a soft oval that glides from tab to
 * tab, its icon in pink. Press and slide along the bar and the oval follows
 * your finger, ticking as it passes each tab; let go and it settles on the
 * nearest one (or where a flick was heading) and opens it. Scrolling a list
 * down shrinks the bar. The job page and an application's have their own
 * pinned buttons, so the bar steps aside there.
 */
export function TabBar({ state, navigation, badges }: BottomTabBarProps & {
  /** A pink count on a tab, by route: Today's is what needs you. */
  badges?: Record<string, number>;
}) {
  const insets = useSafeAreaInsets();
  const steppedAside = useTabBarSteppedAside();
  const onJobPage = /^\/(jobs|applications)\/[^/]+$/.test(usePathname()) || steppedAside;
  // Toasts sit 12 above the pill; the job page's own bar takes over there.
  useToastLift(onJobPage ? null : pillBottom(insets.bottom) + PILL);
  const tabs = state.routes.filter((route) => TABS[route.name]);
  const selected = tabs.findIndex((route) => route.key === state.routes[state.index]?.key);
  const count = tabs.length;

  // At rest the oval is at `x`. While dragging it's under the finger, plus an
  // offset that eases to nothing, so it slides over rather than jumping.
  const x = useSharedValue(slotX(Math.max(selected, 0)));
  const dragging = useSharedValue(false);
  const finger = useSharedValue(0);
  const offset = useSharedValue(0);
  const current = useSharedValue(Math.max(selected, 0));
  const hovered = useSharedValue(-1);
  const [hover, setHover] = useState<number | null>(null);

  const placed = useRef(false);
  useEffect(() => {
    if (selected < 0) return;
    current.value = selected;
    // A new tab starts with the full bar.
    setCompact(false);
    // In place on the first frame; after that it glides.
    x.value = placed.current ? withSpring(slotX(selected), GLIDE) : slotX(selected);
    placed.current = true;
  }, [selected, x, current]);

  const open = (index: number, feedback: boolean) => {
    const route = tabs[index];
    if (!route) return;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (index !== selected && !event.defaultPrevented) {
      if (feedback) haptics.tap();
      navigation.navigate(route.name, route.params);
    }
  };
  // The drag is built once per tab count; it reaches today's tabs through here.
  const latest = useRef({ open, setHover });
  latest.current = { open, setHover };

  const drag = useMemo(() => {
    const showHover = (index: number | null) => latest.current.setHover(index);
    const release = (index: number) => {
      latest.current.setHover(null);
      latest.current.open(index, false);
    };
    /** The oval's x for a finger at `eventX` on the pill, stretching past the ends. */
    const along = (eventX: number) => {
      "worklet";
      const raw = eventX - PAD_X - PITCH / 2;
      const max = (count - 1) * PITCH;
      if (raw < 0) return -rubberBand(-raw, PITCH);
      if (raw > max) return max + rubberBand(raw - max, PITCH);
      return raw;
    };
    const nearest = (at: number) => {
      "worklet";
      return Math.min(Math.max(Math.round(at / PITCH), 0), count - 1);
    };
    return Gesture.Pan().activeOffsetX([-8, 8]).onBegin(() => {
      // A finger on the small bar brings the full one back.
      compact.value = withSpring(0, GLIDE);
    }).onStart((event) => {
      finger.value = along(event.x);
      offset.value = x.value - finger.value;
      offset.value = withSpring(0, GLIDE);
      dragging.value = true;
      hovered.value = nearest(x.value);
      scheduleOnRN(showHover, hovered.value);
    }).onUpdate((event) => {
      finger.value = along(event.x);
      const index = nearest(finger.value + offset.value);
      if (index !== hovered.value) {
        hovered.value = index;
        scheduleOnRN(showHover, index);
        scheduleOnRN(haptics.tick);
      }
    }).onEnd((event) => {
      const at = finger.value + offset.value;
      const index = nearest(at + project(event.velocityX));
      dragging.value = false;
      x.value = at;
      x.value = withSpring(slotX(index), { ...GLIDE, velocity: event.velocityX });
      hovered.value = -1;
      scheduleOnRN(release, index);
    }).onFinalize(() => {
      // Cancelled mid-drag (a call, the app leaving): back to where it was.
      if (!dragging.value) return;
      x.value = finger.value + offset.value;
      dragging.value = false;
      x.value = withSpring(slotX(current.value), GLIDE);
      hovered.value = -1;
      scheduleOnRN(showHover, null);
    });
  }, [count, x, dragging, finger, offset, current, hovered]);

  const oval = useAnimatedStyle(() => ({
    transform: [{ translateX: dragging.value ? finger.value + offset.value : x.value }],
  }));
  const size = useAnimatedStyle(() => ({ transform: [{ scale: 1 - (1 - COMPACT_SCALE) * compact.value }] }));
  if (onJobPage) return null;

  const lit = hover ?? selected;
  const bottom = pillBottom(insets.bottom);
  return <View pointerEvents="box-none" style={[styles.bar, { paddingBottom: bottom }]}>
    <GestureDetector gesture={drag}>
      <Animated.View style={[styles.shrink, size]}>
        <GlassView glassEffectStyle="regular" isInteractive style={[styles.pill, !GLASS && styles.paper]} accessibilityRole="tablist">
          {selected >= 0 ? <Animated.View pointerEvents="none" style={[styles.oval, oval]} /> : null}
          {tabs.map((route, index) => {
            const tab = TABS[route.name]!;
            const badge = badges?.[route.name];
            return <Pressable key={route.key} onPress={() => open(index, true)} accessibilityRole="tab"
              accessibilityLabel={badge ? `${tab.label}, ${badge} need you` : tab.label}
              accessibilityState={{ selected: index === selected }} style={styles.slot}>
              <View>
                {/* The outline icon; lit, it's pink and a touch heavier, and
                    Tracker's end dot fills in (owner, 2026-10-12). */}
                {index === lit
                  ? <Icon name={tab.icon} size={ICON} tone="accent" lit weight={tab.icon === "tracker" ? "fill" : "line"} />
                  : <Icon name={tab.icon} size={ICON} tone="ink-2" />}
                {/* The count rides on the icon's top right (System, the tab bar part). */}
                {badge ? <View style={styles.badge} pointerEvents="none"><Badge count={badge} /></View> : null}
              </View>
            </Pressable>;
          })}
        </GlassView>
      </Animated.View>
    </GestureDetector>
  </View>;
}

/** Where the oval sits under the tab at this index. */
function slotX(index: number) {
  "worklet";
  return index * PITCH;
}

const styles = StyleSheet.create((theme) => ({
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "flex-end" },
  // It shrinks towards the bottom edge, staying on the home indicator.
  shrink: { transformOrigin: "bottom" },
  pill: { flexDirection: "row", paddingVertical: PAD, paddingHorizontal: PAD_X, borderRadius: PILL / 2 },
  paper: { backgroundColor: theme.ui.color["bg-elev"], boxShadow: theme.ui.shadow.pill },
  slot: { width: PITCH, height: SLOT_HEIGHT, alignItems: "center", justifyContent: "center" },
  oval: {
    position: "absolute", top: PAD, left: PAD, width: LIT, height: SLOT_HEIGHT,
    borderRadius: SLOT_HEIGHT / 2, borderCurve: "continuous", backgroundColor: theme.ui.color.pill,
  },
  badge: { position: "absolute", left: 10, top: -8 },
}));
