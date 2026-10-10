import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { installApiMocks } from "./api-mocks";

// Port plan 4.9 and 4.14: Companies, admin Sources, Inbox, Runs and Jev
// against mocked API responses.

type Write = { method: string; path: string; body: unknown };

async function mock(page: Page, path: string | RegExp, payload: unknown, status = 200) {
  await page.route(typeof path === "string" ? `**/api/v2${path}` : path, (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) }));
}

test("companies: hide with Undo, the Hidden tab, and requesting a missing company", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, { onWrite: (write) => writes.push(write) });
  await page.goto("/you/companies");
  await expect(page.getByRole("link", { name: "Northstar Labs" })).toBeVisible();

  await page.getByRole("button", { name: "Hide Acme Corporation" }).click();
  await expect(page.getByText("Acme Corporation hidden from jobs")).toBeVisible();
  await expect(page.getByRole("link", { name: "Acme Corporation" })).toHaveCount(0);
  expect(writes.some((write) => write.method === "POST" && write.path === "/interactions/companies/smoke-company/block")).toBe(true);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("link", { name: "Acme Corporation" })).toBeVisible();
  await expect.poll(() => writes.some((write) => write.method === "DELETE" && write.path === "/interactions/companies/smoke-company/block")).toBe(true);

  await page.getByRole("button", { name: "Hide Northstar Labs" }).click();
  await page.getByRole("tab", { name: /Hidden/ }).click();
  await expect(page.getByRole("button", { name: "Restore Northstar Labs" })).toBeVisible();

  await page.getByRole("tab", { name: "All" }).click();
  await page.getByRole("searchbox", { name: "Search companies" }).fill("Figma");
  await page.getByRole("button", { name: /Request “Figma”/ }).click();
  await expect(page.getByRole("dialog", { name: "Request a company" })).toBeVisible();
  await page.getByLabel("Careers page").fill("https://figma.com/careers");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Company request sent")).toBeVisible();
  expect(writes.find((write) => write.path === "/interactions/feedback")?.body)
    .toEqual({ submission_type: "company_request", title: "Figma", careers_url: "https://figma.com/careers" });
});

test("sources: the enable switch saves, and a new source verifies before it's added", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, { onWrite: (write) => writes.push(write) });
  await mock(page, "/companies/verify", { ok: true, total_jobs: 12, sample_jobs: [{ externalId: "1", title: "Software Engineer Intern" }] });
  await page.goto("/admin/sources");
  await expect(page.getByLabel("Source status")).toContainText("2 active");

  await page.getByRole("switch", { name: "Enable Northstar Labs" }).click();
  await expect.poll(() => writes.find((write) => write.method === "PATCH")).toEqual({ method: "PATCH", path: "/companies/smoke-company-two", body: { enabled: false } });

  await page.getByRole("button", { name: "Add source" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a source" });
  await dialog.getByLabel("Company name").fill("Figma");
  await dialog.getByLabel("ATS slug").fill("figma");
  await dialog.getByRole("button", { name: "Verify" }).click();
  await expect(dialog.getByText("12 jobs found · Software Engineer Intern")).toBeVisible();
  await dialog.getByRole("button", { name: "Add source" }).click();
  await expect.poll(() => writes.find((write) => write.method === "POST" && write.path === "/companies")?.body)
    .toEqual({ name: "Figma", ats_type: "greenhouse", ats_slug: "figma" });
});

