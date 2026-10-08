import { requireOptionalNativeModule } from "expo";

/** The session token, kept in the Keychain on iOS. */
export interface SessionKeychain {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

const native = requireOptionalNativeModule<SessionKeychain>("SessionKeychain");

/* The web preview has no Keychain. It keeps the token in memory, which is
   enough to look at screens; it is never shipped. */
let memory: string | null = null;
const preview: SessionKeychain = {
  get: async () => memory,
  set: async (token) => {
    memory = token;
  },
  clear: async () => {
    memory = null;
  },
};

export const sessionKeychain: SessionKeychain = native ?? preview;
