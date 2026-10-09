import type { ApiClient } from "@pinkslip/core/api";
import type { QueryClient } from "@tanstack/react-query";

/** Router context created per request on the server and once in the browser. */
export interface RouterContext {
  api: ApiClient;
  queryClient: QueryClient;
}
