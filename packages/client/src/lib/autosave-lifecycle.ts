import {
  flushActiveAutosaves,
  registerAutosaveFlush as registerCoreAutosaveFlush,
  type AutosaveFlush,
} from "@pinkslip/core/autosave-lifecycle";

export type { AutosaveFlush };
export { flushActiveAutosaves };

function flushWithoutBlocking(flush: AutosaveFlush): void {
  void Promise.resolve().then(flush).catch(() => undefined);
}

/** The core registry plus the browser's best-effort page-hide flushing. */
export function registerAutosaveFlush(flush: AutosaveFlush): () => void {
  const unregisterCore = registerCoreAutosaveFlush(flush);
  const flushWhenHidden = () => {
    if (document.visibilityState === "hidden") flushWithoutBlocking(flush);
  };
  const flushOnPageHide = () => flushWithoutBlocking(flush);

  document.addEventListener("visibilitychange", flushWhenHidden);
  window.addEventListener("pagehide", flushOnPageHide);

  return () => {
    document.removeEventListener("visibilitychange", flushWhenHidden);
    window.removeEventListener("pagehide", flushOnPageHide);
    unregisterCore();
  };
}
