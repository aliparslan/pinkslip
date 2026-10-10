import { useSyncExternalStore } from "react";

/** A job whose application page the person opened. */
export interface ApplicationIntent {
  jobId: string;
  title: string;
  company: string;
  openedAt: number;
}

const STORAGE_KEY = "pinkslip:application-intent";
// Ignore the focus flicker as the new tab opens.
const RETURN_GUARD_MS = 750;
const MAX_INTENT_AGE_MS = 12 * 60 * 60 * 1000;

let pending: ApplicationIntent | null = null;
let stopWatching: (() => void) | null = null;
const listeners = new Set<() => void>();

function setPending(next: ApplicationIntent | null) {
  pending = next;
  for (const listener of listeners) listener();
}

function store(intent: ApplicationIntent | null) {
  try {
    if (intent) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private modes); the prompt still works in this tab.
  }
}

function stored(): ApplicationIntent | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ApplicationIntent> | null;
    if (!parsed || typeof parsed.jobId !== "string" || typeof parsed.title !== "string"
      || typeof parsed.company !== "string" || typeof parsed.openedAt !== "number"
      || Date.now() - parsed.openedAt > MAX_INTENT_AGE_MS) return null;
    return parsed as ApplicationIntent;
  } catch {
    return null;
  }
}

/** `application-intent.svelte.ts` for the web: open the application in a new
 * tab and, when the person comes back to this one, ask whether they applied.
 * The intent survives a reload (an installed app that was evicted while the
 * person was away) for the rest of the browser session. */
export function openApplication(job: { id: string; title: string; company_name: string; url: string }, ask = true) {
  if (!ask) {
    window.open(job.url, "_blank", "noopener,noreferrer");
    return;
  }
  const intent: ApplicationIntent = { jobId: job.id, title: job.title, company: job.company_name, openedAt: Date.now() };
  stopWatching?.();
  store(intent);

  let armed = false;
  let left = false;
  const maybePresent = () => {
    if (!armed || !left || document.visibilityState === "hidden") return;
    cleanup();
    setPending(intent);
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") left = true;
    else maybePresent();
  };
  const onBlur = () => { left = true; };
  const timer = window.setTimeout(() => { armed = true; maybePresent(); }, RETURN_GUARD_MS);
  const cleanup = () => {
    window.clearTimeout(timer);
    window.removeEventListener("focus", maybePresent);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    if (stopWatching === cleanup) stopWatching = null;
  };
  window.addEventListener("focus", maybePresent);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);
  stopWatching = cleanup;

  window.open(job.url, "_blank", "noopener,noreferrer");
}

/** Picks up an intent from before a reload. Call once on mount. */
export function restoreApplicationIntent() {
  const intent = stored();
  if (intent && !pending && !stopWatching && Date.now() - intent.openedAt >= RETURN_GUARD_MS) setPending(intent);
}

export function dismissApplicationIntent() {
  store(null);
  setPending(null);
}

export function useApplicationIntent(): ApplicationIntent | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
    () => null,
  );
}
