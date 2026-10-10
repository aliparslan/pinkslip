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
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    api.auth.verifyEmailToken(token).then(async () => {
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: queryKeys.session() });
      router.replace("/you");
    }, () => setFailed(true));
  }, [api, queryClient, token]);

  if (!token || failed) {
    return <Screen><EmptyState title="This sign-in link didn't work" message="It may have expired or been used already. Send a new one from Account."
      actions={<Button onPress={() => router.replace("/you")}>Back to You</Button>} /></Screen>;
  }
  return <Screen><Spinner label="Signing in" /></Screen>;
}
