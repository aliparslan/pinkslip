import { writable, derived } from "svelte/store";

export type ThemeMode = "system" | "light" | "dark";

const stored = (typeof localStorage !== "undefined"
  ? localStorage.getItem("pinkslip-theme")
  : null) as ThemeMode | null;

export const themeMode = writable<ThemeMode>(stored || "system");

function resolvedMode(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export const resolvedTheme = derived(themeMode, ($m) => resolvedMode($m));

function applyTheme(mode: ThemeMode) {
  const html = document.documentElement;
  if (mode === "system") {
    html.removeAttribute("data-mode");
  } else {
    html.setAttribute("data-mode", mode);
  }
  const isDark = resolvedMode(mode) === "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? "#271a21" : "#fbf9fa");
  localStorage.setItem("pinkslip-theme", mode);
}

themeMode.subscribe(applyTheme);

export function cycleTheme() {
  themeMode.update((m) => {
    if (m === "system") return "light";
    if (m === "light") return "dark";
    return "system";
  });
}
