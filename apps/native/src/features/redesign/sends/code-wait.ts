import type { ApplySend } from "@pinkslip/core/api";
import { useInbox } from "@pinkslip/data";
import { useEffect, useState } from "react";

/** As long as the server holds the code's push: forwarding usually brings
 * the code well inside it (sends.ts, notifySend). */
export const CODE_WAIT_MS = 60_000;

/** When this app first saw each send waiting on its code. */
const firstSeen = new Map<string, number>();

/**
 * The sends waiting on Greenhouse's code that forwarding is still bringing:
 * with email forwarding set up, a send's first minute of waiting reads as
 * getting the code, not as asking you to type it (owner, 2026-11-08: it said
 * Enter while the code went in by itself).
 */
export function useGettingCode(sends: readonly ApplySend[] | undefined, enabled: boolean): ReadonlySet<string> {
  const forwarding = Boolean(useInbox({ enabled }).data?.forwarding.confirmed_at);
  const [, tick] = useState(0);
  const now = Date.now();
  const getting = new Set<string>();
  let next = Number.POSITIVE_INFINITY;
  for (const send of sends ?? []) {
    if (send.status !== "code_needed") continue;
    if (!firstSeen.has(send.id)) firstSeen.set(send.id, now);
    const ends = firstSeen.get(send.id)! + CODE_WAIT_MS;
    if (forwarding && enabled && ends > now) {
      getting.add(send.id);
      next = Math.min(next, ends);
    }
  }
  // When the minute is up, it asks for the code.
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => tick((count) => count + 1), Math.max(0, next - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [next]);
  return getting;
}
