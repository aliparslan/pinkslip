// Lets any component ask the app shell to perform an animated "back" (the same
// pop slide as the edge-swipe gesture). App.svelte registers the handler; back
// buttons call requestBack() and fall back to a plain navigate() if unhandled.

type BackHandler = () => boolean;

export interface LocalBackHandler {
  /** Snapshot captured before entering the local child view. */
  snapshotKey: string;
  /** Local handlers stay registered for the page lifetime but only win while active. */
  isActive: () => boolean;
  /** Restore the parent view without changing the route. */
  commit: () => void | Promise<void>;
}

let handler: BackHandler | null = null;
const localHandlers: LocalBackHandler[] = [];

export function registerBackHandler(fn: BackHandler): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

/** Returns true if the shell handled it with an animation. */
export function requestBack(): boolean {
  return handler ? handler() : false;
}

/**
 * Registers an in-page back destination, such as Resume editor -> Resume
 * overview. The native shell consults the most recently registered active
 * handler before resolving a route-level destination.
 */
export function registerLocalBackHandler(localHandler: LocalBackHandler): () => void {
  localHandlers.push(localHandler);
  return () => {
    const index = localHandlers.lastIndexOf(localHandler);
    if (index >= 0) localHandlers.splice(index, 1);
  };
}

export function activeLocalBackHandler(): LocalBackHandler | null {
  for (let index = localHandlers.length - 1; index >= 0; index -= 1) {
    const localHandler = localHandlers[index];
    if (localHandler.isActive()) return localHandler;
  }
  return null;
}

/** Capture the current parent view before a page swaps to an internal child. */
export function announceLocalNavigation(snapshotKey: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pinkslip:local-navigation-will-change", {
    detail: { snapshotKey },
  }));
}
