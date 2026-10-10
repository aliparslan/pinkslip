import { queryKeys, useApi } from "@pinkslip/data";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppleSignInCanceled, signInWithApple } from "../../platform/apple";
import { haptics } from "../../platform/haptics";
import { toast } from "../../kit";

/** Sign in with Apple, then reload the session; the owner change clears the
 * guest's personal caches (and the API merges the guest's data). */
export function useAppleSignIn() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => signInWithApple(api),
    onSuccess: async () => {
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: queryKeys.session() });
      toast.success("Signed in");
    },
    onError: (error) => {
      if (error instanceof AppleSignInCanceled) return;
      toast.error("Couldn't sign in with Apple. Try again.");
    },
  });
}
