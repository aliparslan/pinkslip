const apiOwnedPaths = new Set([
  "/auth/email/verify",
  "/apple-app-site-association",
  "/.well-known/apple-app-site-association",
  "/privacy",
  "/support",
  "/legal.css",
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
