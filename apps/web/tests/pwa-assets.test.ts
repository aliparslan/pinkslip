import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const publicDirectory = resolve(import.meta.dir, "../public");

describe("web PWA assets", () => {
  test("publishes a platform-flexible application manifest", async () => {
    const manifest = await Bun.file(resolve(publicDirectory, "manifest.json")).json() as {
      name?: unknown;
      id?: unknown;
      scope?: unknown;
      start_url?: unknown;
      display?: unknown;
      orientation?: unknown;
      lang?: unknown;
      categories?: unknown;
      icons?: Array<{ src?: unknown; purpose?: unknown }>;
      screenshots?: Array<{ src: string; form_factor?: unknown }>;
      shortcuts?: Array<{ url?: unknown }>;
    };

    expect(manifest.name).toBe("Pinkslip");
    expect(manifest.id).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBeUndefined();
    expect(manifest.lang).toBe("en-US");
    expect(manifest.categories).toEqual(["business", "productivity"]);
    expect(manifest.icons?.some((icon) => icon.purpose === "maskable")).toBeTrue();
    expect(manifest.screenshots?.map((screenshot) => screenshot.form_factor))
      .toEqual(["narrow", "wide"]);
    expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(["/", "/library/saved"]);

    for (const screenshot of manifest.screenshots ?? []) {
      expect(await Bun.file(resolve(publicDirectory, `.${screenshot.src}`)).exists()).toBeTrue();
    }
  });

  test("ships every declared icon and prevents stale application shells", async () => {
    const manifest = await Bun.file(resolve(publicDirectory, "manifest.json")).json() as {
      icons: Array<{ src: string }>;
    };
    for (const icon of manifest.icons) {
      expect(await Bun.file(resolve(publicDirectory, `.${icon.src}`)).exists()).toBeTrue();
    }

    const headers = await Bun.file(resolve(publicDirectory, "_headers")).text();
    expect(headers).toContain("/sw.js");
    expect(headers).toContain("Cache-Control: no-cache, no-store, must-revalidate");
    expect(headers).toContain("/index.html");
    expect(headers).toContain("/assets/*");
    expect(headers).toContain("Cache-Control: public, max-age=31536000, immutable");
  });

  test("preloads the shared roman and display faces but leaves italic on demand", async () => {
    const workspaceRoot = resolve(import.meta.dir, "../../..");
    const webIndex = await Bun.file(resolve(workspaceRoot, "apps/web/index.html")).text();
    const iosIndex = await Bun.file(resolve(workspaceRoot, "apps/ios/index.html")).text();
    const typography = await Bun.file(resolve(
      workspaceRoot,
      "packages/client/src/styles/typography.css",
    )).text();

    for (const source of [webIndex, iosIndex]) {
      expect(source).toContain("untitled-sans-vf-roman.woff2");
      expect(source).toContain("founders-grotesk-semibold.woff2");
      expect(source).not.toContain('rel="preload" href="../../packages/client/src/assets/fonts/product/untitled-sans-vf-italic.woff2"');
    }
    expect(typography).toContain("untitled-sans-vf-italic.woff2");
    expect(`${webIndex}\n${iosIndex}\n${typography}`).not.toMatch(/local-preview|test-.*\.woff2/);
  });

  test("checks the network before the precached shell and activates releases automatically", async () => {
    const workspaceRoot = resolve(import.meta.dir, "../../..");
    const worker = await Bun.file(resolve(workspaceRoot, "apps/web/src/sw.ts")).text();
    const environment = await Bun.file(resolve(
      workspaceRoot,
      "apps/web/src/lib/web-environment.ts",
    )).text();

    expect(worker.indexOf("registerRoute(new NavigationRoute")).toBeLessThan(
      worker.indexOf("precacheAndRoute(self.__WB_MANIFEST)"),
    );
    expect(worker).toContain('cache: "no-store"');
    expect(worker).toContain("event.waitUntil(self.skipWaiting())");
    expect(environment).toContain('updateViaCache: "none"');
    expect(environment).toContain('window.addEventListener("focus"');
  });
});
