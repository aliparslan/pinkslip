import { expect, test } from "./fixtures";

// Port plan 3.4: the Svelte site's service worker lived at /sw.js and served
// a precached shell. The replacement at that URL must clear every cache and
// unregister itself, so installed PWAs and old tabs load the new app.

test("the retired service worker URL clears caches and unregisters", async ({ page }) => {
  await page.goto("/about");
  await page.evaluate(async () => {
    const cache = await caches.open("workbox-precache-v2-https://pinkslip.work/");
    await cache.put("/old-shell.html", new Response("<p>old</p>"));
    await navigator.serviceWorker.register("/sw.js");
  });
  await expect.poll(() => page.evaluate(async () => ({
    caches: (await caches.keys()).length,
    registrations: (await navigator.serviceWorker.getRegistrations()).length,
  })), { timeout: 10_000 }).toEqual({ caches: 0, registrations: 0 });
});

test("the old app's public files carry over", async ({ request }) => {
  for (const path of ["/manifest.json", "/favicon.svg", "/icons/icon-192.png", "/icons/apple-touch-icon-180.png", "/robots.txt"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});
