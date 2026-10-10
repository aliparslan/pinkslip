import { createApiClient, type ApiClient } from "@pinkslip/core/api";
import * as SecureStore from "expo-secure-store";

export type { ApiClient };

const TOKEN_KEY = "pinkslip-native-token";

/** Production unless a dev build points elsewhere (`EXPO_PUBLIC_API_URL`, e.g.
 * the local Worker at http://127.0.0.1:3000/api/v2). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://pinkslip.work/api/v2";
export const WEB_URL = API_URL.replace(/\/api\/v2\/?$/, "");

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

/**
 * The app's one bearer client. The token lives in the Keychain; the API
 * returns a new one (`native_token`) when the session changes (sign-in, sign
 * out), and `onAccessToken` stores it. An invalid token is replaced with a
 * fresh guest session once, unless another request already rotated it.
 */
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

/** Forgets the session (after account deletion) and starts a new guest. */
export async function resetSession(): Promise<void> {
  await storeToken(null);
  await startGuestSession();
}
