import { api } from "../../../packages/client/src/lib/api";
import { navigate } from "../../../packages/client/src/router";
import {
  installPlatform,
  normalizeExternalUrl,
  openWebWindow,
  type PlatformRuntime,
} from "../../../packages/client/src/lib/platform";

let serviceWorkerPromise: Promise<ServiceWorkerRegistration> | null = null;

function webPushSupported(): boolean {
  return "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!serviceWorkerPromise) {
    serviceWorkerPromise = navigator.serviceWorker.register("/sw.js?v=3");
  }
  return serviceWorkerPromise;
}

const webRuntime: PlatformRuntime = {
  kind: "web",
  async initialize() {
    if (webPushSupported()) await ensureServiceWorker();
  },
  notifications: {
    async initialize() {
      if (webPushSupported()) await ensureServiceWorker();
    },
    async status() {
      if (!webPushSupported() || Notification.permission !== "granted") return "disabled";
      const registration = await ensureServiceWorker();
      return await registration.pushManager.getSubscription() ? "enabled" : "disabled";
    },
    async enable() {
      if (!webPushSupported()) return "denied";
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return "denied";
      const registration = await ensureServiceWorker();
      const settings = await api.push.settings();
      if (!settings.vapid_public_key) throw new Error("Web push is not configured.");
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(settings.vapid_public_key),
        });
      await api.push.subscribe(subscription);
      return "enabled";
    },
  },
  auth: {
    appleAvailable: () => false,
    async signInWithApple() {
      throw new Error("Sign in with Apple is available in the iOS app.");
    },
    attachMagicLink: () => () => undefined,
  },
  haptics: {
    light: () => undefined,
    success: () => undefined,
  },
  actionMenu: {
    async present() {
      return null;
    },
  },
  async exportFile({ fileName, contentType, bytes }) {
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    const url = URL.createObjectURL(new Blob([arrayBuffer], { type: contentType }));
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = "noopener";
      anchor.click();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    }
    return "downloaded";
  },
  async shareLink(options) {
    try {
      if (navigator.share) {
        await navigator.share(options);
        return;
      }
      await navigator.clipboard?.writeText(options.url);
    } catch {
      // Cancellation is not an application error.
    }
  },
  async openApplication(rawUrl) {
    openWebWindow(normalizeExternalUrl(rawUrl));
    return () => undefined;
  },
  openExternal: openWebWindow,
};

export async function initializeWebPlatform(): Promise<void> {
  installPlatform(webRuntime);
  // Service-worker availability should never hold the product UI hostage.
  void webRuntime.initialize().catch((error) => {
    console.error("Web notification initialization failed:", error);
  });

  navigator.serviceWorker?.addEventListener("message", (event) => {
    const url = (event.data as { url?: unknown } | null)?.url;
    if (typeof url === "string" && url.startsWith("/")) navigate(url);
  });
}
