import App from "./IosApp.svelte";
import { initializeIosPlatform } from "./platform";
import { mountApp } from "../../../packages/client/src/mount-app";
import "../../../packages/client/src/app.css";
import "../../../packages/client/src/styles/ios.css";
import "./typography.css";

try {
  await initializeIosPlatform();
} catch (error) {
  console.error("iOS platform initialization failed:", error);
}

const app = await mountApp(App);
export default app;
