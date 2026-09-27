import { expect, test, type Page } from "@playwright/test";
import { installApiMocks, smokeJob, type ApiMockOptions } from "./api-mocks";

const visualProjects = new Set(["chromium", "mobile-chromium-light"]);

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!visualProjects.has(testInfo.project.name), "Visual contracts use one deterministic wide and narrow engine.");
  await page.clock.setFixedTime(new Date("2026-09-01T12:00:00.000Z"));
});

async function openVisualRoute(page: Page, path: string, options: ApiMockOptions = {}): Promise<void> {
  await installApiMocks(page, {
    ...options,
    searchProfile: {
      location_ids: [],
      ...options.searchProfile,
    },
  });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".page-loading").first().waitFor({ state: "hidden" }).catch(() => undefined);
}

async function capture(page: Page, name: string): Promise<void> {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
}

test("Jobs and filter modal", async ({ page }) => {
  await openVisualRoute(page, "/");
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
  await capture(page, "jobs");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture(page, "jobs-filter-modal");
});

test("job detail", async ({ page }) => {
  await openVisualRoute(page, `/jobs/${smokeJob.id}`);
  await expect(page.getByRole("heading", { level: 1, name: smokeJob.title })).toBeVisible();
  await capture(page, "job-detail");
});

test("Library", async ({ page }) => {
  await openVisualRoute(page, "/library/saved");
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  await capture(page, "library");
});

test("You overview and settings", async ({ page }) => {
  await openVisualRoute(page, "/you");
  await expect(page.getByRole("heading", { level: 1, name: "You" })).toBeVisible();
  await capture(page, "you-overview");
  await page.goto("/you/preferences");
  await expect(page.getByRole("heading", { level: 1, name: "Job preferences" })).toBeVisible();
  await capture(page, "you-preferences");
});

test("Companies", async ({ page }) => {
  await openVisualRoute(page, "/you/companies");
  await expect(page.getByRole("heading", { level: 1, name: "Companies" })).toBeVisible();
  await capture(page, "companies");
});

test("Resume", async ({ page }) => {
  await openVisualRoute(page, "/you/resume");
  await expect(page.getByRole("heading", { level: 1, name: "Resume" })).toBeVisible();
  await capture(page, "resume");
});

test("Tailor", async ({ page }) => {
  await openVisualRoute(page, `/tailor/${smokeJob.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Tailor your resume" })).toBeVisible();
  await capture(page, "tailor");
});

test("Admin", async ({ page }) => {
  await openVisualRoute(page, "/admin");
  await expect(page.locator(".admin-section")).toBeVisible();
  await capture(page, "admin");
});

test("onboarding", async ({ page }) => {
  await openVisualRoute(page, "/", {
    searchProfile: { onboarding_version: 0, onboarding_completed_at: null },
  });
  await expect(page.getByRole("heading", { level: 1, name: "Beat the crowd" })).toBeVisible();
  await capture(page, "onboarding");
});

test("global empty and error states", async ({ page }) => {
  await openVisualRoute(page, "/library/applied", { jobsError: true });
  await expect(page.getByText("No applications yet", { exact: true })).toBeVisible();
  await capture(page, "global-empty");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Jobs didn’t load" })).toBeVisible();
  await capture(page, "global-error");
});
