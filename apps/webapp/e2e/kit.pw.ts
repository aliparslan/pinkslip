import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

/**
 * Kit verification (port plan 2.4): accessibility in every theme, keyboard
 * behavior and focus return for every overlay, and screenshot baselines of the
 * dev-only /_kit catalog at phone and desktop widths.
 */

type Theme = "dark" | "light" | "contrast";

async function openKit(page: Page, theme: Theme = "dark") {
  await page.goto("/_kit");
  await expect(page.getByRole("heading", { name: "Kit", level: 1 })).toBeVisible();
  if (theme === "light") await page.getByRole("combobox", { name: /^Mode/ }).selectOption("light");
  if (theme === "contrast") await page.getByLabel("Increased contrast").check();
}

for (const theme of ["dark", "light", "contrast"] as const) {
  test(`kit has no accessibility violations in ${theme}`, async ({ page }) => {
    await openKit(page, theme);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("dialog traps focus, closes on Escape and returns focus", async ({ page }) => {
  await openKit(page);
  const trigger = page.getByRole("button", { name: "Open dialog" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Request a company" });
  await expect(dialog).toBeVisible();
  // Base UI's focus guards briefly take focus at the ends of the cycle and
  // hand it back, so poll for focus to settle inside the dialog.
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press("Tab");
    await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("filter sheet closes from its close button and returns focus", async ({ page }) => {
  await openKit(page);
  const trigger = page.getByRole("button", { name: "Open filter sheet" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close filters" }).click();
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("alert dialog can't be dismissed while its action runs", async ({ page }) => {
  await openKit(page);
  const trigger = page.getByRole("button", { name: "Log out…" });
  await trigger.click();
  const alert = page.getByRole("alertdialog", { name: "Log out?" });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Log out" }).click();
  await page.keyboard.press("Escape");
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(alert).toBeHidden({ timeout: 5_000 });
  await expect(page.getByText("Logged out (demo)")).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("menu works from the keyboard and returns focus", async ({ page }) => {
  await openKit(page);
  const trigger = page.getByRole("button", { name: "Actions for Frontend Engineer at Stripe" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  // Opening from the keyboard highlights the first item (Save).
  await expect(page.getByRole("menuitem", { name: "Save" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Hide" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByText("Job hidden")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
});

test("checkbox menu stays open while toggling", async ({ page }) => {
  await openKit(page);
  await page.getByRole("button", { name: /^Work mode/ }).click();
  const hybrid = page.getByRole("menuitemcheckbox", { name: "Hybrid" });
  await hybrid.click();
  await expect(hybrid).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Work mode/ })).toContainText("Remote, Hybrid");
});

test("popover opens from the keyboard and returns focus on Escape", async ({ page }) => {
  await openKit(page);
  const trigger = page.getByRole("button", { name: "Why this job?" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Why this job?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Why this job?" })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("tooltips show on keyboard focus", async ({ page }) => {
  await openKit(page);
  await page.getByRole("button", { name: "Hide job" }).focus();
  await expect(page.getByText("Hide job", { exact: true }).last()).toBeVisible();
});

test("tabs move with the arrow keys", async ({ page }) => {
  await openKit(page);
  const saved = page.getByRole("tab", { name: /Saved/ });
  await saved.focus();
  await page.keyboard.press("ArrowRight");
  const applied = page.getByRole("tab", { name: /Applied/ });
  await expect(applied).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(applied).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Applied jobs panel");
});

const viewports = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } } as const;

for (const [width, viewport] of Object.entries(viewports)) {
  for (const theme of ["dark", "light", "contrast"] as const) {
    test(`kit screenshot: ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openKit(page, theme);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`kit-${width}-${theme}.png`, { fullPage: true, maxDiffPixelRatio: 0.002 });
    });
  }
}
