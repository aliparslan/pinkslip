import { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "@pinkslip/core/api";

/** What this browser can do about push (`web-environment.ts`). */
export type PushStatus = "unsupported" | "requires-install" | "promptable" | "disabled" | "denied" | "enabled";

/** Push only, no caching (port plan 4.8). The retired /sw.js stays a kill switch. */
export const PUSH_WORKER_URL = "/push-worker.js";

function supported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function iosBrowser(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function installed(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Our registration, if this browser has one (not the retired worker's). */
async function pushRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const script = registration?.active?.scriptURL ?? registration?.waiting?.scriptURL ?? registration?.installing?.scriptURL;
  return script && new URL(script).pathname === PUSH_WORKER_URL ? registration : undefined;
}

export async function readPushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";
  // iOS only offers web push to apps added to the Home Screen.
  if (iosBrowser() && !installed()) return "requires-install";
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "default") return "promptable";
  try {
    const registration = await pushRegistration();
    return (await registration?.pushManager.getSubscription()) ? "enabled" : "disabled";
  } catch {
    // A browser can drop a subscription while permission stays granted.
    return "disabled";
  }
}

function activated(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active) return Promise.resolve();
  const worker = registration.installing ?? registration.waiting;
  return new Promise((resolve) => {
    worker?.addEventListener("statechange", () => { if (worker.state === "activated") resolve(); });
  });
}

function vapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** Asks for permission, registers the push worker and this browser's
 * subscription with the API. Resolves to the resulting status; throws when
 * permission was granted but registration failed (the UI offers Retry). */
export async function enablePush(api: ApiClient): Promise<PushStatus> {
  const current = await readPushStatus();
  if (current === "unsupported" || current === "requires-install" || current === "denied") return current;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const registration = await navigator.serviceWorker.register(PUSH_WORKER_URL, { scope: "/" });
  await activated(registration);
  const { vapid_public_key: key } = await api.push.settings();
  if (!key) throw new Error("Web push isn't configured.");
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey(key) });
  await api.push.subscribe(subscription);
  return "enabled";
}

/** This browser's push status, rechecked when the page comes back (the
 * person may have changed permission in settings meanwhile). */
export function usePushStatus() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const refresh = useCallback(async () => {
    const next = await readPushStatus();
    setStatus(next);
    return next;
  }, []);
  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);
  return { status, setStatus, refresh };
}
