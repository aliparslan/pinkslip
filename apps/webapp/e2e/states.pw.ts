import { expect, test } from "./fixtures";

// Page-level states (port plan 3.3): 404s and the route error boundary.

test("unknown paths get a 404 and a way back", async ({ page }) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Jobs" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
});

test("a missing job gets its own 404 page", async ({ page }) => {
  const response = await page.goto("/jobs/port-fixture-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "This job isn't available" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse jobs" })).toHaveAttribute("href", "/");
});

test("a route error shows the failure page and recovers on retry", async ({ page }) => {
  await page.goto("/_kit-error");
  const failure = page.getByRole("alert").filter({ hasText: "Something went wrong" });
  await expect(failure).toBeVisible();
  // The route's own boundary renders inside the app frame.
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await failure.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Recovered" })).toBeVisible();
});

test("personal pages show a loading state while the session loads", async ({ page }) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v2/me", async (route) => {
    await released;
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ user: { id: "guest", name: "", role: "user", created_at: "2026-01-01" }, session: { state: "guest" }, account: null, is_admin: false }) });
  });
  await page.goto("/you");
  await expect(page.getByRole("status", { name: "Loading your account" })).toBeAttached();
  release();
  await expect(page.getByRole("heading", { level: 1, name: "You" })).toBeVisible();
});

test("going offline shows the offline strip until the connection returns", async ({ page, context }) => {
  await page.goto("/you");
  await expect(page.getByRole("heading", { level: 1, name: "You" })).toBeVisible();
  const strip = page.getByRole("status").filter({ hasText: "You're offline" });
  await expect(strip).toHaveCount(0);
  await context.setOffline(true);
  await expect(strip).toBeVisible();
  await context.setOffline(false);
  await expect(strip).toHaveCount(0);
});
