import { useSyncExternalStore } from "react";
import type { BottomTabNavigationOptions } from "expo-router/js-tabs";
import { storage } from "../platform/storage";

/**
 * How a tab's content arrives when you switch tabs, being compared in the
 * kit. Still is the app so far and what iOS's own tab bars do; Shift is
 * React Navigation's own slide. Family's short slide was tried and dropped
 * (owner, 2026-11-08: "keep the non family transitions for now"; it's in
 * git at 459d780 if it comes back). The pick is kept on this phone across
 * launches, so it can be lived with for a few days before it's decided: a
 * tab switch happens dozens of times a day, the kind of motion that starts
 * to feel slow after a while.
 */
export type TabMotion = "still" | "shift";

export const TAB_MOTIONS: { id: TabMotion; title: string; detail: string }[] = [
  { id: "still", title: "Still", detail: "What the app does now, as iOS's own apps do" },
  { id: "shift", title: "Shift", detail: "React Navigation's own: farther and quicker, the two tabs cross-fading" },
];

const KEY = "kit-tab-motion";
const listeners = new Set<() => void>();

function read(): TabMotion {
  const value = storage.getString(KEY);
  return value === "shift" ? value : "still";
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

/** The options a tab navigator takes for each. If Shift is kept, its
 * values move to `uiMotion` in tokens.ts. */
export function tabTransition(kind: TabMotion): TabTransition {
  if (kind === "shift") return { animation: "shift" };
  return { animation: "none" };
}
