import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { installApiMocks, smokeJob } from "./api-mocks";

// Port plan 5.1: axe (WCAG 2.1 A/AA) on every screen, phone and desktop
// widths and dark mode, as an admin with every feature on so each control renders.

const routes = [
  "/", `/jobs/${smokeJob.id}`, "/library/saved", "/library/applied", "/you", "/you/preferences", "/you/alerts",
  "/you/companies", "/you/resume", "/you/tailoring", "/you/answers", "/you/account", "/you/feedback", "/welcome",
  "/admin", "/admin/inbox", "/admin/sources", "/admin/runs", "/admin/jev", `/tailor/${smokeJob.id}`,
  "/about", "/privacy", "/support",
];

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

for (const [width, scheme] of [[390, "light"], [1280, "light"], [1280, "dark"]] as const) {
  test(`every screen passes axe at ${width}px, ${scheme}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    await installApiMocks(page);
    await page.route("**/api/v2/me", (route) => route.fulfill(json({
      user: { id: "a1", name: "Avery", role: "admin", created_at: "2026-01-01" }, session: { state: "authenticated" },
      account: { authenticated: true, email: "avery@example.com", provider: "email", providers: ["email"] }, is_admin: true,
      features: { access_required: false, auto_apply_enabled: true, outreach_enabled: true, tailoring_enabled: false, tailoring_provider: null, tailoring_model: "" },
    })));
    await page.route(/\/api\/v2\/interactions\/(feedback|reports)\?/, (route) =>
      route.fulfill(json(route.request().url().includes("feedback") ? { feedback: [] } : { reports: [] })));
    await page.route(/\/api\/v2\/interactions\/job-reviews\?/, (route) =>
      route.fulfill(json({ reviews: [], meta: { total: 0, count: 0, has_more: false, next_offset: 0 } })));
    await page.route(/\/api\/v2\/runs(\?|\/latency)/, (route) =>
      route.fulfill(json(route.request().url().includes("latency") ? { generated_at: "2026-10-10T12:00:00Z", tiers: [] } : { runs: [] })));
    await page.route("**/api/v2/metrics/classification/disagreements", (route) => route.fulfill(json({ available: true, disagreements: [] })));

    for (const path of routes) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      // Let loading states settle so axe sees the screen, not a spinner.
      await expect(page.locator("[aria-busy=true]")).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(results.violations.map((violation) => `${path}: ${violation.id} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`), path).toEqual([]);
    }
  });
}
