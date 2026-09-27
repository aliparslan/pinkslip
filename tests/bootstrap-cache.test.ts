import { describe, expect, test } from "bun:test";
import {
  BOOTSTRAP_CACHE_KEY,
  clearBootstrapCache,
  readBootstrapCache,
  writeBootstrapCache,
  type BootstrapSnapshot,
} from "../packages/client/src/lib/bootstrap-cache";
import { DEFAULT_SEARCH_PROFILE } from "../shared/search-profile";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const snapshot: BootstrapSnapshot = {
  me: {
    user: { id: "u1", name: "Alip", role: "user", created_at: "2026-08-27" },
    session: { state: "authenticated" },
    account: { authenticated: true, email: "alip@example.com", providers: ["email"] },
    is_admin: false,
    native_token: "never-persist-this",
  },
  preferences: {
    search_profile: {
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["software_engineering"],
      primary_role: "software_engineering",
      location_ids: [],
      work_modes: ["remote"],
      relocation_willing: false,
      onboarding_version: 2,
      onboarding_completed_at: "2026-08-27T00:00:00.000Z",
    },
  },
};

describe("native bootstrap cache", () => {
  test("round-trips presentation state without persisting the bearer token", () => {
    const storage = new MemoryStorage();
    writeBootstrapCache(snapshot, storage);

    const raw = storage.getItem(BOOTSTRAP_CACHE_KEY) ?? "";
    expect(raw).not.toContain("never-persist-this");
    expect(readBootstrapCache(storage)?.me.user?.name).toBe("Alip");
  });

  test("discards malformed or obsolete entries", () => {
    const storage = new MemoryStorage();
    storage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({ version: 0, value: snapshot }));
    expect(readBootstrapCache(storage)).toBeNull();
    expect(storage.getItem(BOOTSTRAP_CACHE_KEY)).toBeNull();
  });

  test("can be cleared when the native identity changes", () => {
    const storage = new MemoryStorage();
    writeBootstrapCache(snapshot, storage);
    clearBootstrapCache(storage);
    expect(readBootstrapCache(storage)).toBeNull();
  });
});
