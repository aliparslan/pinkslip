import { platform } from "./platform";

export function isNativeIosAuthAvailable() {
  return platform().auth.appleAvailable();
}

export async function signInWithAppleNative() {
  return platform().auth.signInWithApple();
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
  return platform().auth.attachMagicLink(onToken);
}
