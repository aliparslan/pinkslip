import { useEffect } from "react";
import { createErrorReporter } from "@pinkslip/core/error-report";
import { createWebApiClient } from "../../platform/api";

let reporter: ((error: unknown) => unknown) | null = null;

/** Sends an unexpected error to the API's errors table. Browser only; a
 * no-op during server rendering. */
export function reportError(error: unknown) {
  if (typeof window === "undefined") return;
  reporter ??= createErrorReporter({
    send: (body) => createWebApiClient().fetchApi("/errors", { method: "POST", body, keepalive: true }),
    route: () => window.location.pathname,
  });
  reporter(error);
}

/** Uncaught errors and unhandled rejections anywhere on the page. Route
 * errors arrive through RouteErrorPage instead. Mounted once. */
export function ErrorEffects() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportError(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
