import { createApiClient } from "@pinkslip/core/api";
import { buildErrorReport, createErrorReporter } from "@pinkslip/core/error-report";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { API_URL } from "./config";
import { storage } from "./storage";

/**
 * JavaScript errors go to the API's errors table (Decisions: Admin #1 in
 * docs/backend-inventory-2026-10-16.md). Native crashes don't come here:
 * TestFlight and Xcode's Organizer already collect them.
 *
 * Development builds only report to a local Worker (EXPO_PUBLIC_API_URL), so
 * hot-reload noise never reaches production.
 */
const enabled = !__DEV__ || Boolean(process.env.EXPO_PUBLIC_API_URL);

/** A fatal error crashes the app before a request can finish; it waits here for the next launch. */
const PENDING_KEY = "pending-error-report";

let currentRoute = "/";

/** The screen errors are filed under; the root layout keeps it current. */
export function setErrorRoute(route: string) {
  currentRoute = route;
}

function buildLabel(): string | undefined {
  const version = Constants.expoConfig?.version;
  if (!version) return undefined;
  const buildNumber = Constants.expoConfig?.ios?.buildNumber;
  const update = Updates.updateId ? ` · ${Updates.updateId.slice(0, 8)}` : "";
  return `${version}${buildNumber ? ` (${buildNumber})` : ""}${update}`;
}

const api = createApiClient({ baseUrl: API_URL, client: "ios" });
const send = (body: string) => api.fetchApi("/errors", { method: "POST", body }, false);
const report = createErrorReporter({ send, route: () => currentRoute, build: buildLabel() });

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
interface ReactNativeGlobals {
  ErrorUtils?: { getGlobalHandler(): GlobalHandler; setGlobalHandler(handler: GlobalHandler): void };
  HermesInternal?: {
    enablePromiseRejectionTracker?(options: { allRejections: boolean; onUnhandled(id: number, rejection: unknown): void }): void;
  };
}

if (enabled) {
  const globals = globalThis as ReactNativeGlobals;

  const pending = storage.getString(PENDING_KEY);
  if (pending) {
    storage.remove(PENDING_KEY);
    void send(pending).catch(() => undefined);
  }

  const previous = globals.ErrorUtils?.getGlobalHandler();
  globals.ErrorUtils?.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      const body = buildErrorReport(error, currentRoute, buildLabel());
      if (body) storage.set(PENDING_KEY, JSON.stringify(body));
    } else {
      report(error);
    }
    previous?.(error, isFatal);
  });

  // React Native only tracks unhandled rejections in development; in release
  // they vanish without a trace.
  if (!__DEV__) {
    globals.HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, rejection) => { report(rejection); },
    });
  }
}
