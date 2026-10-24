import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

/** Your plan and what's left this week (step 9), for the Plan page and the
 * places limits bite. */
export function usePlan(enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.personal.plan(), queryFn: () => api.plan.get(), enabled });
}
