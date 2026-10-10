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

export function withNoIndex(response: Response): Response {
  const result = new Response(response.body, response);
  result.headers.set("X-Robots-Tag", "noindex, nofollow");
  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return result;
}

/** The page-level policy the Svelte shell sends from `_headers`. API responses
 * keep the Hono Worker's own policy, so this only wraps Start's responses.
 * A script CSP needs per-request nonces for Start's inline hydration data;
 * until then, framing is the policy enforced here. */
export function withPageSecurity(response: Response): Response {
  const result = withNoIndex(response);
  result.headers.set("X-Frame-Options", "DENY");
  result.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (!result.headers.has("Content-Security-Policy")) {
    result.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  }
  return result;
}
