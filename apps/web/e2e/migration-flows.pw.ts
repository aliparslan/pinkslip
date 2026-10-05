import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createEmptyResumeProfile } from "../../../shared/resume-profile";
import { RESUME_COMPILER_VERSION, RESUME_TEMPLATE_VERSION, type StructuredTailoring } from "../../../shared/tailoring";
import { installApiMocks, smokeJob } from "./api-mocks";

test.beforeEach(async ({ page }) => { await installApiMocks(page); });

test("legacy links resolve to canonical Kit routes and survive reload", async ({ page }) => {
  for (const [legacy, canonical, title] of [
    ["/profile", "/you", "You"],
    ["/library", "/library/saved", "Library"],
    ["/my-jobs/applied", "/library/applied", "Library"],
    ["/companies", "/you/companies", "Companies"],
    ["/resume", "/you/resume", "Resume"],
    [`/#/jobs/${smokeJob.id}?from=library-saved`, `/jobs/${smokeJob.id}?from=library-saved`, smokeJob.title],
  ]) {
    await page.goto(legacy!);
    await expect(page).toHaveURL(new RegExp(`${canonical!.replace(/[?]/g, "\\?")}$`));
    await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: smokeJob.title })).toBeVisible();
});

test("job navigation retains the collection and returns to its library origin", async ({ page }) => {
  await page.goto("/library/saved");
  const row = page.locator(`a.job-row[data-job-id="${smokeJob.id}"]`);
  await expect(row).toBeVisible();
  await row.evaluate((element) => { element.setAttribute("data-retention-check", "original"); });
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${smokeJob.id}\\?from=library-saved$`));
  await expect(page.getByRole("heading", { level: 1, name: smokeJob.title })).toBeVisible();
  await expect(row).toHaveAttribute("data-retention-check", "original");
  await page.goBack();
  await expect(page).toHaveURL(/\/library\/saved$/);
  await expect(row).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: smokeJob.title })).toBeVisible();
});

test("library tabs keep keyboard focus, update the URL, and follow history", async ({ page }) => {
  await page.goto("/library/saved");
  const saved = page.getByRole("tab", { name: /Saved/ });
  const applied = page.getByRole("tab", { name: /Applied/ });
  await saved.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/library\/applied$/);
  await expect(applied).toBeFocused();
  await expect(applied).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(page).toHaveURL(/\/library\/saved$/);
  await expect(saved).toBeFocused();
  await page.goBack();
  await expect(applied).toHaveAttribute("aria-selected", "true");
});

test("work-mode menu supports keyboard multiselect, Escape, and focus return", async ({ page }) => {
  await page.goto("/you/preferences");
  const trigger = page.getByRole("button", { name: /Work mode/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const remote = page.getByRole("menuitemcheckbox", { name: "Remote" });
  await expect(remote).toBeVisible();
  await remote.focus();
  await page.keyboard.press("Space");
  await expect(remote).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("shared dialogs trap focus, expose their name, and return focus after dismissal", async ({ page, browserName }) => {
  await page.goto("/you/resume");
  const trigger = page.getByRole("button", { name: "Add section", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add section", exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  for (let step = 0; step < 10; step++) {
    const key = step % 2 ? "Shift+Tab" : "Tab";
    // Safari's platform convention includes buttons with Option+Tab.
    await page.keyboard.press(browserName === "webkit" ? `Alt+${key}` : key);
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map(({ id }) => id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("tailoring tabs retain the editor and select preview with the keyboard", async ({ page }) => {
  const resume = createEmptyResumeProfile();
  resume.contact.name = "Avery Tester";
  const tailoring: StructuredTailoring = {
    kind: "structured", id: "test-tailoring", job_id: smokeJob.id, status: "generated",
    jobSnapshot: { jobId: smokeJob.id, title: smokeJob.title, company: smokeJob.company_name,
      url: smokeJob.url, description: smokeJob.description, descriptionHash: "test", capturedAt: "2026-10-01T12:00:00Z" },
    evidence: [], plan: { schemaVersion: 2, requirements: [], matches: [], gaps: [], selectedEvidenceIds: [], excludedEvidenceIds: [] },
    resumeDraft: { schemaVersion: 2, contact: resume.contact, experience: [], projects: [], education: [], skills: [], optionalSections: [], removedForSpace: [] },
    validation: { valid: true, issues: [] }, templateVersion: RESUME_TEMPLATE_VERSION, compilerVersion: RESUME_COMPILER_VERSION,
    input_tokens: null, output_tokens: null, model: null, created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
    latestArtifact: null, sourceProfileChanged: false, requiresFreshPlan: false,
  };
  await page.route(`**/api/v2/tailor/${smokeJob.id}`, (route) => route.fulfill({ json: { tailoring } }));
  await page.route("**/api/v2/tailorings/test-tailoring/artifacts", (route) => route.fulfill({ json: { artifacts: [] } }));
  await page.goto(`/tailor/${smokeJob.id}`);
  const editor = page.getByRole("tab", { name: "Resume", exact: true });
  const preview = page.getByRole("tab", { name: "Preview", exact: true });
  // Desktop shows editor and preview together; its compact view switch is mobile-only.
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.focus();
  await page.keyboard.press("End");
  await expect(preview).toHaveAttribute("aria-selected", "true");
  await expect(preview).toBeFocused();
  await page.keyboard.press("Home");
  await expect(editor).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#tailoring-panel-resume")).toContainText("Avery Tester");
});

test("public content is prerendered and unknown addresses show a recovery page", async ({ browser, page, request }) => {
  const response = await request.get("/about");
  const html = await response.text();
  expect(html).toContain("Find your next role with Pinkslip");
  expect(html).toContain('name="description"');
  expect(html).toMatch(/script-src 'self' 'sha256-/);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const publicPage = await context.newPage();
  await publicPage.goto(new URL("/about", page.url() === "about:blank" ? response.url() : page.url()).href);
  await expect(publicPage.getByRole("heading", { level: 1 })).toHaveText("Find your next role with Pinkslip");
  await context.close();
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to jobs" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
});
