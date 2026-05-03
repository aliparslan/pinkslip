import App from "./App.svelte";
import "./app.css";
import { mount } from "svelte";

const app = mount(App, { target: document.getElementById("app")! });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(console.error);
}

export default app;
