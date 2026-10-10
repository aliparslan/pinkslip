import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import { storage } from "./storage";

/** The Query cache, saved to disk so the app opens on its last data and
 * refreshes in the background. Cleared with the personal queries when the
 * owner changes (the shared `useOwnerChangeCleanup`), and dropped on app
 * updates (`buster`) and after a week. */
export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: createSyncStoragePersister({
    storage: {
      getItem: (key) => storage.getString(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => { storage.remove(key); },
    },
    key: "query-cache",
    throttleTime: 1_000,
  }),
  maxAge: 7 * 24 * 60 * 60 * 1000,
  buster: Constants.expoConfig?.version ?? "dev",
  dehydrateOptions: {
    // Only finished, successful reads; the session is always re-checked.
    shouldDehydrateQuery: (query) => query.state.status === "success" && query.queryKey[0] !== "session",
  },
};
