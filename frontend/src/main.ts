import App from "./App.svelte";
import "./app.css";
import { mount } from "svelte";
import { initNativePush } from "./lib/native-push";

const app = mount(App, { target: document.getElementById("app")! });

// On the native iOS (Capacitor) build, register for APNs push. No-op in browsers.
initNativePush().catch((err) => console.error("Native push init failed:", err));

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(`/sw.js?v=${encodeURIComponent(__APP_VERSION__)}`)
    .then((registration) => {
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          registration.update().catch(() => undefined);
        }
      });
    })
    .catch(console.error);
}

export default app;
