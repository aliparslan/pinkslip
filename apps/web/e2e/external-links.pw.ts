import { expect, test } from "@playwright/test";
import { installApiMocks } from "./api-mocks";

test("an external destination opens a new page without replacing Pinkslip", async ({ context, page }) => {
  await installApiMocks(page);
  await context.route("https://pinkslip.work/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Pinkslip support</title><h1>Support</h1>",
    });
  });
  await page.goto("/you");
  await expect(page.getByRole("heading", { level: 1, name: "You" })).toBeVisible();
  const originalUrl = page.url();

  const [destination] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: /Support.*opens in a new tab/ }).click(),
  ]);
  await destination.waitForLoadState("domcontentloaded");

  expect(page.url()).toBe(originalUrl);
  await expect(destination).toHaveURL("https://pinkslip.work/support");
  await expect(destination.getByRole("heading", { name: "Support" })).toBeVisible();
});
