import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PINKSLIP_E2E_PORT ?? "4173");
const baseURL = process.env.PINKSLIP_E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const visualOnlySpecs = [
  "**/design-system-contracts.pw.ts",
  "**/external-links.pw.ts",
  "**/responsive-boundaries.pw.ts",
  "**/visual-contracts.pw.ts",
];
const pwaScreenshotSpec = "**/pwa-screenshots.pw.ts";
const pwaRuntimeSpec = "**/pwa-runtime.pw.ts";
const skipPwaScreenshot = process.env.UPDATE_PWA_SCREENSHOTS === "1" ? [] : [pwaScreenshotSpec];

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  outputDir: "../../.playwright-results/web",
  fullyParallel: true,
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [
        ["line"],
        ["html", { outputFolder: "../../.playwright-report/web", open: "never" }],
      ]
    : "line",
  use: {
    baseURL,
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    launchOptions: { timeout: 30_000 },
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "bun e2e/static-server.ts",
    cwd: import.meta.dirname,
    env: { PINKSLIP_E2E_PORT: String(port) },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      testIgnore: ["**/responsive-boundaries.pw.ts", pwaRuntimeSpec, ...skipPwaScreenshot],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "firefox",
      testIgnore: [...visualOnlySpecs, pwaScreenshotSpec, pwaRuntimeSpec],
      use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "webkit",
      testIgnore: [...visualOnlySpecs, pwaScreenshotSpec, pwaRuntimeSpec],
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-chromium-light",
      testIgnore: ["**/design-system-contracts.pw.ts", "**/external-links.pw.ts", pwaRuntimeSpec, ...skipPwaScreenshot],
      use: { ...devices["Pixel 5"], colorScheme: "light" },
    },
    {
      name: "mobile-chromium-dark",
      testIgnore: ["**/design-system-contracts.pw.ts", "**/external-links.pw.ts", "**/visual-contracts.pw.ts", pwaScreenshotSpec, pwaRuntimeSpec],
      use: { ...devices["Pixel 5"], colorScheme: "dark" },
    },
    {
      name: "mobile-webkit-light",
      testIgnore: ["**/design-system-contracts.pw.ts", "**/external-links.pw.ts", "**/visual-contracts.pw.ts", pwaScreenshotSpec, pwaRuntimeSpec],
      use: { ...devices["iPhone 13"], colorScheme: "light" },
    },
    {
      name: "mobile-webkit-dark",
      testIgnore: ["**/design-system-contracts.pw.ts", "**/external-links.pw.ts", "**/visual-contracts.pw.ts", pwaScreenshotSpec, pwaRuntimeSpec],
      use: { ...devices["iPhone 13"], colorScheme: "dark" },
    },
    {
      name: "pwa-chromium",
      testMatch: pwaRuntimeSpec,
      use: {
        ...devices["Desktop Chrome"],
        serviceWorkers: "allow",
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
