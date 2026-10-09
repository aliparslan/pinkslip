import { ApiError, type ApiClient, type MeResponse } from "@pinkslip/core/api";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { queryKeys } from "./keys";
import { useApi } from "./provider";
import { clearPersonalQueries } from "./query-client";

export interface Session {
  state: "anonymous" | "guest" | "authenticated";
  me: MeResponse | null;
}

export const sessionQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: queryKeys.session(),
    queryFn: async (): Promise<Session> => {
      try {
        const me = await api.me.get();
        return { state: me.session.state, me };
      } catch (error) {
        // 401 is a valid anonymous session, not a load failure.
        if (error instanceof ApiError && error.status === 401) return { state: "anonymous", me: null };
        throw error;
      }
    },
    staleTime: 60_000,
  });

export function useSession() {
  return useQuery(sessionQueryOptions(useApi()));
}

/** The owner identity that partitions personal caches; null when anonymous. */
export function sessionOwnerId(session: Session | undefined): string | null {
  return session?.me?.user?.id ?? null;
}

/** Clears personal caches when a later session load reports a different owner.
 * Mount where the session is always loaded; the shell owns it from 3.2. */
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
