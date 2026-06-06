// Native-shell initialization: things that only matter inside the Capacitor app
// (status-bar theming, an iOS edge-swipe-back gesture, native CSS hooks).
//
// All of it is a no-op on the web, so this can be called unconditionally at boot.

import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { resolvedTheme } from "./theme";

export function isNativeIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export function initNativeShell(): void {
  if (!Capacitor.isNativePlatform()) return;

  // CSS hooks so styles can target the native shell (e.g. 16px inputs on iOS).
  document.documentElement.classList.add("native-app");
  if (isNativeIos()) document.documentElement.classList.add("native-ios");

  initStatusBar();
  // The interactive swipe-back gesture lives in App.svelte (it needs to render
  // the previous page underneath), so there's nothing more to wire here.
}

/**
 * Keep the status-bar content (the clock / battery glyphs) legible against the
 * current theme. We run edge-to-edge (capacitor.config `contentInset: never`),
 * so the web layout already reserves `env(safe-area-inset-top)`.
 *
 * Capacitor's `Style.Dark` = light glyphs (for a dark background); `Style.Light`
 * = dark glyphs (for a light background).
 */
function initStatusBar(): void {
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  resolvedTheme.subscribe((theme) => {
    StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light }).catch(() => {});
  });
}
