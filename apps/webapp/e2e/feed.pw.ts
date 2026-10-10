import { expect, test } from "./fixtures";
import { installApiMocks, mockJob, type MockJob } from "./api-mocks";

// Port plan 4.2–4.4: the feed, the job page and Library, against mocked API
// responses for a signed-in person.

const jobs: MockJob[] = [
  mockJob("job-a", { title: "Frontend Engineer", company_name: "Acme Corporation", company_id: "acme" }),
  mockJob("job-b", { title: "Platform Engineer", company_name: "Northstar Labs", company_id: "northstar" }),
  mockJob("job-c", { title: "Data Analyst", company_name: "Brightline", company_id: "brightline" }),
];

test.describe("feed", () => {
  test("search waits for typing to pause, then lands in the URL and the request", async ({ page }) => {
    const requests: URL[] = [];
    await installApiMocks(page, { jobs, onJobsRequest: (url) => requests.push(url) });
    await page.goto("/");
    await expect(page.locator('[data-job-id="job-b"]')).toBeVisible();

    await page.getByRole("searchbox", { name: "Search jobs or companies" }).fill("platform");
    await expect(page).toHaveURL(/[?&]q=platform/);
    await expect.poll(() => requests.at(-1)?.searchParams.get("q")).toBe("platform");

    await page.reload();
    await expect(page.getByRole("searchbox", { name: "Search jobs or companies" })).toHaveValue("platform");
  });

  test("filters apply from the sheet, count in the button and survive reload", async ({ page }) => {
    const requests: URL[] = [];
    await installApiMocks(page, { jobs, onJobsRequest: (url) => requests.push(url) });
    await page.goto("/");
    await page.getByRole("button", { name: "Filters" }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet.getByLabel("Min salary ($K)").fill("120");
    await sheet.getByRole("button", { name: "Internships" }).click();
    await sheet.getByRole("switch", { name: "Saved jobs only" }).click();
    await sheet.getByRole("button", { name: "Apply" }).click();

    await expect(page).toHaveURL(/min=120/);
    await expect(page).toHaveURL(/saved=1/);
    const last = () => requests.at(-1)?.searchParams;
    await expect.poll(() => last()?.get("min_salary")).toBe("120000");
    expect(last()?.get("saved")).toBe("true");
    expect(last()?.get("stages")).toBe("new_grad,early_career");
    // The profile's metros are preselected, as in the current app.
    expect(last()?.get("locations")).toContain("chicago");
    await expect(page.getByRole("button", { name: "Filters, 4 active" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Filters, 4 active" })).toBeVisible();
  });

  test("an empty filtered feed offers to clear the filters", async ({ page }) => {
    await installApiMocks(page, { jobs: [] });
    await page.goto("/?min=900");
    await expect(page.getByRole("heading", { name: "No jobs match your filters" })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/min=/);
    await expect(page).toHaveURL(/loc=all/);
    await expect(page.getByRole("heading", { name: "No jobs right now" })).toBeVisible();
    await expect(page.getByText("You’re all caught up. Go touch grass.")).toHaveCount(0);
  });

  test("hide removes the row, writes it, and Undo restores it", async ({ page }) => {
    const writes: { method: string; path: string; body: unknown }[] = [];
    await installApiMocks(page, { jobs, onWrite: (write) => writes.push(write) });
    await page.goto("/");
    await page.getByRole("button", { name: "Actions for Platform Engineer at Northstar Labs" }).click();
    await page.getByRole("menuitem", { name: "Hide" }).click();
    await expect(page.locator('[data-job-id="job-b"]')).toHaveCount(0);
    await expect.poll(() => writes.some((write) => write.path === "/jobs/job-b" && JSON.stringify(write.body) === '{"dismissed":true}')).toBe(true);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator('[data-job-id="job-b"]')).toBeVisible();
  });

  test("visitors read the full feed with filters; only saving starts a session", async ({ page }) => {
    const requests: URL[] = [];
    await installApiMocks(page, { jobs, onJobsRequest: (url) => requests.push(url) });
    await page.route("**/api/v2/me", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ user: null, session: { state: "anonymous" }, account: null, is_admin: false }),
    }));
    await page.goto("/");
    await expect(page.locator('[data-job-id="job-b"]')).toBeVisible();
    expect(requests.length).toBeGreaterThan(0);
    await page.getByRole("button", { name: /Filters/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await expect(sheet.getByRole("switch", { name: "Saved jobs only" })).toHaveCount(0);
    await sheet.getByRole("button", { name: "Close filters" }).click();

    await page.getByRole("button", { name: "Actions for Platform Engineer at Northstar Labs" }).click();
    await expect(page.getByRole("menuitem", { name: "Save" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Hide" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /Mark as/ })).toHaveCount(0);
  });
});

test.describe("job page", () => {
  test("on wide screens the job opens beside the list, which keeps its place", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installApiMocks(page, { jobs });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Select a job" })).toBeVisible();
    await page.locator('[data-job-id="job-b"]').click();
    await expect(page).toHaveURL("/jobs/job-b");
    await expect(page.getByRole("heading", { level: 1, name: "Platform Engineer" })).toBeVisible();
    await expect(page.locator('[data-job-id="job-b"]')).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Back", exact: true })).toBeHidden();

    // j/k step through the list.
    await page.keyboard.press("j");
    await expect(page).toHaveURL("/jobs/job-c");
    await page.keyboard.press("k");
    await page.keyboard.press("k");
    await expect(page).toHaveURL("/jobs/job-a");
    await expect(page.getByRole("heading", { level: 1, name: "Frontend Engineer" })).toBeVisible();
  });

  test("on phones the job replaces the list and Back returns to it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiMocks(page, { jobs });
    await page.goto("/?q=engineer");
    await page.locator('[data-job-id="job-a"]').click();
    await expect(page.getByRole("heading", { level: 1, name: "Frontend Engineer" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Jobs" })).toHaveCount(0);
    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL("/?q=engineer");
  });

  test("save toggles, and coming back from Apply asks whether you applied", async ({ page, context }) => {
    const writes: { method: string; path: string; body: unknown }[] = [];
    await installApiMocks(page, { jobs, onWrite: (write) => writes.push(write) });
    await page.goto("/jobs/job-a");
    await expect(page.getByRole("heading", { level: 1, name: "Frontend Engineer" })).toBeVisible();
    await expect(page.getByText("Build thoughtful, accessible product experiences")).toBeVisible();

    await page.getByRole("button", { name: "Save job" }).click();
    await expect(page.getByRole("button", { name: "Remove from saved jobs" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => writes.some((write) => write.path === "/jobs/job-a" && JSON.stringify(write.body) === '{"saved":true}')).toBe(true);

    const popup = context.waitForEvent("page");
    await page.getByRole("button", { name: "Apply" }).click();
    const tab = await popup;
    await tab.close();
    await page.bringToFront();
    // Headless Chrome doesn't blur the page for the new tab; act it out.
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForTimeout(800);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const prompt = page.getByRole("alertdialog", { name: "Did you apply?" });
    await expect(prompt).toBeVisible();
    await prompt.getByRole("button", { name: "Yes, I applied" }).click();
    await expect.poll(() => writes.some((write) => write.path === "/jobs/job-a" && JSON.stringify(write.body).includes('"applied":true'))).toBe(true);
    await expect(page.getByRole("button", { name: "Applied", exact: true })).toBeDisabled();
  });

  test("the menu holds the rest: not interested leaves the job", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const writes: { method: string; path: string; body: unknown }[] = [];
    await installApiMocks(page, { jobs, onWrite: (write) => writes.push(write) });
    await page.goto("/");
    await page.locator('[data-job-id="job-b"]').click();
    await page.getByRole("button", { name: "More job actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Report listing" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Not interested" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.locator('[data-job-id="job-b"]')).toHaveCount(0);
    expect(writes.some((write) => write.path === "/jobs/job-b")).toBe(true);
  });
});

test.describe("library", () => {
  test("tabs show counts; removing a saved job offers Undo", async ({ page }) => {
    const saved = [mockJob("saved-1", { title: "Saved Role", company_name: "Acme Corporation", company_id: "acme", saved: true })];
    const applied = [mockJob("applied-1", { title: "Applied Role", company_name: "Northstar Labs", company_id: "northstar", applied: true, applied_at: "2026-10-01T12:00:00.000Z" } as Partial<MockJob>)];
    await installApiMocks(page, { saved, applied });
    await page.goto("/library/saved");
    await expect(page.getByRole("tab", { name: /Saved/ })).toContainText("1");
    await expect(page.getByRole("tab", { name: /Applied/ })).toContainText("1");

    await page.getByRole("button", { name: "Actions for Saved Role at Acme Corporation" }).click();
    await page.getByRole("menuitem", { name: "Remove from saved" }).click();
    await expect(page.locator('[data-job-id="saved-1"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "No saved jobs" })).toBeVisible();

    await page.getByRole("tab", { name: /Applied/ }).click();
    await expect(page).toHaveURL("/library/applied");
    await expect(page.locator('[data-job-id="applied-1"]')).toContainText(/Applied \d+d ago/);
    await expect(page.locator('[data-job-id="applied-1"]')).toHaveAttribute("href", "/jobs/applied-1?from=library-applied");
  });
});

test("a job only a signed-in person can see opens from their copy", async ({ page }) => {
  await installApiMocks(page, { jobs: [mockJob("private-job", { title: "Hidden Gem", company_name: "Quiet Co", company_id: "quiet" })] });
  await page.goto("/jobs/private-job");
  await expect(page.getByRole("heading", { level: 1, name: "Hidden Gem" })).toBeVisible();
});
