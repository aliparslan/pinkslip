import { setStatusBarStyle } from "expo-status-bar";
import { useDeferredValue, useSyncExternalStore } from "react";
import { AccessibilityInfo, Appearance } from "react-native";
import { UnistylesRuntime, useUnistyles } from "react-native-unistyles";
import { storage } from "../platform/storage";
import { motionTrial } from "../ui/motion-trial";
import { themes, type AppTheme, type ThemeName } from "./themes";

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

/** The fade that hides a theme change (ThemeCurtain), while it's mounted. */
let curtain: ((change: () => void) => void) | null = null;

export function setThemeCurtain(play: typeof curtain) {
  curtain = play;
}

function notify() {
  for (const listener of listeners) listener();
}

function apply() {
  const next = themeFor();
  if (UnistylesRuntime.themeName !== next) {
    UnistylesRuntime.setTheme(next);
    // Its component would wait for the app to redraw.
    setStatusBarStyle(next.startsWith("light") ? "dark" : "light");
  }
  // Native chrome (sheets, menus, the keyboard) follows the pinned scheme too.
  const preference = appearancePreference();
  Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
  notify();
}

export function setAppearancePreference(preference: AppearancePreference) {
  if (preference === "system") storage.remove(KEY);
  else storage.set(KEY, preference);
  const next = themeFor();
  if (curtain && motionTrial("themeFade") && UnistylesRuntime.themeName !== next) {
    // The picker answers now; the colors change once they're covered.
    notify();
    curtain(apply);
  } else apply();
}

export function useAppearancePreference(): AppearancePreference {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, appearancePreference);
}

/** The theme for navigators, which re-render everything under them. It lands
 * a moment after a change, so the colors on screen don't wait for it. */
export function useNavigatorTheme(): AppTheme {
  // Read so this follows a change (Unistyles tracks what's read); the name is
  // the one stable value to defer.
  const { theme } = useUnistyles();
  const name = useDeferredValue(theme.ui.color.bg ? UnistylesRuntime.themeName as ThemeName : "light");
  return themes[name];
}

/** Starts following system appearance and contrast changes. Called once. */
export function watchAppearance() {
  void AccessibilityInfo.isDarkerSystemColorsEnabled().then((enabled) => { darker = enabled; apply(); });
  AccessibilityInfo.addEventListener("darkerSystemColorsChanged", (enabled) => { darker = enabled; apply(); });
  Appearance.addChangeListener(() => { if (appearancePreference() === "system") apply(); });
  apply();
}
