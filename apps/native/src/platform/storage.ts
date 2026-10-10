import { createMMKV } from "react-native-mmkv";

/** Fast synchronous key-value storage for preferences and the persisted
 * Query cache. Secrets (the bearer token) live in the Keychain instead. */
export const storage = createMMKV({ id: "pinkslip" });
