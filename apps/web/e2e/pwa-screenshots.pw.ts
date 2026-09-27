import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { installApiMocks } from "./api-mocks";

test("regenerate manifest screenshots", async ({ page }, testInfo) => {
  test.skip(
    process.env.UPDATE_PWA_SCREENSHOTS !== "1" || testInfo.project.name !== "chromium",
    "Run explicitly after an approved styling pass.",
  );
  await page.clock.setFixedTime(new Date("2026-09-01T12:00:00.000Z"));
  await installApiMocks(page, { searchProfile: { location_ids: [] } });
  const screenshotDirectory = resolve(import.meta.dirname, "../public/screenshots");

  for (const capture of [
    { name: "jobs-narrow.jpg", width: 390, height: 844 },
    { name: "jobs-wide.jpg", width: 1440, height: 900 },
  ]) {
    await page.setViewportSize({ width: capture.width, height: capture.height });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: resolve(screenshotDirectory, capture.name),
      type: "jpeg",
      quality: 90,
      animations: "disabled",
      caret: "hide",
    });
  }
});
