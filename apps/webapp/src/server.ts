import handler from "@tanstack/react-start/server-entry";
import { isApiOwnedPath, legacyRedirect, withNoIndex, withPageSecurity } from "./server/routing";

export default {
  async fetch(request, env) {
    const redirect = legacyRedirect(request);
    if (redirect) return withNoIndex(redirect);
    // Preserve the original URL, cookies, body, status, and Set-Cookie headers.
    // The Hono Worker remains the only authentication and application API owner.
    if (isApiOwnedPath(new URL(request.url).pathname)) {
      return withNoIndex(await env.API.fetch(request));
    }
    return withPageSecurity(await handler.fetch(request));
  },
} satisfies ExportedHandler<WebBindings>;
