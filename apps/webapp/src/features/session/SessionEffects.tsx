import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { queryKeys, useOwnerChangeCleanup } from "@pinkslip/data";
import { toast } from "../../kit";

/** Session work that must run whichever page is open: clearing personal
 * data when the account changes, and reporting the email sign-in result the
 * API redirects back with (`?auth=email-success|email-expired`). */
export function SessionEffects() {
  useOwnerChangeCleanup();
  const router = useRouter();
  const queryClient = useQueryClient();
  const search: Record<string, unknown> = useRouterState({ select: (state) => state.location.search });
  const auth = search.auth;

  useEffect(() => {
    if (auth !== "email-success" && auth !== "email-expired") return;
    if (auth === "email-success") {
      toast.success("Signed in from your email link.", { dedupeKey: "email-sign-in" });
      void queryClient.invalidateQueries({ queryKey: queryKeys.session() });
    } else {
      toast.error("That sign-in link expired. Send yourself a fresh one.", { dedupeKey: "email-sign-in" });
    }
    // Drop the one-time parameter so a reload doesn't repeat the message.
    const url = new URL(window.location.href);
    url.searchParams.delete("auth");
    void router.navigate({ href: `${url.pathname}${url.search}${url.hash}`, replace: true, viewTransition: false });
  }, [auth, queryClient, router]);

  return null;
}
