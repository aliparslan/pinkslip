import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@pinkslip/data";

/** A push that arrives while the app is open refreshes the job lists (the
 * push worker posts `pinkslip:push`); it never navigates. Mounted once. */
export function PushEffects() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: unknown } | null)?.type !== "pinkslip:push") return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.personal.jobsRoot });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [queryClient]);
  return null;
}
