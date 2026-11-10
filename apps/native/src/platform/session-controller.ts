import { createApiClient, type ApiClientConfig } from "@pinkslip/core/api";

/** Keychain access is injected so launch retry, concurrent recovery and token
 * persistence can be exercised without booting Expo. */
export function createSessionController(options: {
  baseUrl: string;
  fetch?: ApiClientConfig["fetch"];
  readToken(): Promise<string | null>;
  writeToken(token: string | null): Promise<void>;
  /** The app was just installed. iOS keeps the Keychain when an app is
   * deleted, so a reinstall would come back signed in, behind onboarding
   * meant for someone new; a fresh install forgets the kept token and starts
   * as a guest instead (owner, 2026-11-06, as most apps do). */
  freshInstall?: boolean;
  /** The server no longer accepts this phone's session (it was signed out
   * from somewhere else, say), and a guest one has taken its place. */
  onRejected?(): void;
}) {
  let token: string | null = null;
  let revision = 0;
  let loaded = false;
  let persisted: string | null | undefined;
  let initializing: Promise<typeof api> | null = null;
  let recovering: Promise<void> | null = null;
  let minting: Promise<void> | null = null;
  let guestToken: string | null = null;
  let writes: Promise<void> = Promise.resolve();
  const store = async (next: string | null) => {
    token = next;
    revision += 1;
    const write = writes.then(async () => { await options.writeToken(next); persisted = next; });
    writes = write.catch(() => undefined);
    await write;
  };
  const guest = (): Promise<void> => {
    if (minting) return minting.then(() => { if (!token) return guest(); });
    const expected = revision;
    minting = api.native.startSession().then(async (session) => {
      // A sign-in that finished while this guest request was running wins.
      if (revision !== expected) return;
      await store(session.token);
      guestToken = session.token;
    }).finally(() => { minting = null; });
    return minting;
  };
  const api = createApiClient({
    baseUrl: options.baseUrl, fetch: options.fetch, client: "ios",
    getAccessToken: () => token,
    onAccessToken: store,
    onInvalidAccessToken: async (rejected) => {
      if (token && rejected !== token) return;
      if (recovering) return recovering;
      const expected = revision + 1;
      recovering = store(null).then(async () => {
        if (revision !== expected) return;
        await guest();
        // Not when a sign-in finished meanwhile: that session is the one in use.
        if (token && token === guestToken) options.onRejected?.();
      }).finally(() => { recovering = null; });
      return recovering;
    },
  });
  return {
    api,
    currentToken: () => token,
    initialize() {
      if (initializing) return initializing;
      initializing = (async () => {
        if (!loaded) {
          // A failed delete is overwritten by the guest token stored below.
          if (options.freshInstall) await options.writeToken(null).catch(() => undefined);
          token = options.freshInstall ? null : await options.readToken();
          persisted = token;
          loaded = true;
        }
        if (!token) await guest();
        if (persisted !== token) await store(token);
        return api;
      })().finally(() => { initializing = null; });
      return initializing;
    },
    async reset() { await store(null); await guest(); },
  };
}
