import { expect, test } from "@playwright/test";
import { installApiMocks } from "./api-mocks";

const boundaryWidths = [320, 540, 541, 899, 900] as const;
const boundaryProjects = new Set([
  "mobile-chromium-light",
  "mobile-chromium-dark",
  "mobile-webkit-light",
  "mobile-webkit-dark",
]);

test("adaptive shell stays contained across every composition boundary", async ({ page }, testInfo) => {
  test.skip(
    !boundaryProjects.has(testInfo.project.name),
    "Exact boundary checks run in the mobile Chromium/WebKit light/dark matrix.",
  );
  await installApiMocks(page);

  for (const width of boundaryWidths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/you");
    await expect(page.getByRole("heading", { level: 1, name: "You" })).toBeVisible();

    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(geometry.scrollWidth, `html overflow at ${width}px`).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.bodyScrollWidth, `body overflow at ${width}px`).toBeLessThanOrEqual(geometry.clientWidth);

    const chipHeight = await page.evaluate(() => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = "New";
      chip.style.position = "fixed";
      chip.style.visibility = "hidden";
      document.body.append(chip);
      const height = chip.getBoundingClientRect().height;
      chip.remove();
      return height;
    });
    expect(chipHeight, `compact pill height at ${width}px`).toBe(32);

    const tabBar = page.getByRole("navigation", { name: "Main navigation" });
    await expect(tabBar).toBeVisible();
    const tabBarBox = await tabBar.boundingBox();
    expect(tabBarBox).not.toBeNull();
    if (width < 900) {
      expect(tabBarBox?.width).toBeGreaterThan(width * 0.9);
      expect(tabBarBox?.y).toBeGreaterThan(800);
    } else {
      expect(tabBarBox?.width).toBeLessThan(width * 0.35);
      expect(tabBarBox?.x).toBe(0);
      expect(tabBarBox?.y).toBe(0);
      expect(tabBarBox?.height).toBeGreaterThan(850);
    }

    if (width === 540 || width === 541) {
      const firstSurface = page.locator(".you-page .surface-list").first();
      await expect(firstSurface).toBeVisible();
      const radius = await firstSurface.evaluate((element) => getComputedStyle(element).borderRadius);
      if (width === 540) expect(radius).toBe("0px");
      else expect(radius).not.toBe("0px");
    }
  }
});
