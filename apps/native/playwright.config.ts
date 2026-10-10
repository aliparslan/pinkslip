import { defineConfig, devices } from "@playwright/test";

// The application browser's injected scripts, run in WebKit (the engine
// behind iOS WebViews) against fixture forms. No server needed.
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.pw.ts",
  outputDir: "../../.playwright-results/native",
  reporter: "line",
  projects: [{ name: "webkit", use: { ...devices["iPhone 15"], browserName: "webkit" } }],
});
