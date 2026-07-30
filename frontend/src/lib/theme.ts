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

// `data-mode` is ALWAYS set to the resolved light/dark value ("system" is
// resolved here, and re-resolved when the OS theme changes). CSS therefore only
// needs `[data-mode="light"]` overrides — no duplicated
// `@media (prefers-color-scheme)` blocks. index.html mirrors this logic in an
// inline script so the first paint is already correct.
function applyTheme(mode: ThemeMode) {
  const html = document.documentElement;
  const resolved = resolvedMode(mode);
  html.setAttribute("data-mode", resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#18171a" : "#faf9f7");
  localStorage.setItem("pinkslip-theme", mode);
}

themeMode.subscribe(applyTheme);

if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    themeMode.update((m) => m); // re-run applyTheme with the current mode
  });
}

export function cycleTheme() {
  themeMode.update((m) => {
    if (m === "system") return "light";
    if (m === "light") return "dark";
    return "system";
  });
}
