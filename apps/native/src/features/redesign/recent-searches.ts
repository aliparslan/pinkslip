import { useSyncExternalStore } from "react";
import { storage } from "../../platform/storage";

/** What you searched for lately, newest first, kept on this phone only. */
const KEY = "recent-searches";
const LIMIT = 6;
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(storage.getString(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: string[]) {
  cache = next;
  if (next.length > 0) storage.set(KEY, JSON.stringify(next));
  else storage.remove(KEY);
  for (const listener of listeners) listener();
}

export function rememberSearch(text: string) {
  const query = text.trim();
  if (query.length < 2) return;
  write([query, ...read().filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, LIMIT));
}

export function clearRecentSearches() {
  write([]);
}

export function useRecentSearches(): string[] {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, read);
}
