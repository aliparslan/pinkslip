// Share via the native iOS share sheet inside the Capacitor shell, falling back
// to the Web Share API, then to copying the URL to the clipboard.

import { platform } from "./platform";

export async function shareLink(opts: { title?: string; text?: string; url: string }): Promise<void> {
  await platform().shareLink(opts);
}
