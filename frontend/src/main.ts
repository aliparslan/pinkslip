import App from "./App.svelte";
import "./app.css";
import { mount } from "svelte";

const app = mount(App, { target: document.getElementById("app")! });

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
