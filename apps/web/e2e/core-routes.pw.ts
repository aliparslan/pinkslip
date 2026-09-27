import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installApiMocks, smokeJob } from "./api-mocks";

const coreRoutes = [
  { name: "Jobs", path: "/", heading: "Jobs" },
  { name: "Job detail", path: `/jobs/${smokeJob.id}`, heading: smokeJob.title },
  { name: "Library", path: "/library/saved", heading: "Library" },
  { name: "You", path: "/you", heading: "You" },
] as const;

function describeViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]): string {
  return violations.map((violation) => {
    const targets = violation.nodes.flatMap((node) => node.target).join(", ");
    return `${violation.id} (${violation.impact ?? "unknown impact"}): ${targets}`;
  }).join("\n");
}

test.beforeEach(async ({ page }) => {
  await installApiMocks(page);
});

for (const route of coreRoutes) {
  test(`${route.name} renders one route landmark and passes axe`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();

    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("a.skip-link")).toHaveAttribute("href", "#main-content");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(pageErrors).toEqual([]);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(describeViolations(results.violations)).toBe("");
  });
}

test("keyboard users enter through the skip link", async ({ browserName, page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();

  // Safari on macOS follows the platform convention: Option+Tab includes
  // links when full keyboard access is not enabled in system preferences.
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});
