import App from "./WebApp.svelte";
import { initializeWebPlatform } from "./platform";
import { mountApp } from "../../../packages/client/src/mount-app";
import "../../../packages/client/src/app.css";

await initializeWebPlatform();
const app = await mountApp(App);

export default app;
