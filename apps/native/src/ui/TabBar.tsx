import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { usePathname } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { haptics } from "../platform/haptics";
import { Icon, type IconName } from "./Icon";
import { motion, spring } from "./motion";

/** Wider than tall, so the selected tab sits in an oval, not a circle. */
const SLOT = { width: 64, height: 46 };
const PAD = 5;
const GAP = 2;
/** The oval glides to the tab you pick on Apple's no-bounce spring (tokens). */
const GLIDE = spring(motion.tab.glide);
const PILL = SLOT.height + PAD * 2;
/** iOS 26 draws real Liquid Glass; earlier versions get solid paper. */
const GLASS = isLiquidGlassAvailable();

/** The tabs in the bar, in order; routes the bar doesn't know stay hidden. */
const TABS: Record<string, { icon: IconName; label: string }> = {
  "(jobs)": { icon: "jobs", label: "Jobs" },
  "(search)": { icon: "search", label: "Search" },
  "(library)": { icon: "tracker", label: "Tracker" },
  "(you)": { icon: "you", label: "You" },
};

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
 * tab to tab, with its filled icon. The job page has its own pinned Save
 * and Apply, so the bar steps aside there.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const onJobPage = /^\/jobs\/[^/]+$/.test(usePathname());
  const tabs = state.routes.filter((route) => TABS[route.name]);
  const selected = tabs.findIndex((route) => route.key === state.routes[state.index]?.key);
  const x = useSharedValue(slotX(Math.max(selected, 0)));
  const placed = useRef(false);
  useEffect(() => {
    if (selected < 0) return;
    // In place on the first frame; after that it glides.
    x.value = placed.current ? withSpring(slotX(selected), GLIDE) : slotX(selected);
    placed.current = true;
  }, [selected, x]);
  const oval = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (onJobPage) return null;

  const bottom = pillBottom(insets.bottom);
  return <View pointerEvents="box-none" style={[styles.bar, { paddingBottom: bottom }]}>
    <GlassView glassEffectStyle="regular" isInteractive style={[styles.pill, !GLASS && styles.paper]} accessibilityRole="tablist">
      {selected >= 0 ? <Animated.View pointerEvents="none" style={[styles.oval, oval]} /> : null}
      {tabs.map((route) => {
        const tab = TABS[route.name]!;
        const focused = route.key === state.routes[state.index]?.key;
        const press = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            haptics.tap();
            navigation.navigate(route.name, route.params);
          }
        };
        return <Pressable key={route.key} onPress={press} accessibilityRole="tab" accessibilityLabel={tab.label}
          accessibilityState={{ selected: focused }} style={styles.slot}>
          {/* The magnifier has no filled form worth showing; the oval marks it. */}
          <Icon name={tab.icon} size={24} tone={focused ? "ink" : "ink-2"} weight={focused && tab.icon !== "search" ? "fill" : "line"} />
        </Pressable>;
      })}
    </GlassView>
  </View>;
}

/** Where the oval sits under the tab at this index. */
function slotX(index: number) {
  return index * (SLOT.width + GAP);
}

const styles = StyleSheet.create((theme) => ({
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "flex-end" },
  pill: { flexDirection: "row", gap: GAP, padding: PAD, borderRadius: PILL / 2 },
  paper: { backgroundColor: theme.ui.color["bg-elev"], boxShadow: theme.ui.shadow.pill },
  slot: { width: SLOT.width, height: SLOT.height, alignItems: "center", justifyContent: "center" },
  oval: {
    position: "absolute",
    top: PAD,
    left: PAD,
    width: SLOT.width,
    height: SLOT.height,
    borderRadius: SLOT.height / 2,
    backgroundColor: theme.ui.color.pill,
  },
}));
