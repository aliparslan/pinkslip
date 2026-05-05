import { writable } from "svelte/store";

const KEY = "pinkslip_viewed";
const MAX = 2000;

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function persist(s: Set<string>) {
  const arr = [...s];
  if (arr.length > MAX) arr.splice(0, arr.length - MAX);
  localStorage.setItem(KEY, JSON.stringify(arr));
}

const _set = load();

/** Reactive store of viewed job IDs. Subscribe with $viewedJobs. */
export const viewedJobs = writable<Set<string>>(_set);

/** Mark a job as viewed (persists to localStorage). */
export function markViewed(id: string) {
  _set.add(id);
  persist(_set);
  viewedJobs.set(new Set(_set));
}
