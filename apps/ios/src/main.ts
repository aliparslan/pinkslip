import App from "./IosApp.svelte";
import { initializeIosPlatform } from "./platform";
import { mountApp } from "../../../packages/client/src/mount-app";

try {
  await initializeIosPlatform();
} catch (error) {
  console.error("iOS platform initialization failed:", error);
}

const app = await mountApp(App);
export default app;
