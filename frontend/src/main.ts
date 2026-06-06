import App from "./App.svelte";
import "./app.css";
import { mount } from "svelte";
import { initNativePush } from "./lib/native-push";
import { initNativeShell } from "./lib/native-shell";

// Status bar theming, edge-swipe-back, native CSS hooks. No-op on the web.
// Guarded so a misbehaving native call can never block the app from rendering.
try {
  initNativeShell();
} catch (err) {
  console.error("Native shell init failed:", err);
}

const app = mount(App, { target: document.getElementById("app")! });

// Register for native APNs push (iOS app). No-op outside the Capacitor shell.
initNativePush().catch((err) => console.error("Native push init failed:", err));

export default app;
