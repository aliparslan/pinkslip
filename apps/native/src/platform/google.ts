import type { ApiClient, MeResponse } from "@pinkslip/core/api";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

/** Thrown when the person closes Google's sheet: not an error to show. */
export class GoogleSignInCanceled extends Error {}

/**
 * Google in the iPhone's own sign-in sheet. The API starts a flow bound to
 * this session and answers with Google's page; Google sends the person back
 * to the API, which keeps the identity it confirmed and returns the sheet to
 * pinkslip://auth/google. The app then collects that identity on its own
 * session. Signed in already, the same steps add Google to the account.
 */
export async function signInWithGoogle(api: ApiClient): Promise<MeResponse> {
  const { url, return_url: returnUrl } = await api.auth.startGoogleNative();
  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  if (result.type !== "success") throw new GoogleSignInCanceled();
  const { queryParams } = Linking.parse(result.url);
  const outcome = typeof queryParams?.result === "string" ? queryParams.result : null;
  const state = typeof queryParams?.state === "string" ? queryParams.state : null;
  if (outcome === "cancelled") throw new GoogleSignInCanceled();
  if (outcome !== "success" || !state) throw new Error("Google sign-in didn't finish.");
  return api.auth.finishGoogleNative(state);
}
