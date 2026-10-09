import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installApiMocks, smokeJob, type ApiMockOptions } from "../../web/e2e/api-mocks";

// Development-only: the frozen Svelte app is served by its existing static
// test server. No production API calls are made; installApiMocks owns /api/*.
const baseURL = process.env.PINKSLIP_REFERENCE_URL ?? "http://127.0.0.1:4183";
const output = resolve(import.meta.dirname, "../../../docs/port-design/current");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const captures: { file: string; path: string; mode: string; width: number; height: number }[] = [];
const sourceCommit = (await Bun.$`git rev-parse HEAD`.text()).trim();

try {
  for (const width of [390, 1440]) {
    for (const mode of ["light", "dark"] as const) {
      const height = width === 390 ? 844 : 1000;
      const settings = {
        baseURL, viewport: { width, height }, colorScheme: mode,
        reducedMotion: "reduce" as const, serviceWorkers: "block" as const,
      };
      let context = await browser.newContext(settings);
      let page = await context.newPage();
      async function open(path: string, options: ApiMockOptions = {}) {
        // Isolate IndexedDB/localStorage too: a cached feed would correctly
        // display its saved copy instead of the intended initial-error state.
        await context.close();
        context = await browser.newContext(settings);
        page = await context.newPage();
        await page.clock.setFixedTime(new Date("2026-09-01T12:00:00.000Z"));
        await page.addInitScript((theme) => localStorage.setItem("pinkslip-theme", theme), mode);
        await installApiMocks(page, { ...options, searchProfile: { location_ids: [], ...options.searchProfile } });
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        await page.locator(".page-loading").first().waitFor({ state: "hidden" });
      }
      async function capture(name: string, path: string) {
        const file = `${name}-${width}-${mode}.png`;
        await page.screenshot({ path: resolve(output, file), animations: "disabled", caret: "hide", scale: "css" });
        captures.push({ file, path, mode, width, height });
      }
      for (const [name, path, heading] of [
        ["jobs", "/", "Jobs"],
        ["detail", `/jobs/${smokeJob.id}`, smokeJob.title],
        ["library", "/library/saved", "Library"],
        ["you", "/you", "You"],
        ["preferences", "/you/preferences", "Job preferences"],
        ["resume", "/you/resume", "Resume"],
        ["companies", "/you/companies", "Companies"],
      ]) {
        await open(path!);
        await expect(page.getByRole("heading", { level: 1, name: heading!, exact: true })).toBeVisible();
        await capture(name!, path!);
      }
      await open("/");
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await capture("filters", "/");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await page.getByRole("button", { name: "Filters", exact: true }).focus();
      await capture("keyboard-focus", "/");
      await page.emulateMedia({ contrast: "more" });
      await capture("increased-contrast", "/");
      await page.emulateMedia({ contrast: "no-preference" });
      await open("/library/applied", { jobsError: true });
      await expect(page.getByText("No applications yet", { exact: true })).toBeVisible();
      await capture("empty", "/library/applied");
      await open("/", { jobsError: true });
      await expect(page.getByRole("heading", { name: "Jobs didn’t load" })).toBeVisible();
      await capture("error", "/");
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, "manifest.json"), JSON.stringify({
    sourceCommit, capturedAt: new Date().toISOString(),
    fixtureClock: "2026-09-01T12:00:00.000Z", fixture: "apps/web/e2e/api-mocks.ts",
    status: "Current Svelte references, not approval of replacement UI",
    gaps: ["Physical iOS/Capacitor captures", "Loading transitions", "Feature menus", "VoiceOver review"],
    captures,
  }, null, 2) + "\n");
}
console.log(`Captured ${captures.length} current-design references in ${output}`);
