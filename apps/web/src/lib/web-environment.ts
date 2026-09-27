export type WebDisplayMode = "browser" | "standalone";

export type NotificationCapability =
  | "unsupported"
  | "requires-install"
  | "promptable"
  | "disabled"
  | "denied"
  | "enabled";

export type InstallPromptResult = "accepted" | "dismissed" | "unavailable";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

export interface WebEnvironmentSnapshot {
  displayMode: WebDisplayMode;
  online: boolean;
  installAvailable: boolean;
  installed: boolean;
  updateAvailable: boolean;
  notificationCapability: NotificationCapability;
}

export interface NotificationCapabilityInputs {
  isIosBrowser: boolean;
  displayMode: WebDisplayMode;
  serviceWorkerSupported: boolean;
  pushManagerSupported: boolean;
  notificationsSupported: boolean;
  permission: NotificationPermission | "unavailable";
  hasSubscription: boolean;
}

type EnvironmentListener = (snapshot: WebEnvironmentSnapshot) => void;

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
let initialization: Promise<void> | null = null;
let reloadOnControllerChange = false;
let lastServiceWorkerUpdateCheck = 0;

const SERVICE_WORKER_UPDATE_INTERVAL_MS = 5 * 60 * 1_000;

interface WaitingWorkerRegistration {
  waiting: Pick<ServiceWorker, "postMessage"> | null;
}

export function requestWaitingWebUpdate(
  registration: WaitingWorkerRegistration,
  hasExistingController: boolean,
): boolean {
  if (!registration.waiting || !hasExistingController) return false;
  try {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    return true;
  } catch {
    return false;
  }
}

export function webUpdateCheckDue(
  lastCheck: number,
  now: number,
  force = false,
): boolean {
  return force || now - lastCheck >= SERVICE_WORKER_UPDATE_INTERVAL_MS;
}

let snapshot: WebEnvironmentSnapshot = {
  displayMode: detectDisplayMode(),
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  installAvailable: false,
  installed: detectDisplayMode() === "standalone",
  updateAvailable: false,
  notificationCapability: "unsupported",
};

const listeners = new Set<EnvironmentListener>();

function emit(patch: Partial<WebEnvironmentSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  if (typeof document !== "undefined") {
    document.documentElement.dataset.displayMode = snapshot.displayMode;
  }
  for (const listener of listeners) listener(snapshot);
}

function detectDisplayMode(): WebDisplayMode {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "browser";
  }
  const navigatorWithStandalone = navigator as NavigatorWithStandalone;
  return window.matchMedia("(display-mode: standalone)").matches
    || navigatorWithStandalone.standalone === true
    ? "standalone"
    : "browser";
}

export function isIosWebBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function webPushApisSupported(): boolean {
  return typeof window !== "undefined"
    && typeof navigator !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export function resolveNotificationCapability({
  isIosBrowser,
  displayMode,
  serviceWorkerSupported,
  pushManagerSupported,
  notificationsSupported,
  permission,
  hasSubscription,
}: NotificationCapabilityInputs): NotificationCapability {
  if (isIosBrowser && displayMode !== "standalone") return "requires-install";
  if (!serviceWorkerSupported || !pushManagerSupported || !notificationsSupported) {
    return "unsupported";
  }
  if (permission === "denied") return "denied";
  if (permission === "default") return "promptable";
  return hasSubscription ? "enabled" : "disabled";
}

export async function getNotificationCapability(
  registration = serviceWorkerRegistration,
): Promise<NotificationCapability> {
  const supported = webPushApisSupported();
  let hasSubscription = false;
  if (supported && Notification.permission === "granted" && registration) {
    try {
      hasSubscription = Boolean(await registration.pushManager.getSubscription());
    } catch {
      // Permission may remain granted after a browser has invalidated its push
      // subscription; represent that as disabled so the user can retry.
    }
  }

  return resolveNotificationCapability({
    isIosBrowser: isIosWebBrowser(),
    displayMode: detectDisplayMode(),
    serviceWorkerSupported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    pushManagerSupported: typeof window !== "undefined" && "PushManager" in window,
    notificationsSupported: typeof window !== "undefined" && "Notification" in window,
    permission: supported ? Notification.permission : "unavailable",
    hasSubscription,
  });
}

export async function refreshNotificationCapability(): Promise<NotificationCapability> {
  const capability = await getNotificationCapability();
  emit({ notificationCapability: capability });
  return capability;
}

function trackRegistration(registration: ServiceWorkerRegistration): void {
  serviceWorkerRegistration = registration;
  const hasExistingController = Boolean(navigator.serviceWorker.controller);

  const activationRequested = requestWaitingWebUpdate(registration, hasExistingController);
  if (activationRequested) {
    reloadOnControllerChange = true;
  }

  emit({
    updateAvailable: Boolean(
      registration.waiting
      && hasExistingController
      && !activationRequested
    ),
  });

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    if (navigator.serviceWorker.controller) reloadOnControllerChange = true;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        const requested = requestWaitingWebUpdate(registration, true);
        emit({ updateAvailable: Boolean(registration.waiting && !requested) });
      }
    });
  });
}

