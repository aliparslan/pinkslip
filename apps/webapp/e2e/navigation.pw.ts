import { expect, test } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

const placeholders = [
  ["/library/saved", "Library", "Library · Saved"],
  ["/library/applied", "Library", "Library · Applied"],
  ["/you/preferences", "Job preferences"], ["/you/alerts", "Alerts"],
  ["/you/companies", "Companies"], ["/you/resume", "Resume"],
  ["/you/tailoring", "Tailoring"], ["/you/answers", "Application answers"],
  ["/you/account", "Account"], ["/you/feedback", "Help and feedback"],
  ["/admin", "Manage", "Admin · Manage"], ["/admin/inbox", "Inbox", "Admin · Inbox"],
  ["/admin/sources", "Sources", "Admin · Sources"], ["/admin/runs", "Runs", "Admin · Runs"],
  ["/admin/jev", "Jev", "Admin · Jev"], ["/tailor/fixture", "Tailor resume"],
  ["/about", "About Pinkslip"],
] as const;

test("every planned placeholder has a direct route, title and one main heading", async ({ page, request }) => {
  // Admin placeholders are a 404 for non-admins (3.2), so browse as an admin.
  await page.route("**/api/v2/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ user: { id: "a1", name: "Admin", role: "admin", created_at: "2026-01-01" }, session: { state: "authenticated" }, account: null, is_admin: true }),
  }));
  for (const [path, heading, title] of placeholders) {
    const html = await request.get(path);
    expect(html.status(), path).toBe(200);
    // The public About placeholder renders on the server; personal page bodies don't.
    expect((await html.text()).includes("This page is coming soon."), path).toBe(path === "/about");
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page).toHaveTitle(`${title ?? heading} · Pinkslip`);
    await expect(page.getByRole("main")).toHaveCount(1);
  }
});

test("all compatibility redirects preserve search and anchors", async ({ request, page }) => {
  for (const [oldPath, target] of [
    ["/library", "/library/saved"], ["/my-jobs/saved", "/library/saved"],
    ["/my-jobs/applied", "/library/applied"], ["/profile", "/you"],
    ["/settings", "/you"], ["/companies", "/you/companies"],
    ["/resume", "/you/resume"], ["/you/operations", "/admin"],
  ]) {
    const response = await request.get(`${oldPath}?login=success&tag=a&tag=b`, { maxRedirects: 0 });
    expect(response.status(), oldPath).toBe(308);
    const destination = new URL(response.headers().location, "http://127.0.0.1:3000");
    expect(destination.pathname).toBe(target);
    expect(destination.searchParams.get("login")).toBe("success");
    // Start canonicalizes repeated values to its JSON array search format.
    expect(JSON.parse(destination.searchParams.get("tag")!)).toEqual(["a", "b"]);
  }
  await page.goto("/resume?login=success#main");
  await expect(page).toHaveURL("/you/resume?login=success#main");
});

test("legacy hash migration preserves both queries and replaces the history entry", async ({ page }) => {
  await page.goto("/?login=success#/my-jobs/applied?from=email");
  await expect(page).toHaveURL("/library/applied?login=success&from=email");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Library");
  await expect(page.getByRole("tab", { name: /Applied/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: "You", exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL("/library/applied?login=success&from=email");
  await page.evaluate(() => { window.location.hash = "/resume"; });
  await expect(page).toHaveURL("/you/resume?login=success&from=email");
});

test("ordinary anchors and unsafe hash targets are not migrated", async ({ page }) => {
  await page.goto("/about#main");
  await expect(page).toHaveURL("/about#main");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("About Pinkslip");
  await page.goto("/about#//example.com");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("About Pinkslip");
  await expect(page).toHaveURL("/about#//example.com");
});

for (const width of [320, 390, 1280]) {
  test(`section navigation, focus and Back work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/you");
    await expect(page.getByRole("heading", { level: 1, name: "You" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("you-navigation.png"), fullPage: true });
    // The You overview rows, plus the sidebar's nested links on wide screens.
    const preferences = page.getByRole("link", { name: "Job preferences", exact: true }).filter({ visible: true }).first();
    await preferences.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/you/preferences");
    await expect(page.getByRole("main")).toBeFocused();
    await expect(page.getByRole("link", { name: "You", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL("/you");
    await page.getByRole("link", { name: "Library", exact: true }).click();
    await page.getByRole("tab", { name: /Applied/ }).click();
    await expect(page).toHaveURL("/library/applied");
    await expect(page.getByRole("tab", { name: /Applied/ })).toHaveAttribute("aria-selected", "true");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("direct links use safe Back destinations, including the Library origin after reload", async ({ browser }) => {
  for (const [path, target] of [
    ["/you/resume", "/you"], ["/admin/runs", "/admin"],
    ["/jobs/port-fixture-does-not-exist?from=library-applied", "/library/applied"],
    ["/jobs/port-fixture-does-not-exist?from=https://example.com", "/"],
    ["/tailor/fixture?from=library-saved", "/jobs/fixture?from=library-saved"],
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(path);
    await page.reload();
    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(target);
    await context.close();
  }
});

test("unknown nested and legacy routes remain genuine 404s", async ({ page }) => {
  for (const path of ["/you/does-not-exist", "/admin/does-not-exist", "/library/does-not-exist"]) {
    expect((await page.goto(path))?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
  await page.goto("/#/does-not-exist");
  await expect(page).toHaveURL("/does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("Back has a usable destination before JavaScript loads", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/jobs/port-fixture-does-not-exist?from=library-saved");
  const back = page.getByRole("link", { name: "Back", exact: true });
  await expect(back).toHaveAttribute("href", "/library/saved");
  await back.click();
  await expect(page).toHaveURL("/library/saved");
  await context.close();
});

test("browser Back restores scroll without focus resetting it", async ({ page }) => {
  // The development catalog is a stable long page, independent of catalog data.
  await page.goto("/_kit");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => scrollTo(0, 1000));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(1000);
  await page.getByRole("link", { name: "You", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL("/_kit");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(1000);
});

test("route depth drives transitions and reduced motion disables them", async ({ page }) => {
  await page.addInitScript(() => {
    const start = document.startViewTransition.bind(document);
    (window as unknown as { routeTransitionTypes: string[][] }).routeTransitionTypes = [];
    document.startViewTransition = ((options: Parameters<typeof start>[0]) => {
      if (options && typeof options === "object") {
        (window as unknown as { routeTransitionTypes: string[][] }).routeTransitionTypes.push([...(options.types ?? [])]);
      }
      return start(options);
    }) as typeof start;
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/you");
  await expect(page.getByRole("heading", { level: 1, name: "You" })).toBeVisible();
  await page.getByRole("link", { name: "Job preferences", exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL("/you/preferences");
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { routeTransitionTypes: string[][] }).routeTransitionTypes)).toEqual([["deeper"], ["shallower"]]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("link", { name: "Job preferences", exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: "Job preferences", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { routeTransitionTypes: string[][] }).routeTransitionTypes)).toHaveLength(2);
});
