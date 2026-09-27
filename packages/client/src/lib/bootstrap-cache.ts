import type { MeResponse, PreferenceState } from "./api";

export interface BootstrapSnapshot {
  me: MeResponse;
  preferences: PreferenceState;
}

interface BootstrapCacheEnvelope {
  version: 1;
  value: BootstrapSnapshot;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const BOOTSTRAP_CACHE_KEY = "pinkslip:native-bootstrap:v1";

function availableStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isBootstrapSnapshot(value: unknown): value is BootstrapSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<BootstrapSnapshot>;
  return Boolean(
    snapshot.me
    && typeof snapshot.me === "object"
    && snapshot.me.session
    && typeof snapshot.me.session.state === "string"
    && snapshot.preferences
    && typeof snapshot.preferences === "object"
    && snapshot.preferences.search_profile
    && typeof snapshot.preferences.search_profile === "object"
  );
}

export function readBootstrapCache(storage: StorageLike | null = availableStorage()): BootstrapSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BootstrapCacheEnvelope>;
    if (parsed.version !== 1 || !isBootstrapSnapshot(parsed.value)) {
      storage.removeItem(BOOTSTRAP_CACHE_KEY);
      return null;
    }
    return parsed.value;
  } catch {
    try {
      storage.removeItem(BOOTSTRAP_CACHE_KEY);
    } catch {
      // Treat an inaccessible WebView storage area as an empty cache.
    }
    return null;
  }
}

export function writeBootstrapCache(
  snapshot: BootstrapSnapshot,
  storage: StorageLike | null = availableStorage(),
): void {
  if (!storage) return;
  try {
    const safeSnapshot: BootstrapSnapshot = {
      ...snapshot,
      me: { ...snapshot.me, native_token: undefined },
    };
    storage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify({ version: 1, value: safeSnapshot }));
  } catch {
    // Startup caching is opportunistic. The live bootstrap remains authoritative.
  }
}

export function clearBootstrapCache(storage: StorageLike | null = availableStorage()): void {
  try {
    storage?.removeItem(BOOTSTRAP_CACHE_KEY);
  } catch {
    // Storage can be unavailable in private or constrained WebViews.
  }
}
