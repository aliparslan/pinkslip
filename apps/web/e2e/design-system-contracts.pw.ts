import { expect, test } from "@playwright/test";
import { installApiMocks } from "./api-mocks";

test("forced colors preserve active navigation and focus visibility", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await installApiMocks(page);
  await page.goto("/you");

  const activeNavigation = page.locator(".tab-bar__item.active");
  await expect(activeNavigation).toHaveCount(1);
  await expect(activeNavigation).toBeVisible();
  await activeNavigation.focus();

  const colors = await activeNavigation.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      background: styles.backgroundColor,
      color: styles.color,
      outlineStyle: styles.outlineStyle,
      outlineWidth: styles.outlineWidth,
    };
  });
  expect(colors.color).not.toBe(colors.background);
  expect(colors.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(colors.outlineWidth)).toBeGreaterThanOrEqual(2);
});

test("a 200% zoom-equivalent viewport reflows without clipping controls", async ({ page }) => {
  // A 1280 CSS-pixel browser viewport at 200% zoom has 640 CSS pixels of
  // layout space. Testing that effective viewport exercises browser reflow
  // without relying on engine-specific command-line zoom flags.
  await page.setViewportSize({ width: 640, height: 900 });
  await installApiMocks(page);
  await page.goto("/you");
  await expect(page.getByRole("heading", { level: 1, name: "You" })).toBeVisible();

  const geometry = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    client: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.client);
  expect(geometry.body).toBeLessThanOrEqual(geometry.client);

  const targetSizes = await page.locator(".tab-bar__item, .you-settings-row").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { height: box.height, width: box.width };
    }),
  );
  expect(targetSizes.length).toBeGreaterThan(3);
  for (const target of targetSizes) {
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.width).toBeGreaterThanOrEqual(44);
  }

  const inputFontSize = await page.getByLabel("Theme").evaluate((element) => getComputedStyle(element).fontSize);
  expect(Number.parseFloat(inputFontSize)).toBeGreaterThanOrEqual(16);
});

test("shared product fonts preload roman and display while italic stays on demand", async ({ page }) => {
  const fontUrls: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.endsWith(".woff2")) fontUrls.push(url.pathname);
  });

  await installApiMocks(page);
  await page.goto("/you");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const loadedFamilies = await page.evaluate(() => ({
    founders: document.fonts.check('600 32px "Pinkslip Founders Grotesk"', "You"),
    roman: document.fonts.check('400 16px "Pinkslip Untitled Sans"', "Pinkslip"),
  }));
  expect(loadedFamilies).toEqual({ founders: true, roman: true });

  const initialFontUrls = [...new Set(fontUrls)];
  expect(initialFontUrls).toHaveLength(2);
  expect(initialFontUrls.every((url) => url.endsWith(".woff2"))).toBe(true);

  await page.evaluate(async () => {
    await document.fonts.load('italic 16px "Pinkslip Untitled Sans"', "Italic sample");
  });
  await expect.poll(() => new Set(fontUrls).size).toBe(3);
  expect([...new Set(fontUrls)].every((url) => url.endsWith(".woff2"))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('italic 16px "Pinkslip Untitled Sans"'))).toBe(true);
});
