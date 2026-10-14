import type { ForwardingProvider, ForwardingScope } from "@pinkslip/core/api";
import { useSyncExternalStore } from "react";
import { storage } from "../../../platform/storage";

/* What email tracking setup remembers on this phone: which mail the user
   applies with, what Gmail should forward, that they've added the address
   (so the app waits for the first email), and Tracker's nudge being put away. */

const KEYS = {
  provider: "email-tracking.provider",
  scope: "email-tracking.scope",
  started: "email-tracking.started",
  nudgeDismissed: "email-tracking.nudge-dismissed",
} as const;

const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export interface EmailTrackingPrefs {
  provider: ForwardingProvider | null;
  scope: ForwardingScope;
  started: boolean;
  nudgeDismissed: boolean;
}

let snapshot: EmailTrackingPrefs | null = null;

function read(): EmailTrackingPrefs {
  snapshot ??= {
    provider: (storage.getString(KEYS.provider) as ForwardingProvider | undefined) ?? null,
    scope: storage.getString(KEYS.scope) === "job" ? "job" : "everything",
    started: storage.getBoolean(KEYS.started) ?? false,
    nudgeDismissed: storage.getBoolean(KEYS.nudgeDismissed) ?? false,
  };
  return snapshot;
}

export function useEmailTrackingPrefs(): EmailTrackingPrefs {
  return useSyncExternalStore(subscribe, read);
}

export function rememberSetup(change: Partial<Pick<EmailTrackingPrefs, "provider" | "scope" | "started">>) {
  if (change.provider !== undefined && change.provider !== null) storage.set(KEYS.provider, change.provider);
  if (change.scope !== undefined) storage.set(KEYS.scope, change.scope);
  if (change.started !== undefined) storage.set(KEYS.started, change.started);
  snapshot = null;
  changed();
}

export function dismissNudge() {
  storage.set(KEYS.nudgeDismissed, true);
  snapshot = null;
  changed();
}
