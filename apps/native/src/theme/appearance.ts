import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Appearance } from "react-native";
import { UnistylesRuntime } from "react-native-unistyles";
import { storage } from "../platform/storage";
import type { ThemeName } from "./themes";

/** "system" follows iOS; the others pin the app (You → Appearance). */
export type AppearancePreference = "system" | "light" | "dark";

const KEY = "appearance";
let darker = false;
const listeners = new Set<() => void>();

export function appearancePreference(): AppearancePreference {
  const value = storage.getString(KEY);
  return value === "light" || value === "dark" ? value : "system";
}

/** The theme for a preference, the system scheme and iOS "Increase Contrast". */
export function themeFor(preference = appearancePreference(), increasedContrast = darker): ThemeName {
  const scheme = preference === "system" ? (Appearance.getColorScheme() ?? "dark") : preference;
  if (increasedContrast) return scheme === "light" ? "lightContrast" : "contrast";
  return scheme === "light" ? "light" : "dark";
}

function apply() {
  const next = themeFor();
  if (UnistylesRuntime.themeName !== next) UnistylesRuntime.setTheme(next);
  // Native chrome (sheets, menus, the keyboard) follows the pinned scheme too.
  const preference = appearancePreference();
  Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
  for (const listener of listeners) listener();
}

export function setAppearancePreference(preference: AppearancePreference) {
  if (preference === "system") storage.remove(KEY);
  else storage.set(KEY, preference);
  apply();
}

export function useAppearancePreference(): AppearancePreference {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, appearancePreference);
}

/** Starts following system appearance and contrast changes. Called once. */
export function watchAppearance() {
  void AccessibilityInfo.isDarkerSystemColorsEnabled().then((enabled) => { darker = enabled; apply(); });
  AccessibilityInfo.addEventListener("darkerSystemColorsChanged", (enabled) => { darker = enabled; apply(); });
  Appearance.addChangeListener(() => { if (appearancePreference() === "system") apply(); });
  apply();
}
