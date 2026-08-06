import { writable } from "svelte/store";
import { api } from "./api";

let current = new Set<string>();
let currentUserId: string | null = null;

/** Account-scoped viewed jobs synchronized through the API. */
export const viewedJobs = writable<Set<string>>(current);

export function setViewedJobsSession(userId: string | null) {
  if (userId === currentUserId) return;
  currentUserId = userId;
  current = new Set();
  viewedJobs.set(new Set());
}

export async function syncViewedJobs() {
  const result = await api.interactions.viewedJobs();
  current = new Set([...result.job_ids, ...current]);
  viewedJobs.set(new Set(current));
}

/** Mark locally immediately, then persist for the current account. */
export function markViewed(id: string) {
  current.add(id);
  viewedJobs.set(new Set(current));
  void api.interactions.markViewed(id).catch(() => undefined);
}

/** Update read state optimistically and restore it if persistence fails. */
export async function setViewed(id: string, value: boolean): Promise<void> {
  const previous = current.has(id);
  if (value) current.add(id);
  else current.delete(id);
  viewedJobs.set(new Set(current));

  try {
    if (value) await api.interactions.markViewed(id);
    else await api.interactions.markUnviewed(id);
  } catch (error) {
    if (previous) current.add(id);
    else current.delete(id);
    viewedJobs.set(new Set(current));
    throw error;
  }
}
