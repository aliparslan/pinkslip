import handler from "@tanstack/react-start/server-entry";
import { isApiOwnedPath, isIndexablePath, legacyRedirect, sitemapXml, withNoIndex, withPageSecurity } from "./server/routing";

/** Built from the API's public catalog, so it lists exactly the job pages
 * that render. */
async function sitemap(env: WebBindings): Promise<Response> {
  const response = await env.API.fetch(new Request("https://pinkslip.work/api/v2/public/sitemap"));
  if (!response.ok) return new Response("Sitemap unavailable", { status: 503, headers: { "Retry-After": "300" } });
  const { jobs } = await response.json() as { jobs: { id: string; lastmod: string | null }[] };
  return new Response(sitemapXml(jobs), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

export default {
  async fetch(request, env) {
    const redirect = legacyRedirect(request);
    if (redirect) return withNoIndex(redirect);
    // Preserve the original URL, cookies, body, status, and Set-Cookie headers.
    // The Hono Worker remains the only authentication and application API owner.
    const { pathname } = new URL(request.url);
    if (isApiOwnedPath(pathname)) {
      return withNoIndex(await env.API.fetch(request));
    }
    // Search indexing is one switch (`SEARCH_INDEXING` in wrangler.jsonc):
    // until it's "on", every page stays noindex.
    const indexing = (env.SEARCH_INDEXING as string) === "on";
    if (pathname === "/sitemap.xml" && ["GET", "HEAD"].includes(request.method)) {
      return withNoIndex(await sitemap(env));
    }
    return withPageSecurity(await handler.fetch(request), indexing && isIndexablePath(pathname));
  },
} satisfies ExportedHandler<WebBindings>;
