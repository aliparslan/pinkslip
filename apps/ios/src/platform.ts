import { App } from "@capacitor/app";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Keyboard, KeyboardStyle } from "@capacitor/keyboard";
import { PushNotifications } from "@capacitor/push-notifications";
import { Share } from "@capacitor/share";
import { StatusBar, Style } from "@capacitor/status-bar";
import { api, ApiError, configureApiClient } from "../../../packages/client/src/lib/api";
import { navigate } from "../../../packages/client/src/router";
import { resolvedTheme } from "../../../packages/client/src/lib/theme";
import {
  installPlatform,
  normalizeExternalUrl,
  openWebWindow,
  type AppleCredential,
  type PlatformRuntime,
} from "../../../packages/client/src/lib/platform";

interface AppleSignInPlugin {
  signIn(options?: { nonce?: string; state?: string }): Promise<AppleCredential>;
}

interface ApplicationBrowserPlugin {
  open(options: { url: string }): Promise<void>;
  addListener(eventName: "finished", listener: () => void): Promise<PluginListenerHandle>;
}

interface SecureSessionPlugin {
  get(): Promise<{ token?: string }>;
  set(options: { token: string }): Promise<void>;
  clear(): Promise<void>;
}

const AppleSignIn = registerPlugin<AppleSignInPlugin>("AppleSignIn");
const ApplicationBrowser = registerPlugin<ApplicationBrowserPlugin>("ApplicationBrowser");
const SecureSession = registerPlugin<SecureSessionPlugin>("SecureSession");
const API_ORIGIN = import.meta.env.VITE_IOS_API_ORIGIN || "https://pinkslip.alip.dev";
// These are the sRGB equivalents of --color-bg in the shared OKLCH palette.
// Capacitor Keyboard 8.0.5 samples the body's computed background before the
// keyboard appears, but its native parser only accepts rgb()/hex values. An
// OKLCH computed value falls back to white and shows through around the rounded
// dark keyboard as a seam and corner wedges.
const NATIVE_SURFACE_COLOR = {
  dark: "rgb(14, 14, 16)",
  light: "rgb(251, 250, 249)",
} as const;

let accessToken: string | null = null;
let listenersReady = false;
let nativeRegistration: {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} | null = null;

async function createNativeSession(): Promise<void> {
  const session = await api.native.startSession();
  accessToken = session.token;
  await SecureSession.set({ token: session.token });
}

function randomBase64Url(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function magicLinkToken(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/auth/email/verify" ? parsed.searchParams.get("token") : null;
  } catch {
    return null;
  }
}

function handleNotificationUrl(data: unknown): void {
  const payload = data as { url?: string; job_ids?: unknown } | undefined;
  const jobIds = Array.isArray(payload?.job_ids)
    ? payload.job_ids.filter((jobId): jobId is string => typeof jobId === "string")
    : [];
  if (jobIds.length > 0) void api.push.opened(jobIds).catch(() => undefined);
  if (typeof payload?.url === "string" && payload.url.startsWith("/")) navigate(payload.url);
}

async function ensurePushListeners(): Promise<void> {
  if (listenersReady) return;
  listenersReady = true;
  await PushNotifications.addListener("registration", async (token) => {
    try {
      await api.push.registerApns(token.value);
      nativeRegistration?.resolve();
    } catch (error) {
      nativeRegistration?.reject(error instanceof Error ? error : new Error("APNs registration failed"));
    }
  });
  await PushNotifications.addListener("registrationError", (error) => {
    nativeRegistration?.reject(new Error(error.error || "APNs registration failed"));
  });
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    handleNotificationUrl(action.notification.data);
  });
}

async function registerNativeDevice(): Promise<void> {
  if (nativeRegistration) return nativeRegistration.promise;
  let resolveRegistration!: () => void;
  let rejectRegistration!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolveRegistration = resolve;
    rejectRegistration = reject;
  });
  const registration = { promise, resolve: resolveRegistration, reject: rejectRegistration };
  nativeRegistration = registration;
  const timeout = window.setTimeout(
    () => registration.reject(new Error("Timed out while registering this device for notifications")),
    15_000
  );
  try {
    await PushNotifications.register();
    await promise;
  } finally {
    window.clearTimeout(timeout);
    if (nativeRegistration === registration) nativeRegistration = null;
  }
}

