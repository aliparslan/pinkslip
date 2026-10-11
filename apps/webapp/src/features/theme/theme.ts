import { color } from "@pinkslip/tokens/native";
import { useEffect, useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "pinkslip-theme";
const listeners = new Set<() => void>();

/** The browser chrome (status bar, toolbar tint) per mode: the page colour.
 * The root route renders one `theme-color` tag per colour scheme. */
export const chromeColor = { dark: color.dark.bg, light: color.light.bg } as const;

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** Sets `data-mode` the way `public/theme.js` does before first paint, and
 * points the browser chrome at it. On System each `theme-color` tag keeps its
 * own scheme's colour; a chosen mode paints both. */
function apply(preference: ThemePreference) {
  const mode = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : preference;
  document.documentElement.dataset.mode = mode;
  for (const tag of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]')) {
    const own = tag.media.includes("light") ? "light" : "dark";
    tag.content = chromeColor[preference === "system" ? own : mode];
  }
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable; the choice still applies to this page.
  }
  apply(preference);
  for (const listener of listeners) listener();
}

/** Mounted once at the root: matches the browser chrome to a chosen mode on
 * load, and keeps "System" following the OS on every page. */
export function ThemeEffects() {
  useEffect(() => {
    apply(read());
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const follow = () => { if (read() === "system") apply("system"); };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);
  return null;
}

/** The Appearance setting. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    read,
    () => "system",
  );
}
