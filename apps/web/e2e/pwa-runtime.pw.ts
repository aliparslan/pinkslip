import { expect, test } from "@playwright/test";

test("the built worker keeps product fonts offline and reloads a new release", async ({
  context,
  page,
  request,
}) => {
  await page.goto("/");
  await expect.poll(async () => page.evaluate(() => Boolean(
    navigator.serviceWorker?.controller
  ))).toBe(true);

  await page.evaluate(() => document.fonts.ready);
  const productFontUrls = await page.evaluate(() => [...new Set(
    performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => /(?:untitled-sans-vf-roman|founders-grotesk-semibold).*\.woff2/.test(url))
  )]);
  expect(productFontUrls).toHaveLength(2);

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  const offlineFonts = await page.evaluate(async (urls) => {
    await Promise.all([
      document.fonts.load('400 16px "Pinkslip Untitled Sans"', "Pinkslip"),
      document.fonts.load('600 32px "Pinkslip Founders Grotesk"', "You"),
    ]);
    const responses = await Promise.all(urls.map(async (url) => {
      const response = await fetch(url, { cache: "reload" });
      return { ok: response.ok, bytes: (await response.arrayBuffer()).byteLength };
    }));
    return {
      founders: document.fonts.check('600 32px "Pinkslip Founders Grotesk"', "You"),
      roman: document.fonts.check('400 16px "Pinkslip Untitled Sans"', "Pinkslip"),
      responses,
    };
  }, productFontUrls);
  expect(offlineFonts.roman).toBe(true);
  expect(offlineFonts.founders).toBe(true);
  expect(offlineFonts.responses.every(({ ok, bytes }) => ok && bytes > 10_000)).toBe(true);

  await context.setOffline(false);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(async () => page.evaluate(() => Boolean(
    navigator.serviceWorker?.controller
  ))).toBe(true);
  await page.evaluate(() => sessionStorage.setItem("pinkslip-e2e-update", "pending"));
  const revision = await request.post("/__e2e__/service-worker-revision");
  expect(revision.ok()).toBe(true);

  const reloaded = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  }).catch(() => undefined);
  await reloaded;

  expect(await page.evaluate(() => sessionStorage.getItem("pinkslip-e2e-update"))).toBe("pending");
  expect(await page.evaluate(() => (
    performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming
  ).type)).toBe("reload");
});