async function checkForWebUpdate(force = false): Promise<void> {
  const registration = serviceWorkerRegistration;
  if (!registration) return;

  const now = Date.now();
  if (!webUpdateCheckDue(lastServiceWorkerUpdateCheck, now, force)) return;
  lastServiceWorkerUpdateCheck = now;
  await registration.update();
}

export async function registerWebServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  if (serviceWorkerRegistration) return serviceWorkerRegistration;

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  trackRegistration(registration);
  await checkForWebUpdate(true);
  return registration;
}

export async function applyWebUpdate(): Promise<boolean> {
  const registration = serviceWorkerRegistration ?? await registerWebServiceWorker();
  if (!registration) return false;

  if (!registration.waiting) await registration.update();
  if (!registration.waiting) return false;

  const activationRequested = requestWaitingWebUpdate(
    registration,
    Boolean(navigator.serviceWorker.controller),
  );
  reloadOnControllerChange = activationRequested;
  return activationRequested;
}

export async function promptWebInstall(): Promise<InstallPromptResult> {
  const prompt = deferredInstallPrompt;
  if (!prompt) return "unavailable";

  deferredInstallPrompt = null;
  emit({ installAvailable: false });
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome;
}

export function getWebEnvironment(): WebEnvironmentSnapshot {
  return snapshot;
}

export function subscribeWebEnvironment(listener: EnvironmentListener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

export function initializeWebEnvironment(): Promise<void> {
  if (initialization) return initialization;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve();
  }

  initialization = (async () => {
    emit({
      displayMode: detectDisplayMode(),
      installed: detectDisplayMode() === "standalone",
      online: navigator.onLine,
    });

    const displayModeQuery = window.matchMedia("(display-mode: standalone)");
    displayModeQuery.addEventListener("change", () => {
      const displayMode = detectDisplayMode();
      emit({ displayMode, installed: displayMode === "standalone" });
      void refreshNotificationCapability();
    });

    window.addEventListener("online", () => emit({ online: true }));
    window.addEventListener("offline", () => emit({ online: false }));
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event as BeforeInstallPromptEvent;
      emit({ installAvailable: true });
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      emit({
        displayMode: detectDisplayMode(),
        installAvailable: false,
        installed: true,
      });
    });

    navigator.serviceWorker?.addEventListener("controllerchange", () => {
      emit({ updateAvailable: false });
      if (!reloadOnControllerChange) return;
      reloadOnControllerChange = false;
      window.location.reload();
    });

    window.addEventListener("focus", () => {
      void checkForWebUpdate().catch(() => undefined);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void checkForWebUpdate().catch(() => undefined);
      }
    });

    // Registration is a shell capability, not a notification capability. A
    // browser without PushManager still gets offline shell and update support.
    await registerWebServiceWorker().catch((error) => {
      console.error("Web service worker registration failed:", error);
      return null;
    });
    await refreshNotificationCapability();
  })();

  return initialization;
}

export const webEnvironment = {
  subscribe: subscribeWebEnvironment,
  getSnapshot: getWebEnvironment,
  initialize: initializeWebEnvironment,
  promptInstall: promptWebInstall,
  applyUpdate: applyWebUpdate,
  refreshNotificationCapability,
};
