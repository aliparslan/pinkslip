import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { usePathname } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "../platform/haptics";
import { Icon, type IconName } from "./Icon";
import { motion, project, rubberBand, spring } from "./motion";
import { useToastLift } from "./Toast";

/** Icons sit 56 apart (Paper "C · Closer icons, pink outline, drag"). The
 * oval under the selected one is wider than that, so it's an oval, not a
 * circle, and it reaches a little past its icon's slot. */
const PITCH = 56;
const OVAL = { width: 64, height: 46 };
const PAD = 5;
/** Room at each end of the pill for the oval to sit under the end icons. */
const PAD_X = PAD + (OVAL.width - PITCH) / 2;
/** The oval glides to the tab you pick on Apple's no-bounce spring (tokens). */
const GLIDE = spring(motion.tab.glide);
const PILL = OVAL.height + PAD * 2;
/** iOS 26 draws real Liquid Glass; earlier versions get solid paper. */
const GLASS = isLiquidGlassAvailable();

/** The tabs the bar knows (their order is the layout's: Jobs, Tracker,
 * Search, You); routes it doesn't know stay hidden. */
const TABS: Record<string, { icon: IconName; label: string }> = {
  "(jobs)": { icon: "jobs", label: "Jobs" },
  "(library)": { icon: "tracker", label: "Tracker" },
  "(search)": { icon: "search", label: "Search" },
  "(you)": { icon: "you", label: "You" },
};
/** The lit icon's stroke, a touch heavier than the 1.75 at rest (owner, 2026-10-12). */
const LIT_STROKE = 2;

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
 * Pinkslip's own tab bar (Paper page "Tab bar · Oct 12", option C): a small
 * floating pill of glass with icons only, so rows show through as they
 * scroll under it. The selected tab sits in a soft oval that glides from
 * tab to tab, its icon in pink. Press and slide along the bar and the oval
 * follows your finger, ticking as it passes each tab; let go and it settles
 * on the nearest one (or where a flick was heading) and opens it. The job
 * page and an application's have their own pinned buttons, so the bar steps
 * aside there.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const onJobPage = /^\/(jobs|applications)\/[^/]+$/.test(usePathname());
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
    return Gesture.Pan().activeOffsetX([-8, 8]).onStart((event) => {
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
  if (onJobPage) return null;

  const lit = hover ?? selected;
  const bottom = pillBottom(insets.bottom);
  return <View pointerEvents="box-none" style={[styles.bar, { paddingBottom: bottom }]}>
    <GestureDetector gesture={drag}>
      <GlassView glassEffectStyle="regular" isInteractive style={[styles.pill, !GLASS && styles.paper]} accessibilityRole="tablist">
        {selected >= 0 ? <Animated.View pointerEvents="none" style={[styles.oval, oval]} /> : null}
        {tabs.map((route, index) => {
          const tab = TABS[route.name]!;
          return <Pressable key={route.key} onPress={() => open(index, true)} accessibilityRole="tab" accessibilityLabel={tab.label}
            accessibilityState={{ selected: index === selected }} style={styles.slot}>
            {/* The outline icon; lit, it's pink and a touch heavier, and Tracker's
                end dot fills in (owner, 2026-10-12). */}
            {index === lit
              ? <Icon name={tab.icon} size={24} tone="accent" stroke={LIT_STROKE} weight={tab.icon === "tracker" ? "fill" : "line"} />
              : <Icon name={tab.icon} size={24} tone="ink-2" />}
          </Pressable>;
        })}
      </GlassView>
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
  pill: { flexDirection: "row", paddingVertical: PAD, paddingHorizontal: PAD_X, borderRadius: PILL / 2 },
  paper: { backgroundColor: theme.ui.color["bg-elev"], boxShadow: theme.ui.shadow.pill },
  slot: { width: PITCH, height: OVAL.height, alignItems: "center", justifyContent: "center" },
  oval: {
    position: "absolute",
    top: PAD,
    left: PAD,
    width: OVAL.width,
    height: OVAL.height,
    borderRadius: OVAL.height / 2,
    backgroundColor: theme.ui.color.pill,
  },
}));
