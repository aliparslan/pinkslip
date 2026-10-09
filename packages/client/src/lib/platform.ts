import type { Job } from "@pinkslip/core/api";

export type PlatformKind = "web" | "ios";
export type NotificationStatus =
  | "unsupported"
  | "requires-install"
  | "promptable"
  | "disabled"
  | "denied"
  | "enabled";
export type NotificationEnableResult = NotificationStatus;

export interface AppleCredential {
  identityToken: string;
  authorizationCode?: string;
  user: string;
  email?: string;
  fullName?: string;
  state?: string;
  nonce?: string;
}

export interface PlatformActionMenuItem {
  id: string;
  title: string;
  symbol?: string;
  destructive?: boolean;
  disabled?: boolean;
}

export interface PlatformActionMenuOptions {
  source: { x: number; y: number; width: number; height: number };
  actions: PlatformActionMenuItem[];
}

export interface PlatformFileExportOptions {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

export type PlatformFileExportResult = "downloaded" | "presented";

export interface ApplicationBrowserEvents {
  /** A page finished loading; read it again. */
  onLoaded?: (url: string) => void;
  /** The user tapped Fill. */
  onRefill?: () => void;
  /** The browser closed. */
  onFinished?: () => void;
}

export interface ApplicationBrowserSession {
  open(url: string, events: ApplicationBrowserEvents): Promise<() => void>;
  /** Runs `body` as an async function in the form page; it must return a string. */
  run(body: string): Promise<string>;
  setStatus(text: string): Promise<void>;
  close(): Promise<void>;
}

export interface PlatformRuntime {
  readonly kind: PlatformKind;
  initialize(): Promise<void>;
  notifications: {
    initialize(): Promise<void>;
    status(): Promise<NotificationStatus>;
    enable(): Promise<NotificationEnableResult>;
    openSettings(): Promise<void>;
  };
  auth: {
    appleAvailable(): boolean;
    signInWithApple(): Promise<AppleCredential>;
    attachMagicLink(onToken: (token: string) => void): () => void;
  };
  haptics: {
    light(): void;
    success(): void;
  };
  actionMenu: {
    present(options: PlatformActionMenuOptions): Promise<string | null>;
  };
  exportFile(options: PlatformFileExportOptions): Promise<PlatformFileExportResult>;
  shareLink(options: { title?: string; text?: string; url: string }): Promise<void>;
  openApplication(url: string, onFinished?: () => void): Promise<() => void>;
  /** Opens an application form and runs an autofill script in it. Only the
   * iOS app can do this; elsewhere the form opens without filling. */
  openApplicationWithAutofill?(url: string, script: string, onFinished?: () => void): Promise<() => void>;
  /** A form browser the app drives step by step (iOS only). */
  applicationBrowser?: ApplicationBrowserSession;
  openExternal(url: string): void;
}

let runtime: PlatformRuntime | null = null;

export function installPlatform(nextRuntime: PlatformRuntime): void {
  if (runtime && runtime.kind !== nextRuntime.kind) {
    throw new Error(`Platform runtime already configured for ${runtime.kind}.`);
  }
  runtime = nextRuntime;
  document.documentElement.dataset.appPlatform = nextRuntime.kind;
}

export function platform(): PlatformRuntime {
  if (!runtime) throw new Error("Platform runtime has not been initialized.");
  return runtime;
}

export function platformKind(): PlatformKind {
  return platform().kind;
}

export function isIosApp(): boolean {
  return runtime?.kind === "ios";
}

export function normalizeExternalUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function openWebWindow(rawUrl: string): void {
  const url = normalizeExternalUrl(rawUrl);
  if (!url) return;
  // With `noopener`, browsers are allowed to return null even when the new tab
  // opened successfully. Falling back to location.assign in that case opens
  // the destination twice and replaces Pinkslip in the current tab.
  window.open(url, "_blank", "noopener,noreferrer");
}

export type { Job };
