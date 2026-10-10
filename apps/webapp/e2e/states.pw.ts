import { expect, test } from "@playwright/test";

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
