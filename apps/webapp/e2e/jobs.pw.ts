import { expect, test } from "./fixtures";

// Port plan 4.1: the job row and the virtualized list, against the dev-only
// /_kit-list fixtures (300 jobs, actions wired to local state).

test.beforeEach(async ({ page }) => {
  await page.goto("/_kit-list");
  await expect(page.getByRole("heading", { level: 1, name: "Job list" })).toBeVisible();
});

test("only rows near the viewport are mounted, and the last one is reachable", async ({ page }) => {
  const list = page.getByRole("list", { name: "Jobs" });
  const items = list.getByRole("listitem");
  await expect(items.first()).toHaveAttribute("aria-setsize", "300");
  expect(await items.count()).toBeLessThan(60);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('[data-job-id="demo-300"]')).toBeVisible();
  await expect(list.getByRole("listitem").last()).toHaveAttribute("aria-posinset", "300");
});

test("focusing into the list mounts every row for keyboard and screen readers", async ({ page }) => {
  await page.locator('[data-job-id="demo-1"]').focus();
  await expect(page.getByRole("list", { name: "Jobs" }).getByRole("listitem")).toHaveCount(300);
});

test("a row shows its company, timing, title, location, salary and reason", async ({ page }) => {
  const first = page.locator('[data-job-id="demo-1"]');
  await expect(first).toHaveAttribute("href", "/jobs/demo-1");
  await expect(first).toContainText("Acme Corporation");
  await expect(first).toContainText(/Updated 2h ago/);
  await expect(first).toContainText("Frontend Engineer");
  await expect(first).toContainText("Chicago, IL");
  await expect(first).toContainText("$120K–$145K");
  await expect(first).toContainText("Matches your frontend");
  await expect(first.getByRole("img", { name: "New job" })).toBeVisible();

  // A read job is dimmed and loses the new dot.
  const read = page.locator('[data-job-id="demo-3"]');
  await expect(read).toHaveAttribute("data-viewed", "true");
  await expect(read.getByRole("img", { name: "New job" })).toHaveCount(0);
});

test("hide removes the row and Undo puts it back in place", async ({ page }) => {
  await page.getByRole("button", { name: "Actions for Software Engineer, New Grad at Northstar Labs" }).first().click();
  await page.getByRole("menuitem", { name: "Hide" }).click();
  await expect(page.locator('[data-job-id="demo-2"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-job-id="demo-2"]')).toBeVisible();
  await expect(page.getByRole("list", { name: "Jobs" }).getByRole("listitem").nth(1).locator("[data-job-id]"))
    .toHaveAttribute("data-job-id", "demo-2");
});

test("save confirms and leaves the menu; read state toggles", async ({ page }) => {
  const menu = page.getByRole("button", { name: "Actions for Frontend Engineer at Acme Corporation" }).first();
  await menu.click();
  await page.getByRole("menuitem", { name: "Save" }).click();
  await expect(page.getByText("Job saved").first()).toBeVisible();
  await menu.click();
  await expect(page.getByRole("menuitem", { name: "Save" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Mark as read" }).click();
  await expect(page.locator('[data-job-id="demo-1"]')).toHaveAttribute("data-viewed", "true");
});
