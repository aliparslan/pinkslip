import { useSyncExternalStore } from "react";

/** Wide enough for a job list beside the open job. Matches `Split.module.css`. */
export const SPLIT_QUERY = "(min-width: 1100px)";

/** Whether a media query matches. False on the server and during hydration,
 * so the first browser render matches the server's. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
