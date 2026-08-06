import { derived, readable, writable } from "svelte/store";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemeMode, "system">;

const storedValue = typeof localStorage !== "undefined"
  ? localStorage.getItem("pinkslip-theme")
  : null;
const stored = storedValue === "system" || storedValue === "light" || storedValue === "dark"
  ? storedValue
  : null;

export const themeMode = writable<ThemeMode>(stored || "system");

const systemTheme = readable<ResolvedTheme>(
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark",
  (set) => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const update = () => set(query.matches ? "light" : "dark");
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }
);

export const resolvedTheme = derived(
  [themeMode, systemTheme],
  ([$mode, $systemTheme]): ResolvedTheme => $mode === "system" ? $systemTheme : $mode
);

// `data-mode` is always the resolved light/dark value. The system preference is
// a real store input, so a Control Center appearance change updates both the DOM
// and native subscribers without writing a duplicate themeMode value.
function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-mode", resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#18171a" : "#faf9f7");
}

themeMode.subscribe((mode) => {
  if (typeof localStorage !== "undefined") localStorage.setItem("pinkslip-theme", mode);
});
resolvedTheme.subscribe(applyTheme);
