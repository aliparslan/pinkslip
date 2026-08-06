export function registerAutosaveFlush(flush: () => void): () => void {
  const flushWhenHidden = () => {
    if (document.visibilityState === "hidden") flush();
  };

  document.addEventListener("visibilitychange", flushWhenHidden);
  window.addEventListener("pagehide", flush);

  return () => {
    document.removeEventListener("visibilitychange", flushWhenHidden);
    window.removeEventListener("pagehide", flush);
    flush();
  };
}
