import { ApiError, type ApiClient, type MeResponse } from "@pinkslip/core/api";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { queryKeys } from "./keys";
import { useApi } from "./provider";
import { clearPersonalQueries } from "./query-client";

export interface Session {
  /** `locked`: the deployment requires the shared access code and this
   * browser hasn't entered it. Only the public catalog is reachable. */
  state: "locked" | "anonymous" | "guest" | "authenticated";
  me: MeResponse | null;
}

function sessionFrom(me: MeResponse): Session {
  return { state: me.session.state, me };
}

export const sessionQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: queryKeys.session(),
    queryFn: async (): Promise<Session> => {
      try {
        return sessionFrom(await api.me.get());
      } catch (error) {
        // A 401 is a valid answer, not a load failure: either the access code
        // is missing, or there is simply no session yet.
        if (error instanceof ApiError && error.status === 401) {
          return { state: error.code === "access_required" ? "locked" : "anonymous", me: null };
        }
        throw error;
      }
    },
    staleTime: 60_000,
  });

export function useSession() {
  return useQuery(sessionQueryOptions(useApi()));
}

/** Submits the shared access code, then reloads the session. Rejects with the
 * API's 401 when the code doesn't match. */
export function useUnlockAccess() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.access.unlock(code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.session() }),
  });
}

/** Signs out, adopts the session the server returns, and clears personal data. */
export function useSignOut() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: async (me) => {
      queryClient.setQueryData(queryKeys.session(), sessionFrom(me));
      await clearPersonalQueries(queryClient);
    },
  });
}

/** The owner identity that partitions personal caches; null when anonymous. */
export function sessionOwnerId(session: Session | undefined): string | null {
  return session?.me?.user?.id ?? null;
}

/** Clears personal caches when a later session load reports a different owner.
 * The web shell mounts this once, so it runs whichever page is open. */
export function useOwnerChangeCleanup(): void {
  const queryClient = useQueryClient();
  const { data } = useSession();
  const knownOwner = useRef<string | null | undefined>(undefined);
  const ownerId = sessionOwnerId(data);

  useEffect(() => {
    if (!data) return;
    if (knownOwner.current === undefined) {
      knownOwner.current = ownerId;
      return;
    }
    if (knownOwner.current !== ownerId) {
      knownOwner.current = ownerId;
      void clearPersonalQueries(queryClient);
    }
  }, [data, ownerId, queryClient]);
}
