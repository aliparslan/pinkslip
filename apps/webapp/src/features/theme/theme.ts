import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "pinkslip-theme";
const listeners = new Set<() => void>();

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** Sets `data-mode` the way `public/theme.js` does before first paint. */
function apply(preference: ThemePreference) {
  const mode = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : preference;
  document.documentElement.dataset.mode = mode;
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

/** The Appearance setting. "System" follows the OS as it changes. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      const media = window.matchMedia("(prefers-color-scheme: light)");
      const follow = () => { if (read() === "system") apply("system"); };
      media.addEventListener("change", follow);
      return () => {
        listeners.delete(listener);
        media.removeEventListener("change", follow);
      };
    },
    read,
    () => "system",
  );
}
