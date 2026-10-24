import { useMutation } from "@tanstack/react-query";
import { useApi } from "./provider";

/** A Stripe page for one tip of any amount, once or monthly (Support Pinkslip). */
export function useSupportCheckout() {
  const api = useApi();
  return useMutation({
    mutationFn: ({ dollars, monthly }: { dollars: number; monthly: boolean }) => api.support.checkout(dollars, monthly),
  });
}
