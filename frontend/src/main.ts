import App from "./App.svelte";
import "./app.css";
import { mount } from "svelte";
import { initNativePush } from "./lib/native-push";

const app = mount(App, { target: document.getElementById("app")! });

// Register for native APNs push (iOS app). No-op outside the Capacitor shell.
initNativePush().catch((err) => console.error("Native push init failed:", err));

export default app;
