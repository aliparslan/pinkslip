import type { Job } from "./api";

export type PlatformKind = "web" | "ios";
export type NotificationStatus = "enabled" | "disabled";
export type NotificationEnableResult = "enabled" | "denied";

export interface AppleCredential {
  identityToken: string;
  authorizationCode?: string;
  user: string;
  email?: string;
  fullName?: string;
  state?: string;
  nonce?: string;
}

export interface PlatformRuntime {
  readonly kind: PlatformKind;
  initialize(): Promise<void>;
  notifications: {
    initialize(): Promise<void>;
    status(): Promise<NotificationStatus>;
    enable(): Promise<NotificationEnableResult>;
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
  shareLink(options: { title?: string; text?: string; url: string }): Promise<void>;
  openApplication(url: string, onFinished?: () => void): Promise<() => void>;
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
  const externalWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (externalWindow) externalWindow.opener = null;
  else window.location.assign(url);
}

export type { Job };
