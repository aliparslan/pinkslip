import { describe, expect, it } from "bun:test";
import {
  isApiOwnedPath, isIndexablePath, legacyRedirect, sitemapXml, withNoIndex, withPageSecurity,
} from "../apps/webapp/src/server/routing";
import { jobPostingJsonLd } from "../apps/webapp/src/features/job-detail/structured-data";

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

  it("lets only public pages that rendered be indexed", () => {
    for (const path of ["/", "/about", "/privacy", "/support", "/jobs/abc-123"]) expect(isIndexablePath(path)).toBe(true);
    for (const path of ["/you", "/you/resume", "/library/saved", "/admin", "/jobs/abc/extra", "/welcome", "/_kit", "/tailor/abc"]) {
      expect(isIndexablePath(path)).toBe(false);
    }
    expect(withPageSecurity(new Response("ok"), true).headers.get("X-Robots-Tag")).toBeNull();
    expect(withPageSecurity(new Response("missing", { status: 404 }), true).headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(withPageSecurity(new Response("ok"), false).headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("builds the sitemap on the canonical host with job dates", () => {
    const xml = sitemapXml([{ id: "a&b", lastmod: "2026-10-09 14:00:00" }, { id: "undated", lastmod: null }]);
    expect(xml).toContain("<loc>https://pinkslip.work/</loc>");
    expect(xml).toContain("<loc>https://pinkslip.work/about</loc>");
    expect(xml).toContain("<url><loc>https://pinkslip.work/jobs/a%26b</loc><lastmod>2026-10-09</lastmod></url>");
    expect(xml).toContain("<url><loc>https://pinkslip.work/jobs/undated</loc></url>");
  });
});

describe("JobPosting structured data", () => {
  const job = {
    id: "job-1", title: "Software Engineer, New Grad", url: "https://boards.example.com/1", company_name: "Acme",
    company_domain: "acme.com", location: "Chicago, IL; Remote", department: null, salary: null,
    posted_at: "2026-10-01 12:00:00", first_seen_at: "2026-10-01 12:05:00", evergreen: false, description: "<p>Build things.</p>",
  };

  it("describes an open job with its company, places and catalog expiry", () => {
    const data = jobPostingJsonLd(job)!;
    expect(data).toMatchObject({
      "@type": "JobPosting", title: job.title, datePosted: "2026-10-01T12:00:00.000Z", validThrough: "2026-10-31T12:00:00.000Z",
      hiringOrganization: { name: "Acme", sameAs: "https://acme.com" }, jobLocationType: "TELECOMMUTE",
      url: "https://pinkslip.work/jobs/job-1",
    });
    expect(data.jobLocation).toEqual([{ "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Chicago, IL", addressCountry: "US" } }]);
  });

  it("leaves out what it can't vouch for", () => {
    expect(jobPostingJsonLd({ ...job, evergreen: true })).not.toHaveProperty("validThrough");
    expect(jobPostingJsonLd({ ...job, location: "New York, NY" })).not.toHaveProperty("jobLocationType");
    expect(jobPostingJsonLd({ ...job, description: " " })).toBeNull();
  });
});
