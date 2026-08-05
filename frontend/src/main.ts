import App from "./App.svelte";
import "./app.css";
import { mount } from "svelte";
import { initNativePush } from "./lib/native-push";
import { initNativeShell } from "./lib/native-shell";

// WebKit can defer a display-only face indefinitely after a transient cache or
// network miss. Explicitly warming it at launch makes the swap deterministic;
// the versioned URL in app.css also lets a damaged cached response recover
// without requiring an app reinstall.
void document.fonts?.load('400 1em "Geist Pixel"').catch(() => undefined);

// Guarded so a misbehaving native call can never block the app from rendering.
try {
  initNativeShell();
} catch (err) {
  console.error("Native shell init failed:", err);
}

const app = mount(App, { target: document.getElementById("app")! });

initNativePush().catch((err) => console.error("Native push init failed:", err));

export default app;
