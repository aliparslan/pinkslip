import { expect, test } from "@playwright/test";
import type { SearchProfile } from "../../../shared/search-profile";
import { installApiMocks } from "./api-mocks";

test("new onboarding starts with every career stage and completes v3", async ({ page }) => {
  const updates: SearchProfile[] = [];
  await installApiMocks(page, {
    searchProfile: {
      target_levels: ["internship", "new_grad", "early_career"],
      onboarding_version: 0,
      onboarding_completed_at: null,
    },
    onPreferencesUpdate: (profile) => updates.push(structuredClone(profile)),
  });

  await page.goto("/");
  for (const label of ["Internships", "New grad", "Early / mid-career (1–5 years)"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  }

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Start using pinkslip" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();

  expect(updates.at(-1)).toMatchObject({
    target_levels: ["internship", "new_grad", "early_career"],
    onboarding_version: 3,
  });
});

test("migrated onboarding preserves preferences and requires one career stage", async ({ page }) => {
  const updates: SearchProfile[] = [];
  await installApiMocks(page, {
    searchProfile: {
      roles: ["backend"],
      primary_role: "backend",
      location_ids: ["chicago"],
      target_levels: ["internship", "new_grad", "early_career"],
      onboarding_version: 2,
      onboarding_completed_at: "2026-08-01T12:00:00.000Z",
    },
    onPreferencesUpdate: (profile) => updates.push(structuredClone(profile)),
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Beat the crowd" })).toBeVisible();
  await expect(page.getByText(
    "Choose your career stages and roles. We’ll alert you when a new posting fits.",
  )).toBeVisible();

  const internships = page.getByRole("button", { name: "Internships", exact: true });
  const newGrad = page.getByRole("button", { name: "New grad", exact: true });
  const earlyCareer = page.getByRole("button", { name: "Early / mid-career (1–5 years)", exact: true });
  await expect(internships).toHaveAttribute("aria-pressed", "true");
  await expect(newGrad).toHaveAttribute("aria-pressed", "true");
  await expect(earlyCareer).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Backend", exact: true })).toHaveAttribute("aria-pressed", "true");
  const [careerStageGroupBox, earlyCareerBox] = await Promise.all([
    page.getByRole("group", { name: "Career stage" }).boundingBox(),
    earlyCareer.boundingBox(),
  ]);
  expect(earlyCareerBox?.height).toBe(32);
  expect(earlyCareerBox?.width ?? 0).toBeLessThan((careerStageGroupBox?.width ?? 0) * 0.8);

  await internships.click();
  await newGrad.click();
  await expect(earlyCareer).toHaveAttribute("aria-disabled", "true");
  await expect(earlyCareer).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Set your work preferences" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Chicago, IL", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Stay in the loop" })).toBeVisible();
  await page.getByRole("button", { name: "Start using pinkslip" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();

  expect(updates.length).toBeGreaterThanOrEqual(2);
  expect(updates[0]).toMatchObject({
    roles: ["backend"],
    location_ids: ["chicago"],
    target_levels: ["early_career"],
  });
  expect(updates.at(-1)).toMatchObject({
    roles: ["backend"],
    location_ids: ["chicago"],
    target_levels: ["early_career"],
    onboarding_version: 3,
  });

  await page.goto("/you");
  await expect(page.getByText(/Early \/ mid-career \(1–5 years\) · 1 role · Chicago, IL/)).toBeVisible();

  await page.goto("/you/preferences");
  const settingsNewGrad = page.getByRole("button", { name: "New grad", exact: true });
  await expect(settingsNewGrad).toHaveAttribute("aria-pressed", "false");
  const updateCount = updates.length;
  await settingsNewGrad.click();
  await expect.poll(() => updates.length).toBeGreaterThan(updateCount);
  expect(updates.at(-1)?.target_levels).toEqual(["new_grad", "early_career"]);
});

test("web job preferences expose the iOS no-preference choices", async ({ page }) => {
  const updates: SearchProfile[] = [];
  await installApiMocks(page, {
    searchProfile: {
      roles: ["backend"],
      primary_role: "backend",
      location_ids: ["chicago"],
      relocation_willing: false,
    },
    onPreferencesUpdate: (profile) => updates.push(structuredClone(profile)),
  });

  await page.goto("/you/preferences");
  const roles = page.getByRole("group", { name: "Target roles" });
  const roleNoPreference = roles.getByRole("button", { name: "No preference", exact: true });
  await expect(roleNoPreference).toBeVisible();
  await expect(roleNoPreference).toHaveAttribute("aria-pressed", "false");
  await roleNoPreference.click();
  await expect(roleNoPreference).toHaveAttribute("aria-pressed", "true");

  const metros = page.getByRole("group", { name: "Preferred metros" });
  const metroNoPreference = metros.getByRole("button", { name: "No preference", exact: true });
  await expect(metroNoPreference).toBeVisible();
  await expect(metroNoPreference).toHaveAttribute("aria-pressed", "false");
  await metroNoPreference.click();
  await expect(metroNoPreference).toHaveAttribute("aria-pressed", "true");

  await expect.poll(() => updates.at(-1)?.roles.length ?? 0).toBeGreaterThan(1);
  expect(updates.at(-1)?.location_ids).toEqual([]);
});

test("feed stages stay draft-only and emit only a proper subset", async ({ page }) => {
  const jobsRequests: URL[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installApiMocks(page, {
    searchProfile: {
      location_ids: [],
      target_levels: ["internship", "new_grad", "early_career"],
    },
    onJobsRequest: (url) => jobsRequests.push(new URL(url)),
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
  await expect.poll(() => jobsRequests.at(-1)?.searchParams.get("stages") ?? null).toBeNull();

  const filters = page.getByRole("button", { name: "Filters", exact: true });
  await filters.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Career stage", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Internships", exact: true }).click();
  await dialog.getByRole("button", { name: "Close filters" }).click();
  expect(jobsRequests.at(-1)?.searchParams.get("stages")).toBeNull();

  await filters.click();
  await expect(dialog.getByRole("button", { name: "Internships", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Internships", exact: true }).click();
  await dialog.getByRole("button", { name: "Early / mid-career (1–5 years)", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();

  await expect.poll(() => jobsRequests.at(-1)?.searchParams.get("stages")).toBe("new_grad");
  expect(pageErrors).toEqual([]);
  await expect(page.getByRole("button", { name: "Filters, 1 active" })).toBeVisible();

  await page.getByRole("button", { name: "Filters, 1 active" }).click();
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => jobsRequests.at(-1)?.searchParams.get("stages") ?? null).toBeNull();
});

test("a failed stage Apply restores the last applied web selection", async ({ page }) => {
  const jobsRequests: URL[] = [];
  let failStageApply = false;
  await installApiMocks(page, {
    searchProfile: {
      location_ids: [],
      target_levels: ["internship", "new_grad", "early_career"],
    },
    onJobsRequest: (url) => jobsRequests.push(new URL(url)),
    jobsError: (url) => failStageApply && url.searchParams.has("stages"),
  });

  await page.goto("/");
  await expect(page.getByText("Frontend Engineer", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Filters", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Internships", exact: true }).click();
  await dialog.getByRole("button", { name: "Early / mid-career (1–5 years)", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => jobsRequests.at(-1)?.searchParams.get("stages")).toBe("new_grad");

  failStageApply = true;
  const activeFilters = page.getByRole("button", { name: "Filters, 1 active" });
  await activeFilters.click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Internships", exact: true }).click();
  await dialog.getByRole("button", { name: "New grad", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();

  await expect.poll(() => jobsRequests.at(-1)?.searchParams.get("stages")).toBe("internship");
  await expect(page.getByText("Frontend Engineer", { exact: true })).toBeVisible();
  const savedCopyNotice = page.locator(".feed-stale-notice").filter({ hasText: "Saved copy" });
  await expect(savedCopyNotice).toBeVisible();

  failStageApply = false;
  await savedCopyNotice.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => jobsRequests.at(-1)?.searchParams.get("stages")).toBe("new_grad");
  await expect(activeFilters).toBeEnabled();
  await activeFilters.click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Internships", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("button", { name: "New grad", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Early / mid-career (1–5 years)", exact: true })).toHaveAttribute("aria-pressed", "false");
});
