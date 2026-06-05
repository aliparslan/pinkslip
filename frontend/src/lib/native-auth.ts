import { App } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";

interface AppleSignInPlugin {
  signIn(options?: { nonce?: string; state?: string }): Promise<{
    identityToken: string;
    authorizationCode?: string;
    user: string;
    email?: string;
    fullName?: string;
    state?: string;
    nonce?: string;
  }>;
}

const AppleSignIn = registerPlugin<AppleSignInPlugin>("AppleSignIn");

export function isNativeIosAuthAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function signInWithAppleNative() {
  if (!isNativeIosAuthAvailable()) {
    throw new Error("Sign in with Apple is only available in the iOS app.");
  }
  return AppleSignIn.signIn();
}

export function isMagicLinkUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/auth/email/verify";
  } catch {
    return false;
  }
}

function magicLinkToken(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.pathname !== "/auth/email/verify") return null;
    return parsed.searchParams.get("token");
  } catch {
    return null;
  }
}

/**
 * Watches for an incoming Sign-in-with-email magic link (universal link) and
 * hands the one-time token to `onToken` for an in-app exchange.
 *
 * IMPORTANT: `App.getLaunchUrl()` keeps returning the URL the app was cold-
 * launched with on every call, so we must dedupe by token — otherwise a token
 * that's already been consumed gets retried on every mount, which previously
 * caused an infinite reload loop. The token is exchanged via fetch (no page
 * navigation), so the WebView never reloads.
 */
export function attachMagicLinkHandler(onToken: (token: string) => void) {
  const handled = new Set<string>();
  const handle = (url: string | undefined | null) => {
    const token = magicLinkToken(url);
    if (!token || handled.has(token)) return;
    handled.add(token);
    onToken(token);
  };

  const listener = App.addListener("appUrlOpen", ({ url }) => handle(url));
  App.getLaunchUrl()
    .then((launch) => handle(launch?.url))
    .catch(() => undefined);

  return () => {
    void listener.then((handle) => handle.remove());
  };
}
