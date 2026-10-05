import { api } from "../../../packages/client/src/lib/api";
import { invalidateFeedForNotification } from "../../../packages/client/src/lib/feed-store.svelte";
import {
  installPlatform,
  normalizeExternalUrl,
  openWebWindow,
  type NotificationStatus,
  type PlatformRuntime,
} from "../../../packages/client/src/lib/platform";
import {
  getNotificationCapability,
  initializeWebEnvironment,
  promptWebInstall,
  refreshNotificationCapability,
  registerWebServiceWorker,
} from "./lib/web-environment";

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

const webRuntime: PlatformRuntime = {
  kind: "web",
  async initialize() {
    await initializeWebEnvironment();
  },
  notifications: {
    async initialize() {
      await initializeWebEnvironment();
    },
    async status(): Promise<NotificationStatus> {
      return getNotificationCapability();
    },
    async enable() {
      const current = await getNotificationCapability();
      if (current === "unsupported" || current === "requires-install" || current === "denied") {
        return current;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return "denied";
      const registration = await registerWebServiceWorker();
      if (!registration) return "unsupported";
      const settings = await api.push.settings();
      if (!settings.vapid_public_key) throw new Error("Web push is not configured.");
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(settings.vapid_public_key),
      });
      await api.push.subscribe(subscription);
      await refreshNotificationCapability();
      return "enabled";
    },
    async openSettings() {
      const result = await promptWebInstall();
      if (result === "unavailable") {
        window.dispatchEvent(new CustomEvent("pinkslip:install-help"));
      }
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

export function initializeWebPlatform(navigateFromNotification: (url: string) => Promise<void>): () => void {
  installPlatform(webRuntime);
  // Service-worker availability should never hold the product UI hostage.
  void webRuntime.initialize().catch((error) => {
    console.error("Web notification initialization failed:", error);
  });

  const onMessage = (event: MessageEvent) => {
    const message = event.data as { type?: unknown; url?: unknown; jobIds?: unknown } | null;
    if (message?.type === "pinkslip:notification-opened"
      && typeof message.url === "string"
      && message.url.startsWith("/")) {
      // Kit navigation is asynchronous. Invalidate after the target commits so
      // a retained feed does not refresh while it is still becoming inactive.
      void navigateFromNotification(message.url).then(invalidateFeedForNotification).catch((error) => {
        console.error("Notification navigation failed:", error);
      });
      return;
    }
    if (message?.type === "pinkslip:push") {
      window.dispatchEvent(new CustomEvent("pinkslip:push", { detail: message }));
    }
  };
  navigator.serviceWorker?.addEventListener("message", onMessage);
  return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
}
