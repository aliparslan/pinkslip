/* The app's session with the Pinkslip API.

   Same contract as the Capacitor app: a bearer token in the Keychain, sent
   with an "ios" client header. A token the server rotates is saved; one it
   rejects is cleared and replaced with a fresh guest session. Because the
   Keychain item is the one the old app used, updating keeps people signed
   in. */

import * as Application from "expo-application";
import { api, ApiError, configureApiClient } from "@pinkslip/core/api";
import { sessionKeychain } from "../../modules/session-keychain";
import { DEMO } from "./demo";

export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_ORIGIN ?? "https://pinkslip.work").replace(/\/$/, "");

let accessToken: string | null = null;
let started: Promise<void> | null = null;

/** Headers for requests made outside the API client, such as logo images. */
export function authHeaders(): Record<string, string> {
  return {
    "X-Pinkslip-Client": "ios",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function startGuestSession(): Promise<void> {
  try {
    const session = await api.native.startSession();
    accessToken = session.token;
    await sessionKeychain.set(session.token);
  } catch (error) {
    // A server that requires an access code says so per request; the app
    // still opens and shows that state instead of failing to launch.
    if (!(error instanceof ApiError && error.code === "access_required")) throw error;
  }
}

/** Configure the API client and make sure there is a session. Safe to call
 * more than once; later calls wait on the first. */
export function startSession(): Promise<void> {
  if (DEMO) return Promise.resolve();
  started ??= (async () => {
    accessToken = await sessionKeychain.get().catch(() => null);
    configureApiClient({
      baseUrl: `${API_ORIGIN}/api/v2`,
      client: "ios",
      build: `${Application.nativeApplicationVersion ?? "0"}.${Application.nativeBuildVersion ?? "0"}`,
      getAccessToken: () => accessToken,
      onAccessToken: async (token) => {
        accessToken = token;
        await sessionKeychain.set(token);
      },
      onInvalidAccessToken: async (rejectedToken) => {
        // Another request may already have rotated the token; retry with the
        // newer one rather than dropping a signed-in session.
        if (rejectedToken && accessToken && rejectedToken !== accessToken) return;
        accessToken = null;
        await sessionKeychain.clear().catch(() => undefined);
        await startGuestSession();
      },
    });
    if (!accessToken) await startGuestSession();
  })().catch((error: unknown) => {
    started = null;
    throw error;
  });
  return started;
}
