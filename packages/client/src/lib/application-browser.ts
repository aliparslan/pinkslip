import { normalizeExternalUrl, platform } from "./platform";

export { normalizeExternalUrl } from "./platform";

export function openExternalWindow(rawUrl: string): void {
  platform().openExternal(rawUrl);
}

export async function openNativeApplicationBrowser(
  rawUrl: string,
  onFinished?: () => void
): Promise<() => void> {
  return platform().openApplication(rawUrl, onFinished);
}

export async function openInAppBrowser(rawUrl: string): Promise<void> {
  try {
    await openNativeApplicationBrowser(rawUrl);
  } catch {
    // Web and older installed builds still get a safe external fallback.
    openExternalWindow(rawUrl);
  }
}
