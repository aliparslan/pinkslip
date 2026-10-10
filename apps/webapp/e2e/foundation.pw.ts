import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public page renders without JavaScript and stays unindexed", async ({ request, browser }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect(await response.text()).toContain("Early-career opportunities");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
  await context.close();
});

test("browser navigation uses the existing same-origin account API", async ({ page, request }) => {
  const html = await (await request.get("/you")).text();
  expect(html).not.toContain("Your account and preferences will live here.");
  const account = page.waitForResponse((response) => response.url().endsWith("/api/v2/me"));
  await page.goto("/");
  await page.getByRole("link", { name: "You", exact: true }).click();
  expect([200, 401]).toContain((await account).status());
  await expect(page.getByRole("heading", { name: "You", exact: true })).toBeVisible();
});

test("public job data comes from Hono and missing jobs have real 404s", async ({ request }) => {
  const response = await request.get("/api/v2/public/jobs");
  expect(response.status()).toBe(200);
  expect(response.headers()["set-cookie"]).toBeUndefined();
  const data = await response.json();
  expect(Array.isArray(data.jobs)).toBe(true);
  for (const job of data.jobs) {
    expect(job).not.toHaveProperty("saved");
    expect(job).not.toHaveProperty("applied");
    expect(job).not.toHaveProperty("user_id");
  }
  const missing = await request.get("/jobs/port-fixture-does-not-exist");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});

test("a local catalog job renders its title without client JavaScript", async ({ request, browser }) => {
  const data = await (await request.get("/api/v2/public/jobs")).json();
  test.skip(data.jobs.length === 0, "Positive detail check needs a populated local catalog.");
  const job = data.jobs[0];
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const response = await page.goto(`/jobs/${encodeURIComponent(job.id)}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: job.title, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View on company website" })).toHaveAttribute("href", job.url);
  await context.close();
});

test("applies stored and system appearance before hydration", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
  await page.evaluate(() => localStorage.setItem("pinkslip-theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
});

test("renders legal pages in the app with their canonical URLs", async ({ page }) => {
  for (const [path, title] of [["/privacy", "Privacy policy"], ["/support", "Support"]] as const) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page).toHaveTitle(`${title} · Pinkslip`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://pinkslip.work${path}`);
    await expect(page.getByRole("link", { name: "login@pinkslip.work" }).first()).toBeVisible();
  }
});

test("forwards AASA and private-route authorization", async ({ request }) => {
  for (const path of ["/apple-app-site-association", "/.well-known/apple-app-site-association"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  }
  expect((await request.get("/api/v2/profile")).status()).toBe(401);
  expect((await request.get("/this-route-does-not-exist")).status()).toBe(404);
});

test("hydration, keyboard skip navigation and narrow layouts work", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "You", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("server-loaded jobs hydrate without a second browser request", async ({ page }) => {
  const catalogRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v2/public/jobs") catalogRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(catalogRequests).toEqual([]);
});
