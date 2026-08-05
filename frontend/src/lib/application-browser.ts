import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";

interface ApplicationBrowserPlugin {
  open(options: { url: string }): Promise<void>;
  addListener(
    eventName: "finished",
    listener: () => void
  ): Promise<PluginListenerHandle>;
}

const ApplicationBrowser = registerPlugin<ApplicationBrowserPlugin>("ApplicationBrowser");

export function normalizeExternalUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function openExternalWindow(rawUrl: string): void {
  const url = normalizeExternalUrl(rawUrl);
  if (!url) return;
  const externalWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (externalWindow) externalWindow.opener = null;
  else window.location.assign(url);
}

export async function openNativeApplicationBrowser(
  rawUrl: string,
  onFinished?: () => void
): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) throw new Error("Native browser unavailable");
  const url = normalizeExternalUrl(rawUrl);
  if (!url) throw new Error("A valid URL is required");

  let handle: PluginListenerHandle | null = null;
  try {
    if (onFinished) {
      handle = await ApplicationBrowser.addListener("finished", onFinished);
    }
    await ApplicationBrowser.open({ url });
    return () => void handle?.remove();
  } catch (error) {
    await handle?.remove();
    throw error;
  }
}

export async function openInAppBrowser(rawUrl: string): Promise<void> {
  try {
    await openNativeApplicationBrowser(rawUrl);
  } catch {
    // Web and older installed builds still get a safe external fallback.
    openExternalWindow(rawUrl);
  }
}
