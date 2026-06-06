// Share via the native iOS share sheet inside the Capacitor shell, falling back
// to the Web Share API, then to copying the URL to the clipboard.

import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

export async function shareLink(opts: { title?: string; text?: string; url: string }): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title: opts.title, text: opts.text, url: opts.url });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
      return;
    }
    await navigator.clipboard?.writeText(opts.url);
  } catch {
    // User cancelled the share sheet, or sharing is unavailable — ignore.
  }
}
