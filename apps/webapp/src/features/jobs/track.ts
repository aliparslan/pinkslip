import { useCallback } from "react";
import { useApi } from "@pinkslip/data";

type JobEvent = "job_displayed" | "job_opened" | "apply_clicked";

/** Product events behind the admin metrics (e.g. apply clicks within an
 * hour of a notification). Best effort, as in the current app: a failed
 * write never surfaces. Only call with a session; events would otherwise
 * start one. */
export function useTrack() {
  const api = useApi();
  return useCallback((event: JobEvent, entity: { type: "job" | "feed"; id?: string; properties?: Record<string, number | string | boolean> }) => {
    void api.interactions.event({
      event_name: event,
      entity_type: entity.type,
      entity_id: entity.id,
      properties: entity.properties ?? {},
    }).catch(() => undefined);
  }, [api]);
}