function configureNativeDocument(): void {
  document.documentElement.classList.add("native-app", "native-ios");
  document.querySelector('meta[name="viewport"]')?.setAttribute(
    "content",
    "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
  );
  void StatusBar.setOverlaysWebView({ overlay: true });
  resolvedTheme.subscribe((theme) => {
    const surfaceColor = NATIVE_SURFACE_COLOR[theme];
    document.documentElement.style.backgroundColor = surfaceColor;
    document.body.style.backgroundColor = surfaceColor;
    void StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
    void Keyboard.setStyle({
      style: theme === "dark" ? KeyboardStyle.Dark : KeyboardStyle.Light,
    }).catch(() => undefined);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
    if (["button", "checkbox", "file", "radio", "range", "reset", "submit"].includes(event.target.type)) return;
    const input = event.target;
    window.requestAnimationFrame(() => {
      input.blur();
      void Keyboard.hide().catch(() => undefined);
    });
  });
}

const iosRuntime: PlatformRuntime = {
  kind: "ios",
  async initialize() {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
      throw new Error("The iOS entrypoint must run inside the Capacitor iOS shell.");
    }
    configureNativeDocument();
    accessToken = (await SecureSession.get().catch((): { token?: string } => ({}))).token ?? null;
    configureApiClient({
      baseUrl: `${API_ORIGIN.replace(/\/$/, "")}/api`,
      client: "ios",
      getAccessToken: () => accessToken,
      onAccessToken: async (token) => {
        accessToken = token;
        await SecureSession.set({ token });
      },
      onInvalidAccessToken: async (rejectedToken) => {
        // Another request (notably a magic-link exchange) may already have
        // rotated the token. Retry with that newer token instead of clearing it
        // and accidentally returning the signed-in user to a guest session.
        if (rejectedToken && accessToken && rejectedToken !== accessToken) return;
        accessToken = null;
        await SecureSession.clear().catch(() => undefined);
        try {
          await createNativeSession();
        } catch (error) {
          if (!(error instanceof ApiError && error.code === "access_required")) throw error;
        }
      },
    });
    if (!accessToken) {
      try {
        await createNativeSession();
      } catch (error) {
        if (!(error instanceof ApiError && error.code === "access_required")) throw error;
      }
    }
    await this.notifications.initialize();
  },
  notifications: {
    async initialize() {
      await ensurePushListeners();
      const permission = await PushNotifications.checkPermissions();
      if (permission.receive === "granted") {
        void registerNativeDevice().catch((error) => console.error("APNs refresh failed:", error));
      }
    },
    async status() {
      const permission = await PushNotifications.checkPermissions();
      return permission.receive === "granted" ? "enabled" : "disabled";
    },
    async enable() {
      await ensurePushListeners();
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== "granted") return "denied";
      await registerNativeDevice();
      return "enabled";
    },
  },
  auth: {
    appleAvailable: () => Capacitor.isPluginAvailable("AppleSignIn"),
    async signInWithApple() {
      if (!Capacitor.isPluginAvailable("AppleSignIn")) {
        throw new Error("Sign in with Apple is unavailable.");
      }
      const nonce = randomBase64Url();
      const state = randomBase64Url();
      const credential = await AppleSignIn.signIn({ nonce, state });
      if (credential.state !== state) throw new Error("Apple sign-in state verification failed.");
      return { ...credential, nonce };
    },
    attachMagicLink(onToken) {
      const handled = new Set<string>();
      const handle = (url: string | undefined | null) => {
        const token = magicLinkToken(url);
        if (!token || handled.has(token)) return;
        handled.add(token);
        onToken(token);
      };
      const listener = App.addListener("appUrlOpen", ({ url }) => handle(url));
      void App.getLaunchUrl().then((launch) => handle(launch?.url)).catch(() => undefined);
      return () => void listener.then((value) => value.remove());
    },
  },
  haptics: {
    light: () => void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined),
    success: () => void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined),
  },
  async shareLink(options) {
    try {
      await Share.share(options);
    } catch {
      // Cancellation is not an application error.
    }
  },
  async openApplication(rawUrl, onFinished) {
    const url = normalizeExternalUrl(rawUrl);
    if (!url) throw new Error("A valid URL is required.");
    let handle: PluginListenerHandle | null = null;
    try {
      if (onFinished) handle = await ApplicationBrowser.addListener("finished", onFinished);
      await ApplicationBrowser.open({ url });
      return () => void handle?.remove();
    } catch (error) {
      await handle?.remove();
      throw error;
    }
  },
  openExternal: openWebWindow,
};

export async function initializeIosPlatform(): Promise<void> {
  installPlatform(iosRuntime);
  await iosRuntime.initialize();
}
