import { describe, expect, it } from "bun:test";
import { isApiOwnedPath, legacyRedirect, withNoIndex, withPageSecurity } from "../apps/webapp/src/server/routing";

describe("React web Worker routing", () => {
  it("forwards the complete API and Worker-owned callback routes", () => {
    for (const path of ["/api", "/api/v2/jobs", "/api/v1/jobs", "/auth/email/verify",
      "/apple-app-site-association", "/.well-known/apple-app-site-association"]) {
      expect(isApiOwnedPath(path)).toBe(true);
    }
    // Legal pages render in the React app with the product's own styles.
    for (const path of ["/", "/jobs/123", "/you", "/privacy", "/support", "/legal.css", "/apiary", "/supporting", "/auth/email/verify/extra"]) {
      expect(isApiOwnedPath(path)).toBe(false);
    }
  });

  it("redirects legacy browser visits while preserving paths and queries", () => {
    const result = legacyRedirect(new Request("https://pinkslip.alip.dev/jobs/123?ref=email", { headers: { Accept: "text/html" } }));
    expect(result?.status).toBe(308);
    expect(result?.headers.get("location")).toBe("https://pinkslip.work/jobs/123?ref=email&ps_moved=1");
    for (const request of [
      new Request("https://pinkslip.alip.dev/api/v2/jobs", { headers: { Accept: "text/html" } }),
      new Request("https://pinkslip.alip.dev/apple-app-site-association"),
      new Request("https://pinkslip.work/jobs/123", { headers: { Accept: "text/html" } }),
      new Request("https://pinkslip.alip.dev/you", { method: "POST", headers: { Accept: "text/html" } }),
    ]) expect(legacyRedirect(request)).toBeUndefined();
  });

  it("adds noindex without losing bodies, status, cookies, or cache policy", async () => {
    const source = new Response("body", { status: 201, headers: { "Cache-Control": "private, no-store" } });
    source.headers.append("Set-Cookie", "psid=a; HttpOnly");
    source.headers.append("Set-Cookie", "psaccess=b; HttpOnly");
    const result = withNoIndex(source);
    expect(result.status).toBe(201);
    expect(result.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(result.headers.getSetCookie()).toEqual(["psid=a; HttpOnly", "psaccess=b; HttpOnly"]);
    expect(await result.text()).toBe("body");
  });

  it("adds the page security policy to Start responses without replacing a page's own CSP", () => {
    const page = withPageSecurity(new Response("<html></html>", { headers: { "Content-Type": "text/html" } }));
    expect(page.headers.get("X-Frame-Options")).toBe("DENY");
    expect(page.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=(), payment=()");
    expect(page.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(page.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    const own = withPageSecurity(new Response("", { headers: { "Content-Security-Policy": "default-src 'self'" } }));
    expect(own.headers.get("Content-Security-Policy")).toBe("default-src 'self'");
  });
});
