import { useSyncExternalStore } from "react";
import { Easing } from "react-native";
import type { BottomTabNavigationOptions } from "expo-router/js-tabs";
import { storage } from "../platform/storage";

/**
 * How a tab's content arrives when you switch tabs, being compared in the
 * kit (owner, 2026-11-08: "lets try out family's"). Still is the app so far
 * and what iOS's own tab bars do; Family's content moves a short way in the
 * direction of the tab you picked (docs/research/benji-taylor.md). The pick
 * is kept on this phone across launches, so it can be lived with for a few
 * days before it's decided: a tab switch happens dozens of times a day, the
 * kind of motion that starts to feel slow after a while.
 */
export type TabMotion = "still" | "family" | "shift";

export const TAB_MOTIONS: { id: TabMotion; title: string; detail: string }[] = [
  { id: "still", title: "Still", detail: "What the app does now, as iOS's own apps do" },
  { id: "family", title: "Family", detail: "A short slide in the direction of the tab you picked" },
  { id: "shift", title: "Shift", detail: "React Navigation's own: farther and quicker, the two tabs cross-fading" },
];

const KEY = "kit-tab-motion";
const listeners = new Set<() => void>();

function read(): TabMotion {
  const value = storage.getString(KEY);
  return value === "family" || value === "shift" ? value : "still";
}

export function setTabMotion(next: TabMotion) {
  if (next === "still") storage.remove(KEY);
  else storage.set(KEY, next);
  for (const listener of listeners) listener();
}

export function useTabMotion(): TabMotion {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, read);
}

type TabTransition = Pick<BottomTabNavigationOptions, "animation" | "transitionSpec" | "sceneStyleInterpolator">;

/** The options a tab navigator takes for each. A screen's progress is -1
 * left of the tab in front, 0 in front and 1 right of it, so the same
 * mapping moves both tabs the right way. Values are candidates; the one
 * kept moves to `uiMotion` in tokens.ts. */
export function tabTransition(kind: TabMotion): TabTransition {
  if (kind === "family") return {
    animation: "shift",
    // Fast at the start, so the tap feels answered at once.
    transitionSpec: { animation: "timing", config: { duration: 240, easing: Easing.bezier(0.23, 1, 0.32, 1) } },
    sceneStyleInterpolator: ({ current }) => ({
      sceneStyle: {
        // The new tab, drawn over the old one, fades in over the first 15%
        // of its move and glides the rest; the old one stays solid under it
        // until it's covered. The new tab's animation starts a frame or two
        // after the old one's, so any mapping that faded the old tab early
        // showed an empty page between them (four takes on the 17e, Nov 8).
        opacity: current.progress.interpolate({ inputRange: [-1, -0.85, 0, 0.85, 1], outputRange: [0, 1, 1, 1, 0] }),
        transform: [{ translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-40, 0, 40] }) }],
      },
    }),
  };
  if (kind === "shift") return { animation: "shift" };
  return { animation: "none" };
}
