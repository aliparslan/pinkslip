import { createApiClient, type ApiClient } from "@pinkslip/core/api";
import { createIsomorphicFn } from "@tanstack/react-start";

const transport = createIsomorphicFn()
  .server(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { env } = await import("cloudflare:workers");
    // Fresh request through the service binding: no visitor credentials reach
    // the API, and personal reads stay client-scoped.
    return env.API.fetch(new Request(input, init));
  })
  .client((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

/** Per-request API client. SSR reaches the API through the service binding and
 * uses an absolute base; the browser keeps same-origin relative URLs. */
export function createWebApiClient(): ApiClient {
  return createApiClient({
    baseUrl: typeof window === "undefined" ? "https://pinkslip.work/api/v2" : "/api/v2",
    fetch: transport as typeof fetch,
  });
}
