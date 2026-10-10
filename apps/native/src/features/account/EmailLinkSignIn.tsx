import { queryKeys, useApi } from "@pinkslip/data";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, Screen, Spinner } from "../../kit";
import { haptics } from "../../platform/haptics";

/** Opened by the sign-in email's universal link: verifies the token once, in
 * the app, and returns to You. */
export function EmailLinkSignIn() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const api = useApi();
  const queryClient = useQueryClient();
  const attempt = useRef<{ token: string; promise: Promise<unknown> } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setFailed(false);
    if (attempt.current?.token !== token) {
      const previous = attempt.current?.promise ?? Promise.resolve();
      attempt.current = { token, promise: previous.catch(() => undefined).then(() => api.auth.verifyEmailToken(token)) };
    }
    attempt.current.promise.then(async () => {
      if (!active) return;
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: queryKeys.session() });
      if (active) router.replace("/you");
    }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [api, queryClient, token]);

  if (!token || failed) {
    return <Screen><EmptyState title="This sign-in link didn't work" message="It may have expired or been used already. Send a new one from Account."
      actions={<Button onPress={() => router.replace("/you")}>Back to You</Button>} /></Screen>;
  }
  return <Screen><Spinner label="Signing in" /></Screen>;
}
