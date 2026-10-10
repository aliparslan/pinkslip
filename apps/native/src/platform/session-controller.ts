import { createApiClient, type ApiClientConfig } from "@pinkslip/core/api";

/** Keychain access is injected so launch retry, concurrent recovery and token
 * persistence can be exercised without booting Expo. */
export function createSessionController(options: {
  baseUrl: string;
  fetch?: ApiClientConfig["fetch"];
  readToken(): Promise<string | null>;
  writeToken(token: string | null): Promise<void>;
}) {
  let token: string | null = null;
  let revision = 0;
  let loaded = false;
  let persisted: string | null | undefined;
  let initializing: Promise<typeof api> | null = null;
  let recovering: Promise<void> | null = null;
  let minting: Promise<void> | null = null;
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
      if (revision === expected) await store(session.token);
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
        if (revision === expected) await guest();
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
        if (!loaded) { token = await options.readToken(); persisted = token; loaded = true; }
        if (!token) await guest();
        if (persisted !== token) await store(token);
        return api;
      })().finally(() => { initializing = null; });
      return initializing;
    },
    async reset() { await store(null); await guest(); },
  };
}
