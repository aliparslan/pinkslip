import { useSyncExternalStore } from "react";
import { UnistylesRuntime } from "react-native-unistyles";
import { storage } from "../platform/storage";
import { themes } from "./themes";

/** The owner's page-color lab (docs/surfaces-research-2026-10-15.md, option
 * C): one light page for every screen, white for settings cards and what
 * floats, and a see-through gray for controls so they read on both. Light
 * mode only. "now" is today's tokens; nothing changes until the owner picks
 * another one in You. */
export type SurfaceChoice = "now" | "snow" | "mist" | "cloud" | "apple" | "paper";

export const surfaceChoices: { id: SurfaceChoice; title: string; page?: string }[] = [
  { id: "now", title: "White (now)" },
  { id: "snow", title: "Snow", page: "#fbfbfb" },
  { id: "mist", title: "Mist", page: "#f8f8f9" },
  { id: "cloud", title: "Cloud", page: "#f5f5f6" },
  { id: "apple", title: "Apple gray", page: "#f2f2f7" },
  { id: "paper", title: "Paper", page: "#faf9f5" },
];

const KEY = "surface-lab";
// Apple's fills are see-through so one control reads on white and on gray.
const FILL = "rgba(17, 17, 20, 0.055)";
const SEPARATOR = "rgba(17, 17, 20, 0.1)";
const listeners = new Set<() => void>();

export function surfaceChoice(): SurfaceChoice {
  const value = storage.getString(KEY);
  return surfaceChoices.some((choice) => choice.id === value) ? (value as SurfaceChoice) : "now";
}

export function useSurfaceChoice(): SurfaceChoice {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, surfaceChoice);
}

export function setSurfaceChoice(choice: SurfaceChoice) {
  if (choice === "now") storage.remove(KEY);
  else storage.set(KEY, choice);
  applySurfaceLab();
  for (const listener of listeners) listener();
}

/** Rewrites the light theme for the chosen page color (or restores it). */
export function applySurfaceLab() {
  const page = surfaceChoices.find((choice) => choice.id === surfaceChoice())?.page;
  const base = themes.light;
  if (!page) {
    UnistylesRuntime.updateTheme("light", () => base);
    return;
  }
  const color = { ...base.ui.color, bg: page, "screen-grouped": page, "bg-grouped": "#ffffff", fill: FILL, separator: SEPARATOR };
  UnistylesRuntime.updateTheme("light", () => ({
    ...base,
    colors: { ...base.colors, bg: page },
    ui: { ...base.ui, color },
  }) as typeof base);
}
