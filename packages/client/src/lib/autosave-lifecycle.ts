export type AutosaveFlush = () => void | boolean | Promise<void | boolean>;

const activeAutosaveFlushes = new Set<AutosaveFlush>();

function flushWithoutBlocking(flush: AutosaveFlush): void {
  void Promise.resolve().then(flush).catch(() => undefined);
}

/** Flush every mounted autosave owner before a shell-level navigation commits.
 * Returning false keeps the current screen visible so failed edits are never
 * silently discarded by native back navigation. */
export async function flushActiveAutosaves(): Promise<boolean> {
  const results = await Promise.all([...activeAutosaveFlushes].map(async (flush) => {
    try {
      return (await flush()) !== false;
    } catch {
      return false;
    }
  }));
  return results.every(Boolean);
}

export function registerAutosaveFlush(flush: AutosaveFlush): () => void {
  activeAutosaveFlushes.add(flush);
  const flushWhenHidden = () => {
    if (document.visibilityState === "hidden") flushWithoutBlocking(flush);
  };
  const flushOnPageHide = () => flushWithoutBlocking(flush);

  document.addEventListener("visibilitychange", flushWhenHidden);
  window.addEventListener("pagehide", flushOnPageHide);

  return () => {
    document.removeEventListener("visibilitychange", flushWhenHidden);
    window.removeEventListener("pagehide", flushOnPageHide);
    activeAutosaveFlushes.delete(flush);
    flushWithoutBlocking(flush);
  };
}
