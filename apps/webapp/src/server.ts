import handler from "@tanstack/react-start/server-entry";
import { isApiOwnedPath, legacyRedirect, withNoIndex } from "./server/routing";

export default {
  async fetch(request, env) {
    const redirect = legacyRedirect(request);
    if (redirect) return withNoIndex(redirect);
    // Preserve the original URL, cookies, body, status, and Set-Cookie headers.
    // The Hono Worker remains the only authentication and application API owner.
    const response = isApiOwnedPath(new URL(request.url).pathname)
      ? await env.API.fetch(request)
      : await handler.fetch(request);
    return withNoIndex(response);
  },
} satisfies ExportedHandler<WebBindings>;
