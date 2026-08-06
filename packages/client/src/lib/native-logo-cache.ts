import { apiFetch } from "./api";

export interface NativeLogoLease {
  url: Promise<string | null>;
  release: () => void;
}

interface CacheEntry {
  refs: number;
  settled: boolean;
  value: string | null;
  promise: Promise<string | null>;
}

export function createNativeLogoCache({
  maxEntries = 256,
  revoke = (url: string) => URL.revokeObjectURL(url),
}: {
  maxEntries?: number;
  revoke?: (url: string) => void;
} = {}) {
  const capacity = Math.max(1, Math.floor(maxEntries));
  const entries = new Map<string, CacheEntry>();

  function touch(key: string, entry: CacheEntry) {
    if (entries.get(key) !== entry) return;
    entries.delete(key);
    entries.set(key, entry);
  }

  function evictOverflow() {
    while (entries.size > capacity) {
      const candidate = Array.from(entries).find(([, entry]) => entry.settled && entry.refs === 0);
      if (!candidate) return;
      const [key, entry] = candidate;
      entries.delete(key);
      if (entry.value) revoke(entry.value);
    }
  }

  function acquire(key: string, load: () => Promise<string | null>): NativeLogoLease {
    let entry = entries.get(key);
    if (entry) {
      entry.refs += 1;
      touch(key, entry);
    } else {
      const nextEntry: CacheEntry = {
        refs: 1,
        settled: false,
        value: null,
        promise: Promise.resolve(null),
      };
      nextEntry.promise = Promise.resolve()
        .then(load)
        .then((value) => {
          nextEntry.settled = true;
          nextEntry.value = value;
          if (entries.get(key) !== nextEntry) {
            if (value) revoke(value);
            return null;
          }
          if (!value) entries.delete(key);
          else touch(key, nextEntry);
          evictOverflow();
          return value;
        })
        .catch(() => {
          nextEntry.settled = true;
          if (entries.get(key) === nextEntry) entries.delete(key);
          return null;
        });
      entry = nextEntry;
      entries.set(key, entry);
      evictOverflow();
    }

    let released = false;
    return {
      url: entry.promise,
      release() {
        if (released) return;
        released = true;
        entry.refs = Math.max(0, entry.refs - 1);
        evictOverflow();
      },
    };
  }

  function invalidate(key: string) {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    if (entry.value) revoke(entry.value);
  }

  function clear() {
    for (const entry of entries.values()) {
      if (entry.value) revoke(entry.value);
    }
    entries.clear();
  }

  return {
    acquire,
    invalidate,
    clear,
    get size() { return entries.size; },
  };
}

// One cache for the whole native client. Keeping this outside CompanyLogo's
// instance script lets virtualized rows and navigation snapshots share leases,
// while the bounded LRU-style eviction prevents blob URLs from growing without
// limit during long feed and company-list sessions.
const sharedNativeLogoCache = createNativeLogoCache({ maxEntries: 256 });

export function acquireNativeCompanyLogo(domain: string): NativeLogoLease {
  return sharedNativeLogoCache.acquire(domain, async () => {
    const response = await apiFetch(`/logo?domain=${encodeURIComponent(domain)}`, {
      headers: { Accept: "image/*" },
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 ? URL.createObjectURL(blob) : null;
  });
}

export function invalidateNativeCompanyLogo(domain: string): void {
  sharedNativeLogoCache.invalidate(domain);
}
