import { App } from "@capacitor/app";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
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

interface NativeAppearancePlugin {
  setTheme(options: { theme: "dark" | "light" }): Promise<void>;
}

interface NativeActionMenuPlugin {
  present(options: {
    source: { x: number; y: number; width: number; height: number };
    actions: Array<{
      id: string;
      title: string;
      symbol?: string;
      destructive?: boolean;
      disabled?: boolean;
    }>;
  }): Promise<{ id?: string }>;
}

const AppleSignIn = registerPlugin<AppleSignInPlugin>("AppleSignIn");
const ApplicationBrowser = registerPlugin<ApplicationBrowserPlugin>("ApplicationBrowser");
const NativeAppearance = registerPlugin<NativeAppearancePlugin>("NativeAppearance");
const NativeActionMenu = registerPlugin<NativeActionMenuPlugin>("NativeActionMenu");
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
  let fullViewportHeight = window.innerHeight;
  let expectedViewportHeight: number | null = null;
  let keyboardHeight = 0;
  let keyboardPhase: "showing" | "hiding" | null = null;
  let hideStartViewportHeight = window.innerHeight;
  let hideAnimationFrame = 0;
  let hideCleanupTimer = 0;

  const setKeyboardOffset = (offset: number) => {
    document.documentElement.style.setProperty(
      "--native-keyboard-offset",
      `${Math.max(0, offset)}px`,
    );
  };

  const clearKeyboardCompensation = () => {
    if (hideAnimationFrame) cancelAnimationFrame(hideAnimationFrame);
    if (hideCleanupTimer) window.clearTimeout(hideCleanupTimer);
    hideAnimationFrame = 0;
    hideCleanupTimer = 0;
    document.body.classList.remove(
      "native-keyboard-awaiting-resize",
      "native-keyboard-hiding",
      "native-keyboard-handoff",
    );
    document.documentElement.style.removeProperty("--native-keyboard-offset");
  };

  const animateKeyboardHide = (initialOffset: number) => {
    document.body.classList.remove("native-keyboard-awaiting-resize");
    document.body.classList.add("native-keyboard-hiding", "native-keyboard-handoff");
    setKeyboardOffset(initialOffset);
    void document.body.offsetHeight;
    hideAnimationFrame = requestAnimationFrame(() => {
      document.body.classList.remove("native-keyboard-handoff");
      setKeyboardOffset(0);
      hideAnimationFrame = 0;
    });
  };

  document.documentElement.classList.add("native-app", "native-ios");
  document.querySelector('meta[name="viewport"]')?.setAttribute(
    "content",
    "width=device-width, initial-scale=1, viewport-fit=cover"
  );
  void StatusBar.setOverlaysWebView({ overlay: true });
  // Capacitor hides WKWebView's form accessory bar by default. Restore the
  // standard iPhone previous/next controls for Pinkslip's multi-field forms.
  void Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => undefined);
  resolvedTheme.subscribe((theme) => {
    const surfaceColor = NATIVE_SURFACE_COLOR[theme];
    document.documentElement.style.backgroundColor = surfaceColor;
    document.body.style.backgroundColor = surfaceColor;
    void NativeAppearance.setTheme({ theme }).catch(() => undefined);
    void StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
    void Keyboard.setStyle({
      style: theme === "dark" ? KeyboardStyle.Dark : KeyboardStyle.Light,
    }).catch(() => undefined);
  });
  void Keyboard.addListener("keyboardWillShow", ({ keyboardHeight: nextKeyboardHeight }) => {
    if (!document.body.classList.contains("native-keyboard-visible")) {
      fullViewportHeight = window.innerHeight;
    }
    if (hideAnimationFrame) cancelAnimationFrame(hideAnimationFrame);
    if (hideCleanupTimer) window.clearTimeout(hideCleanupTimer);
    hideAnimationFrame = 0;
    hideCleanupTimer = 0;
    document.body.classList.remove("native-keyboard-hiding", "native-keyboard-handoff");
    keyboardHeight = Math.max(0, nextKeyboardHeight);
    expectedViewportHeight = Math.max(0, fullViewportHeight - keyboardHeight);
    const overlap = Math.max(0, window.innerHeight - expectedViewportHeight);
    keyboardPhase = Math.abs(window.innerHeight - expectedViewportHeight) <= 2
      ? null
      : "showing";
    setKeyboardOffset(overlap);
    document.body.classList.add("native-keyboard-visible");
    document.body.classList.toggle("native-keyboard-awaiting-resize", overlap > 1);
  });
  void Keyboard.addListener("keyboardWillHide", () => {
    keyboardPhase = "hiding";
    expectedViewportHeight = fullViewportHeight;
    hideStartViewportHeight = window.innerHeight;
    if (document.body.classList.contains("native-keyboard-awaiting-resize")) {
      animateKeyboardHide(Math.max(0, window.innerHeight - (fullViewportHeight - keyboardHeight)));
    }
    hideCleanupTimer = window.setTimeout(() => {
      clearKeyboardCompensation();
      document.body.classList.remove("native-keyboard-visible");
      keyboardPhase = null;
      expectedViewportHeight = null;
      keyboardHeight = 0;
      fullViewportHeight = window.innerHeight;
    }, 600);
  });
  void Keyboard.addListener("keyboardDidHide", () => {
    document.body.classList.remove("native-keyboard-visible");
    keyboardPhase = null;
    expectedViewportHeight = null;
    keyboardHeight = 0;
    // Let the final few pixels of an interactive hide finish instead of
    // snapping the modal at keyboardDidHide. The will-hide fallback owns
    // cleanup when the handoff animation is active.
    if (document.body.classList.contains("native-keyboard-hiding")) return;
    clearKeyboardCompensation();
    fullViewportHeight = window.innerHeight;
  });
  window.addEventListener("resize", () => {
    if (keyboardPhase === "showing" && expectedViewportHeight !== null) {
      const reachedExpectedHeight = Math.abs(window.innerHeight - expectedViewportHeight) <= 2;
      const passedExpectedHeight = window.innerHeight < expectedViewportHeight;
      if (reachedExpectedHeight || passedExpectedHeight) {
        document.body.classList.remove("native-keyboard-awaiting-resize");
        setKeyboardOffset(0);
        keyboardPhase = null;
      }
      return;
    }
    if (
      keyboardPhase === "hiding"
      && window.innerHeight > hideStartViewportHeight + 1
      && !document.body.classList.contains("native-keyboard-hiding")
    ) {
      animateKeyboardHide(Math.min(keyboardHeight, window.innerHeight - hideStartViewportHeight));
    }
  }, { passive: true });
}

function binaryToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

const iosRuntime: PlatformRuntime = {
  kind: "ios",
  async initialize() {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
      throw new Error("The iOS entrypoint must run inside the Capacitor iOS shell.");
    }
    configureNativeDocument();
    const appInfo = await App.getInfo();
    accessToken = (await SecureSession.get().catch((): { token?: string } => ({}))).token ?? null;
    configureApiClient({
      baseUrl: `${API_ORIGIN.replace(/\/$/, "")}/api/v2`,
      client: "ios",
      build: `${appInfo.version}.${appInfo.build}`,
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
  actionMenu: {
    async present(options) {
      const result = await NativeActionMenu.present(options);
      return result.id ?? null;
    },
  },
  async exportFile({ fileName, bytes }) {
    const path = `exports/${crypto.randomUUID()}-${fileName}`;
    const written = await Filesystem.writeFile({
      path,
      data: binaryToBase64(bytes),
      directory: Directory.Cache,
      recursive: true,
    });
    try {
      await Share.share({
        title: fileName,
        files: [written.uri],
      });
      return "presented";
    } finally {
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
    }
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
