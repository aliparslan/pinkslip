import { createApiClient, type ApiClient } from "@pinkslip/core/api";
import * as SecureStore from "expo-secure-store";

export type { ApiClient };

const TOKEN_KEY = "pinkslip-native-token";
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3000/api/v2";

let client: ApiClient | null = null;
let accessToken: string | null = null;

async function storeToken(token: string | null): Promise<void> {
  accessToken = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => undefined);
  else await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
}

async function startGuestSession(): Promise<void> {
  if (!client) throw new Error("API client is not ready");
  const session = await client.native.startSession();
  await storeToken(session.token);
}

/** One bearer client for the app. `onInvalidAccessToken` re-mints a guest
 * session unless another exchange already rotated the token. */
export async function initializeSession(): Promise<ApiClient> {
  if (client) return client;
  accessToken = (await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null)) ?? null;
  client = createApiClient({
    baseUrl: API_URL,
    client: "ios",
    getAccessToken: () => accessToken,
    onAccessToken: (token) => storeToken(token),
    onInvalidAccessToken: async (rejected) => {
      if (rejected && accessToken && rejected !== accessToken) return;
      await storeToken(null);
      await startGuestSession();
    },
  });
  if (!accessToken) await startGuestSession();
  return client;
}

/** Drops the stored bearer token and mints a fresh guest session; the
 * prototype uses this to exercise rotation and owner-change clearing. */
export async function rotateSession(): Promise<void> {
  await storeToken(null);
  await startGuestSession();
}

/** Prototype-only: seed the Keychain with a harness bearer token so the
 * authenticated resume-import path can be exercised before sign-in (6.3). */
export async function useDevBearerToken(token: string): Promise<void> {
  await storeToken(token);
}
