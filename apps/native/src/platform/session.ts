import type { ApiClient } from "@pinkslip/core/api";
import * as SecureStore from "expo-secure-store";
import { createSessionController } from "./session-controller";
import { API_URL } from "./config";
import { appRanBefore } from "./first-launch";
export { API_URL, WEB_URL } from "./config";

export type { ApiClient };

const TOKEN_KEY = "pinkslip-native-token";

const rejections = new Set<() => void>();

/** Runs when the server has ended this phone's session and the app is a
 * guest again, so whatever shows the account can say so and reload. */
export function onSessionRejected(listener: () => void): () => void {
  rejections.add(listener);
  return () => { rejections.delete(listener); };
}

const controller = createSessionController({
  baseUrl: API_URL,
  readToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  writeToken: (token) => token ? SecureStore.setItemAsync(TOKEN_KEY, token) : SecureStore.deleteItemAsync(TOKEN_KEY),
  freshInstall: !appRanBefore,
  onRejected: () => { for (const listener of rejections) listener(); },
});
export const currentSessionToken = controller.currentToken;

/**
 * The app's one bearer client. The token lives in the Keychain; the API
 * returns a new one (`native_token`) when the session changes (sign-in, sign
 * out), and `onAccessToken` stores it. An invalid token is replaced with a
 * fresh guest session once, unless another request already rotated it.
 */
export async function initializeSession(): Promise<ApiClient> {
  return controller.initialize();
}

/** Forgets the session (after account deletion) and starts a new guest. */
export async function resetSession(): Promise<void> {
  await controller.reset();
}
