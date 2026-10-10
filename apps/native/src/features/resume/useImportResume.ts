import { useApi } from "@pinkslip/data";
import { useEffect, useRef } from "react";
import { pickAndImportResume } from "./import";
import { useResumeRenderer } from "./ResumeOcrProvider";

/** Leaving Resume or onboarding cancels its renderer and discards late parse
 * results. Import never changes the attachment until the person accepts it. */
export function useImportResume() {
  const api = useApi();
  const render = useResumeRenderer();
  const requests = useRef(new Set<AbortController>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; for (const request of requests.current) request.abort(); requests.current.clear(); };
  }, []);
  return async () => {
    const request = new AbortController();
    requests.current.add(request);
    try { return await pickAndImportResume(api, (uri) => render(uri, request.signal), () => mounted.current && !request.signal.aborted); }
    finally { requests.current.delete(request); }
  };
}
