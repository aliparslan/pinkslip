import { expect, test } from "@playwright/test";
import type { SearchProfile } from "../../../shared/search-profile";
import { installApiMocks } from "./api-mocks";

test("education and experience preferences save and survive a reload", async ({ page }) => {
  const updates: SearchProfile[] = [];
  await installApiMocks(page, { onPreferencesUpdate: (profile) => updates.push(structuredClone(profile)) });
  await page.goto("/you/preferences");
  await page.getByLabel("Years of relevant experience you have", { exact: true }).fill("2");
  await page.getByLabel("Experience requirements to show", { exact: true }).selectOption("mine");
  await page.getByLabel("Highest completed education", { exact: true }).selectOption("master");
  await page.getByRole("switch", { name: "Include jobs with unstated experience", exact: true }).click();
  await expect.poll(() => updates.at(-1)).toMatchObject({ years_experience: 2, max_required_years: null, highest_education: "master", include_unspecified_experience: false });
  await page.reload();
  await expect(page.getByLabel("Years of relevant experience you have", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Experience requirements to show", { exact: true })).toHaveValue("mine");
  await expect(page.getByLabel("Highest completed education", { exact: true })).toHaveValue("master");
  await expect(page.getByRole("switch", { name: "Include jobs with unstated experience", exact: true })).not.toBeChecked();
});

test("onboarding saves a zero-year search independently of career stage", async ({ page }) => {
  const updates: SearchProfile[] = [];
  await installApiMocks(page, { searchProfile: { onboarding_version: 0, onboarding_completed_at: null }, onPreferencesUpdate: (profile) => updates.push(structuredClone(profile)) });
  await page.goto("/");
  await page.getByLabel("Years of relevant experience you have", { exact: true }).fill("0");
  await page.getByLabel("Experience requirements to show", { exact: true }).selectOption("0");
  await page.getByLabel("Highest completed education", { exact: true }).selectOption("bachelor");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Start using pinkslip" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
  expect(updates.at(-1)).toMatchObject({ years_experience: 0, max_required_years: 0, highest_education: "bachelor", target_levels: ["internship", "new_grad", "early_career"] });
});


test("doctoral enrollment and five-year ceiling save independently of completed education", async ({ page }) => {
  const updates: SearchProfile[] = [];
  await installApiMocks(page, { onPreferencesUpdate: (profile) => updates.push(structuredClone(profile)) });
  await page.goto("/you/preferences");
  await page.getByLabel("Highest completed education", { exact: true }).selectOption("master");
  await page.getByLabel("Experience requirements to show", { exact: true }).selectOption("5");
  await page.getByRole("switch", { name: "Currently pursuing a PhD", exact: true }).click();
  await page.getByLabel("PhD internships to show", { exact: true }).selectOption("only");
  await expect.poll(() => updates.at(-1)).toMatchObject({ highest_education: "master", max_required_years: 5, doctoral_student: true, doctoral_internships: "only" });
  await page.reload();
  await expect(page.getByRole("switch", { name: "Currently pursuing a PhD", exact: true })).toBeChecked();
  await expect(page.getByLabel("PhD internships to show", { exact: true })).toHaveValue("only");
  await expect(page.getByLabel("Experience requirements to show", { exact: true })).toHaveValue("5");
  await expect(page.getByLabel("Highest completed education", { exact: true })).toHaveValue("master");
});
