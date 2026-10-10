export type AutosaveFlush = () => void | boolean | Promise<void | boolean>;

const activeAutosaveFlushes = new Set<AutosaveFlush>();

function flushWithoutBlocking(flush: AutosaveFlush): void {
  void Promise.resolve().then(flush).catch(() => undefined);
}

/** Flush every mounted autosave owner before a navigation commits. Returning
 * false keeps the current screen visible so failed edits are never silently
 * discarded. Platform shells bind page-hide events and call this; the web app
 * adds that binding with its first autosaving screen (4.6). */
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
  return () => {
    activeAutosaveFlushes.delete(flush);
    flushWithoutBlocking(flush);
  };
}
