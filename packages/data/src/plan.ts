import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { useApi } from "./provider";

/** Your plan and what's left this week (step 9), for the Plan page and the
 * places limits bite. */
export function usePlan(enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.personal.plan(), queryFn: () => api.plan.get(), enabled });
}

/** Tells the server about a purchase (or a restore) StoreKit just finished. */
export function useApplePurchase() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transactionId: string) => api.plan.apple(transactionId),
    onSuccess: (plan) => queryClient.setQueryData(queryKeys.personal.plan(), plan),
  });
}

