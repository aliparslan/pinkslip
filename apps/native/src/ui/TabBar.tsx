import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useNavigation, usePathname, useRoute, useScrollToTop, useSegments } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { Animated as RNAnimated, Pressable, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  makeMutable, useAnimatedStyle, useSharedValue, withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTransitionProgress } from "react-native-screens";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
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

/** Routes whose page hides the bar: the ones with their own pinned bar, and
 * Search, whose field sits at the bottom. */
const HIDES_BAR = /^(jobs|applications|events)\/\[|^search$/;

/** A stack screen's native transition: `progress` 0 to 1 as it comes or
 * goes, `closing` 1 when it's going. */
interface Transition {
  progress: RNAnimated.Value;
  closing: RNAnimated.Value;
}
/** Each tab stack screen's transition, by route key. */
const transitions = new Map<string, Transition>();

/** Each tab stack's `screenLayout`: the screen, and a note of its transition
 * for the bar. */
export function tabStackScreenLayout({ route, children }: { route: { key: string }; children: React.ReactElement }) {
  return <>{children}<TransitionSource routeKey={route.key} /></>;
}

/** On its own beside the screen: the stack hands out the transition as a
 * new object each render, so whatever reads it re-renders with the stack. */
function TransitionSource({ routeKey }: { routeKey: string }) {
  const { progress, closing } = useTransitionProgress();
  useEffect(() => {
    const transition = { progress, closing };
    transitions.set(routeKey, transition);
    return () => {
      if (transitions.get(routeKey) === transition) transitions.delete(routeKey);
    };
  }, [routeKey, progress, closing]);
  return null;
}

/** A page that hides the bar hands it the transition of the list under it,
 * so the bar leaves and comes back with that list, following the finger on
 * a swipe back (owner, 2026-10-24: it popped in over the page's bar on Back,
 * and only after a swipe back had finished). The list's own transition,
 * because a page you go back from is gone from React at once: iOS slides a
 * picture of it. */
interface Follower extends Transition {
  /** The tab the page is in ("(jobs)"); the bar follows only that tab's. */
  tab: string;
}
const followers: Follower[] = [];
const followerListeners = new Set<() => void>();
function followersChanged() {
  for (const listener of followerListeners) listener();
}

/** In a tab stack screen whose page hides the bar: the bar slides with the
 * page underneath as this one comes and goes. It renders nothing. */
export function TabBarFollowsTransition() {
  const route = useRoute();
  const navigation = useNavigation();
  // The tab this page opened in and the page under it, read once: the URL
  // moves on when you switch tabs.
  const segments = useSegments() as readonly string[];
  const [tab] = useState(() => segments[1] ?? "(jobs)");
  const [below] = useState(() => {
    const routes = navigation.getState()?.routes ?? [];
    const index = routes.findIndex((entry) => entry.key === route.key);
    const under = index > 0 ? routes[index - 1]! : null;
    // Under another page that hides the bar, it stays hidden.
    return under && !HIDES_BAR.test(under.name) ? transitions.get(under.key) ?? null : null;
  });
  useEffect(() => {
    if (!below) return;
    const follower: Follower = { tab, ...below };
    followers.push(follower);
    followersChanged();
    return () => unfollowOnceIn(follower);
    // Once per page: its tab and what's under it don't change while it's up.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** A list at rest, for the bar with nothing to follow. Its place always
 * comes from the native driver: a view the native driver last moved keeps
 * that place when its style stops naming it, so leaving the bar plain after
 * a page (switching tabs from one, say) left it hidden. */
let atRest: Transition | null = null;
function restingList(): Transition {
  if (atRest) return atRest;
  atRest = { progress: new RNAnimated.Value(1), closing: new RNAnimated.Value(0) };
  // Hands the values to the native driver, where the transitions are.
  RNAnimated.parallel([
    RNAnimated.timing(atRest.progress, { toValue: 1, duration: 0, useNativeDriver: true }),
    RNAnimated.timing(atRest.closing, { toValue: 0, duration: 0, useNativeDriver: true }),
  ]).start();
  return atRest;
}

/** The page has gone, and the list under it is sliding back in: the bar
 * stays with the list until it's all the way in, so it lets go at rest. */
function unfollowOnceIn(follower: Follower) {
  let progress = 0;
  let closing = 1;
  const done = () => {
    clearTimeout(timeout);
    follower.progress.removeListener(onProgress);
    follower.closing.removeListener(onClosing);
    const at = followers.indexOf(follower);
    if (at >= 0) followers.splice(at, 1);
    followersChanged();
  };
  const check = () => {
    if (progress >= 1 && closing === 0) done();
  };
  const onProgress = follower.progress.addListener(({ value }) => { progress = value; check(); });
  const onClosing = follower.closing.addListener(({ value }) => { closing = value; check(); });
  // A swipe back has already finished, and nothing more comes.
  const timeout = setTimeout(done, 1000);
}

/** The newest page following in this tab, if any. */
function useFollower(tab: string | undefined): Follower | null {
  return useSyncExternalStore(
    (listener) => { followerListeners.add(listener); return () => followerListeners.delete(listener); },
    () => (tab ? [...followers].reverse().find((follower) => follower.tab === tab) ?? null : null),
  );
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
 * down shrinks the bar, scrolling up or reaching the top brings it back. A
 * tab root passes its `useTopEdge()` so the blur behind the clock follows.
 * Given the list, tapping the tab you're on scrolls it back to the top, and
 * the list may be scrolled above zero (`scrollToOverflowEnabled`): React
 * Native otherwise stops a scroll at zero, short of the status bar's inset. */
export function useTabBarScroll(list?: RefObject<TopScrollable | null>, edge?: { onScrollY: (y: number) => void }) {
  const last = useRef(0);
  const topEdge = useRef(edge);
  topEdge.current = edge;
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
    // The blur behind the clock (TopEdgeBlur) shows once anything is under it.
    topEdge.current?.onScrollY(y);
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

/** How far from the bottom edge a control this tall sits so its middle is
 * on the pill's: where Search's field and X wait with the keyboard down. */
export function useTabBarLine(size: number) {
  const insets = useSafeAreaInsets();
  return pillBottom(insets.bottom) + (PILL - size) / 2;
}

/** Search is a quick lookup you leave with its X, back to the tab you were
 * on before it (owner, 2026-10-22, Paper "Search at the bottom · Oct 22").
 * The bar knows which tab that was. */
let backFromSearch: (() => void) | null = null;
export function leaveSearch() {
  backFromSearch?.();
}

const searchPressed = new Set<() => void>();
/** Called each time Search is picked in the bar, so its field can take the
 * keyboard; coming back to it from a page it opened doesn't call it. */
export function useSearchTabPress(callback: () => void) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    const listener = () => latest.current();
    searchPressed.add(listener);
    return () => { searchPressed.delete(listener); };
  }, []);
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
  const onJobPage = /^\/(jobs|applications|events)\/[^/]+$/.test(usePathname()) || steppedAside;
  // Toasts sit 12 above the pill; the job page's own bar takes over there.
  useToastLift(onJobPage ? null : pillBottom(insets.bottom) + PILL);
  const tabs = state.routes.filter((route) => TABS[route.name]);
  const selected = tabs.findIndex((route) => route.key === state.routes[state.index]?.key);
  const count = tabs.length;
  const { width: screen } = useWindowDimensions();
  const bottom = pillBottom(insets.bottom);

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

  // Search's X goes back to the tab you were on before it.
  const previous = useRef("(jobs)");
  const here = tabs[selected]?.name;
  useEffect(() => {
    if (here && here !== "(search)") previous.current = here;
  }, [here]);
  useEffect(() => {
    backFromSearch = () => navigation.navigate(previous.current);
    return () => { backFromSearch = null; };
  }, [navigation]);

  // Switching tabs is silent: no tap, and no tick while sliding along the
  // bar (owner, 2026-10-24).
  const open = (index: number) => {
    const route = tabs[index];
    if (!route) return;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (index !== selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    if (route.name === "(search)" && !event.defaultPrevented) for (const listener of searchPressed) listener();
  };
  // The drag is built once per tab count; it reaches today's tabs through here.
  const latest = useRef({ open, setHover });
  latest.current = { open, setHover };

  const drag = useMemo(() => {
    const showHover = (index: number | null) => latest.current.setHover(index);
    const release = (index: number) => {
      latest.current.setHover(null);
      latest.current.open(index);
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

  const follower = useFollower(tabs[selected]?.name);
  const follow = useMemo(() => followStyles(follower ?? restingList(), screen), [follower, screen]);

  // The pill is centred; scrolling down shrinks it towards the bottom edge.
  const pillWidth = count * PITCH + PAD_X * 2;
  const pillFrame = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - COMPACT_SCALE) * compact.value }],
  }));
  const oval = useAnimatedStyle(() => ({
    transform: [{ translateX: dragging.value ? finger.value + offset.value : x.value }],
  }));
  if (onJobPage && !follower) return null;

  const lit = hover ?? selected;
  // Over a page it's off to the side, behind the page's edge: out of reach.
  return <RNAnimated.View pointerEvents={onJobPage ? "none" : "box-none"} accessibilityElementsHidden={onJobPage}
    style={[styles.bar, { height: bottom + PILL }, follow.clip]}>
    <RNAnimated.View pointerEvents="box-none" style={[styles.fill, follow.content]}>
    <GestureDetector gesture={drag}>
      <Animated.View style={[styles.pillFrame, { bottom, left: (screen - pillWidth) / 2, width: pillWidth }, pillFrame]}>
        <GlassView glassEffectStyle="regular" isInteractive style={[styles.pill, !GLASS && styles.paper]} accessibilityRole="tablist">
          {selected >= 0 ? <Animated.View pointerEvents="none" style={[styles.oval, oval]} /> : null}
          <View style={styles.tabs}>
            {tabs.map((route, index) => {
              const tab = TABS[route.name]!;
              const badge = badges?.[route.name];
              return <Pressable key={route.key} onPress={() => open(index)} accessibilityRole="tab"
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
          </View>
        </GlassView>
      </Animated.View>
    </GestureDetector>
    </RNAnimated.View>
  </RNAnimated.View>;
}

/**
 * The bar's place while a hiding page comes or goes, from the transition of
 * the list under it, all on the native driver. The bar moves with the list's
 * 30% parallax, and a clip whose right edge is the page's left edge hides
 * what the page covers.
 */
function followStyles({ progress: p, closing: c }: Transition, width: number) {
  const scale = (value: RNAnimated.Animated, to: number) => (value as RNAnimated.Value).interpolate({ inputRange: [0, 1], outputRange: [0, to] });
  // How much of the list is showing: 1 - p as the page arrives (the list
  // closing), p as the page leaves (the list coming back), so p + c(1 - 2p).
  const shown = RNAnimated.add(p, RNAnimated.multiply(c, p.interpolate({ inputRange: [0, 1], outputRange: [1, -1] })));
  const hidden = RNAnimated.add(1, RNAnimated.multiply(shown, -1));
  return {
    clip: { transform: [{ translateX: scale(hidden, -width) }] },
    content: { transform: [{ translateX: scale(hidden, width * 0.7) }] },
  };
}

/** Where the oval sits under the tab at this index. */
function slotX(index: number) {
  "worklet";
  return index * PITCH;
}

const styles = StyleSheet.create((theme) => ({
  // It clips what a page arriving over it covers (see followStyles).
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, overflow: "hidden" },
  fill: { flex: 1 },
  // It shrinks towards the bottom edge, staying on the home indicator.
  pillFrame: { position: "absolute", height: PILL, transformOrigin: "bottom" },
  pill: { flex: 1, borderRadius: PILL / 2, overflow: "hidden" },
  paper: { backgroundColor: theme.ui.color["bg-elev"], boxShadow: theme.ui.shadow.pill },
  tabs: { position: "absolute", top: PAD, left: PAD_X, height: SLOT_HEIGHT, flexDirection: "row" },
  slot: { width: PITCH, height: SLOT_HEIGHT, alignItems: "center", justifyContent: "center" },
  oval: {
    position: "absolute", top: PAD, left: PAD, width: LIT, height: SLOT_HEIGHT,
    borderRadius: SLOT_HEIGHT / 2, borderCurve: "continuous", backgroundColor: theme.ui.color.pill,
  },
  badge: { position: "absolute", left: 10, top: -8 },
}));
