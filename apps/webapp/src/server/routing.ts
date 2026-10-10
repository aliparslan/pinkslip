const apiOwnedPaths = new Set([
  "/auth/email/verify",
  "/apple-app-site-association",
  "/.well-known/apple-app-site-association",
]);

export function isApiOwnedPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/") || apiOwnedPaths.has(pathname);
}

export function legacyRedirect(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.hostname !== "pinkslip.alip.dev"
    || !["GET", "HEAD"].includes(request.method)
    || !request.headers.get("accept")?.includes("text/html")
    || url.pathname === "/api" || url.pathname.startsWith("/api/")) return;
  url.protocol = "https:";
  url.hostname = "pinkslip.work";
  url.port = "";
  url.searchParams.set("ps_moved", "1");
  return new Response(null, { status: 308, headers: { Location: url.toString() } });
}

export const CANONICAL_ORIGIN = "https://pinkslip.work";

/** Pages search engines may index: the feed, public job pages and the
 * public information pages. Personal and admin routes, the kit pages and
 * anything unknown stay `noindex`. */
export function isIndexablePath(pathname: string): boolean {
  return ["/", "/about", "/privacy", "/support"].includes(pathname) || /^\/jobs\/[^/]+$/.test(pathname);
}

function secure(response: Response, indexable: boolean): Response {
  const result = new Response(response.body, response);
  if (indexable) result.headers.delete("X-Robots-Tag");
  else result.headers.set("X-Robots-Tag", "noindex, nofollow");
  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return result;
}

export function withNoIndex(response: Response): Response {
  return secure(response, false);
}

/** The page-level policy the Svelte shell sends from `_headers`. API responses
 * keep the Hono Worker's own policy, so this only wraps Start's responses.
 * A script CSP needs per-request nonces for Start's inline hydration data;
 * until then, framing is the policy enforced here. */
export function withPageSecurity(response: Response, indexable = false): Response {
  // Only a page that rendered (not a 404 or an error) can be indexed.
  const result = secure(response, indexable && response.status === 200);
  result.headers.set("X-Frame-Options", "DENY");
  result.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (!result.headers.has("Content-Security-Policy")) {
    result.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  }
  return result;
}

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The sitemap: the public pages, then every public job (newest first). */
export function sitemapXml(jobs: ReadonlyArray<{ id: string; lastmod: string | null }>): string {
  const day = (value: string | null) => {
    const time = value ? Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`) : NaN;
    return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
  };
  const url = (path: string, lastmod: string | null = null) =>
    `  <url><loc>${escapeXml(`${CANONICAL_ORIGIN}${path}`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...["/", "/about", "/privacy", "/support"].map((path) => url(path)),
    ...jobs.map((job) => url(`/jobs/${encodeURIComponent(job.id)}`, day(job.lastmod))),
    `</urlset>`,
    "",
  ].join("\n");
}
