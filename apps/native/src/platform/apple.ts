import type { ApiClient, MeResponse } from "@pinkslip/core/api";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

export const appleSignInAvailable = () => AppleAuthentication.isAvailableAsync();

/** Thrown when the person closes the Apple sheet: not an error to show. */
export class AppleSignInCanceled extends Error {}

/**
 * Native Sign in with Apple. The nonce goes to Apple (which embeds it in the
 * identity token) and to the API (which checks they match), as the Capacitor
 * app did. The API answers with the account and a new bearer token.
 */
export async function signInWithApple(api: ApiClient): Promise<MeResponse> {
  const nonce = Crypto.randomUUID();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED") throw new AppleSignInCanceled();
    throw error;
  }
  if (!credential.identityToken) throw new Error("Apple didn't return an identity token.");
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ") || undefined;
  return api.auth.signInWithApple({
    identityToken: credential.identityToken,
    authorizationCode: credential.authorizationCode ?? undefined,
    user: credential.user,
    email: credential.email ?? undefined,
    fullName,
    nonce,
  });
}
