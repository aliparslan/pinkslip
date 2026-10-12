import { useSession } from "@pinkslip/data";
import { usePathname } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { haptics } from "../platform/haptics";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

const SLOT = { width: 52, height: 46 };
const PAD = 5;
const PILL = SLOT.height + PAD * 2;
/** How far the fade reaches above the pill, so rows slide under it softly. */
const FADE = 34;

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

/** "#rrggbb" at the given opacity, for the fade (a gradient from
 * `transparent` would pass through grey). */
function withAlpha(hex: string, alpha: number) {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function initials(name: string | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? "" : (parts[0]![0]! + (parts.length > 1 ? parts.at(-1)![0]! : "")).toUpperCase();
}

/**
 * Pinkslip's own tab bar (Paper page "Tab bar · Oct 12", option C): a small
 * floating paper pill with icons only. The selected tab sits on a soft
 * circle with its filled icon; You is your initials. The job page has its
 * own pinned Save and Apply, so the bar steps aside there.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const name = useSession().data?.me?.user?.name;
  const onJobPage = /^\/jobs\/[^/]+$/.test(usePathname());
  if (onJobPage) return null;

  const bottom = pillBottom(insets.bottom);
  const fade = `linear-gradient(180deg, ${withAlpha(theme.ui.color.bg, 0)} 0%, ${withAlpha(theme.ui.color.bg, 1)} 55%)`;
  return <View pointerEvents="box-none" style={[styles.bar, { height: bottom + PILL + FADE, paddingBottom: bottom, experimental_backgroundImage: fade }]}>
    <View style={styles.pill} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const press = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            haptics.tap();
            navigation.navigate(route.name, route.params);
          }
        };
        const mark = initials(name);
        return <Pressable key={route.key} onPress={press} accessibilityRole="tab" accessibilityLabel={tab.label}
          accessibilityState={{ selected: focused }} style={[styles.slot, focused && styles.on]}>
          {tab.icon === "you" && mark
            ? <View style={styles.avatar}><Text role="footnote" weight="medium" tone="ink-2">{mark}</Text></View>
            : <Icon name={tab.icon} size={24} tone={focused ? "ink" : "ink-2"} weight={focused ? (tab.icon === "search" ? "bold" : "fill") : "regular"} />}
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "flex-end" },
  pill: {
    flexDirection: "row",
    gap: 4,
    padding: PAD,
    borderRadius: 999,
    backgroundColor: theme.ui.color["bg-elev"],
    boxShadow: theme.ui.shadow.pill,
  },
  slot: { width: SLOT.width, height: SLOT.height, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  on: { backgroundColor: theme.ui.color.fill },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ui.color.separator,
  },
}));
