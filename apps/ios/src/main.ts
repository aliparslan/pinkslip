import IosBootstrap from "./IosBootstrap.svelte";
import { mountApp } from "../../../packages/client/src/mount-app";
import {
  createHashNavigationAdapter,
  installNavigationAdapter,
} from "../../../packages/client/src/router";
import "../../../packages/client/src/app.css";
import "../../../packages/client/src/styles/ios.css";

installNavigationAdapter(createHashNavigationAdapter());
const app = await mountApp(IosBootstrap);
export default app;
