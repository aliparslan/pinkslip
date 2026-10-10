import { useApi } from "@pinkslip/data";
import { useCallback } from "react";

type JobEvent = "job_displayed" | "job_opened" | "apply_clicked";

/** Product events behind the admin metrics. Best effort, as on the web. */
export function useTrack() {
  const api = useApi();
  return useCallback((event: JobEvent, entity: { type: "job" | "feed"; id?: string; properties?: Record<string, number | string | boolean> }) => {
    void api.interactions.event({ event_name: event, entity_type: entity.type, entity_id: entity.id, properties: entity.properties ?? {} }).catch(() => undefined);
  }, [api]);
}
