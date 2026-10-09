import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";
import { queryKeys } from "./keys";

export const QUERY_STALE_TIME = 30_000;
export const QUERY_GC_TIME = 10 * 60_000;

/** One client per app shell, and one per request during SSR. The transport
 * retries network failures once per read, so Query keeps its own retry small. */
export function createAppQueryClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: {
        staleTime: QUERY_STALE_TIME,
        gcTime: QUERY_GC_TIME,
        retry: 1,
        ...config.defaultOptions?.queries,
      },
      mutations: {
        retry: 0,
        ...config.defaultOptions?.mutations,
      },
    },
  });
}

/** Cancel in-flight personal reads and drop their caches when the owner
 * changes. Owner-scoped screens call this; the shell wires it in 3.2. */
export async function clearPersonalQueries(queryClient: QueryClient): Promise<void> {
  const filter = { queryKey: queryKeys.personal.root };
  await queryClient.cancelQueries(filter);
  queryClient.removeQueries(filter);
}