test("inbox: a decision leaves the list and Undo restores it; reviews take a note", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, { onWrite: (write) => writes.push(write) });
  await mock(page, /\/api\/v2\/interactions\/feedback\?/, { feedback: [{
    id: "f1", user_id: "u", submission_type: "feature_request", title: "Dark mode for the resume", details: "Please", careers_url: null,
    status: "new", admin_response: null, created_at: "2026-10-09T12:00:00Z", updated_at: "2026-10-09T12:00:00Z", resolved_at: null, user_name: "Sam",
  }] });
  await mock(page, /\/api\/v2\/interactions\/reports\?/, { reports: [] });
  await mock(page, /\/api\/v2\/interactions\/job-reviews\?/, { reviews: [{
    job_id: "j1", state: "needs_review", reason_codes: ["ambiguous_title_level"], evidence: {}, classifier_version: "1", admin_note: null,
    created_at: "2026-10-09T12:00:00Z", updated_at: "2026-10-09T12:00:00Z", reviewed_at: null,
    title: "Engineer II", url: "https://example.com/j1", location: "Remote", company_name: "Acme",
  }], meta: { total: 1, count: 1, has_more: false, next_offset: 1 } });
  await page.goto("/admin/inbox");

  await expect(page.getByText("Dark mode for the resume")).toBeVisible();
  await expect(page.getByText("No open reports.")).toBeVisible();
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("Dark mode for the resume")).toHaveCount(0);
  // Focus doesn't fall to the page when the entry (and its button) leaves.
  await expect(page.getByText("No active feedback.")).toBeFocused();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => writes.filter((write) => write.path === "/interactions/feedback/f1").map((write) => write.body))
    .toEqual([{ status: "resolved" }, { status: "new" }]);

  await expect(page.getByText("Title level is ambiguous")).toBeVisible();
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByLabel("Review note").fill("Level II is early career here");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Nothing needs review.")).toBeVisible();
  expect(writes.find((write) => write.path === "/interactions/job-reviews/j1")?.body)
    .toEqual({ state: "approved", admin_note: "Level II is early career here" });
});

test("overview, runs and Jev render their data; a Jev verdict saves", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, { onWrite: (write) => writes.push(write) });
  await mock(page, /\/api\/v2\/runs\?/, { runs: [{
    id: "r1", scope: "all", status: "error", companies_attempted: 10, companies_succeeded: 9, companies_failed: 1,
    new_jobs_found: 4, notifications_sent: 2, errors_json: JSON.stringify([{ companyName: "Acme", error: "Request timed out after 15000ms" }]),
    started_at: "2026-10-10T12:00:00Z", finished_at: "2026-10-10T12:01:00Z", duration_ms: 61_000,
  }] });
  await mock(page, "/runs/latency", { generated_at: "2026-10-10T12:00:00Z", tiers: [] });
  await mock(page, "/metrics/classification/disagreements", {
    available: true, month_spent_usd: 1.25, monthly_budget_usd: 10,
    counts: { agree: 40, rules_only: 3, jev_only: 2, jev_unsure: 1, not_comparable: 0 },
    disagreements: [{
      cache_key: "k1", company: "Acme", title: "Platform Engineer", location: "Austin, TX", job_url: null, truncated: false,
      completed_at: "2026-10-10T12:00:00Z", kind: "rules_only",
      rules: { decision: "include", reason: null }, jev: { decision: "exclude", reason: "seniority" },
      fields: [{ field: "seniority", label: "Seniority", rules: "entry", jev: "senior", confidence: 0.8, mismatch: true }], review: null,
    }],
  });
  await page.route("**/api/v2/metrics/classification/reviews/k1", (route) => (writes.push({ method: route.request().method(), path: "/metrics/classification/reviews/k1", body: route.request().postDataJSON() }), route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ verdict: "rules", note: null, reviewed_at: "2026-10-10T12:00:00Z" }),
  })));

  await page.goto("/admin");
  await expect(page.getByText("Alerts sent")).toBeVisible();
  await expect(page.getByText("1 min")).toBeVisible();

  await page.goto("/admin/runs");
  await expect(page.getByText("Completed with errors")).toBeVisible();
  await expect(page.getByText("Timed out after 15 sec")).toBeVisible();

  await page.goto("/admin/jev");
  await expect(page.getByText("40 of 45")).toBeVisible();
  await expect(page.getByText("Exclude · too senior")).toBeVisible();
  await page.getByRole("button", { name: "Rules right" }).click();
  await expect(page.getByRole("tab", { name: /Reviewed/ })).toContainText("1");
  expect(writes.find((write) => write.path === "/metrics/classification/reviews/k1")?.body).toEqual({ verdict: "rules" });
});
