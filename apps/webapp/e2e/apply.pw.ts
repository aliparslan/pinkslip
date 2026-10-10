import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { installApiMocks, smokeJob } from "./api-mocks";

// Port plan 4.13: the application prep sheet and recruiter email, each
// behind its feature flag.

type Write = { method: string; path: string; body: unknown };

async function withFeatures(page: Page, features: Record<string, boolean>) {
  await page.route("**/api/v2/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      user: { id: "u1", name: "Avery", role: "user", created_at: "2026-01-01" }, session: { state: "authenticated" },
      account: { authenticated: true, email: "avery@example.com", provider: "email", providers: ["email"] }, is_admin: false,
      features: { access_required: false, tailoring_enabled: false, tailoring_provider: null, tailoring_model: "", ...features },
    }),
  }));
}

const field = (id: string, label: string, answer: string | null, extra: Record<string, unknown> = {}) => ({
  id, label, type: "text", required: false, options: [], section: "questions", key: id, answer, source: answer ? "saved" : null, ...extra,
});

test("with auto-apply, Apply opens the prep sheet; answers save and the application opens", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, { onWrite: (write) => writes.push(write) });
  await withFeatures(page, { auto_apply_enabled: true });
  const form = (sponsorship: string | null) => ({
    job_id: smokeJob.id, supported: true, ats: "greenhouse", apply_url: "https://boards.example.com/apply/1",
    missing_required: sponsorship ? 0 : 1,
    fields: [
      field("first_name", "First name", "Avery", { section: "about" }),
      field("sponsorship", "Will you need sponsorship?", sponsorship, {
        type: "select", required: true, options: [{ label: "Yes", value: "1" }, { label: "No", value: "0" }],
      }),
    ],
  });
  await page.route(`**/api/v2/apply/jobs/${smokeJob.id}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(form(null)) }));
  await page.route(`**/api/v2/apply/jobs/${smokeJob.id}/answers`, (route) => {
    writes.push({ method: "POST", path: "/answers", body: route.request().postDataJSON() });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(form("No")) });
  });
  await page.addInitScript(() => {
    (window as unknown as { opened: string[] }).opened = [];
    window.open = ((url: string) => { (window as unknown as { opened: string[] }).opened.push(url); return null; }) as typeof window.open;
  });

  await page.goto(`/jobs/${smokeJob.id}`);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Apply to Acme Corporation" });
  await expect(sheet.getByText("Needs you")).toBeVisible();
  await sheet.getByRole("button", { name: "No" }).click();
  await expect.poll(() => writes.find((write) => write.path === "/answers")?.body).toEqual({ answers: { sponsorship: "No" } });
  // Answering doesn't move the question out of "Needs you".
  await expect(sheet.getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open application" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual(["https://boards.example.com/apply/1"]);
});

test("without auto-apply, Apply opens the posting directly", async ({ page }) => {
  await installApiMocks(page);
  await page.addInitScript(() => {
    (window as unknown as { opened: string[] }).opened = [];
    window.open = ((url: string) => { (window as unknown as { opened: string[] }).opened.push(url); return null; }) as typeof window.open;
  });
  await page.goto(`/jobs/${smokeJob.id}`);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([smokeJob.url]);
  await page.getByRole("button", { name: "More job actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Email recruiter" })).toHaveCount(0);
});

test("a follow-up reminder link opens the recruiter email; They replied stops follow-ups", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, { onWrite: (write) => writes.push(write) });
  await withFeatures(page, { outreach_enabled: true });
  const thread = (status: string) => ({
    id: "t1", status, job_id: smokeJob.id, job_title: smokeJob.title, company_id: "smoke-company", company_name: "Acme Corporation",
    contact: { name: "Jordan Lee", email: "jordan@example.com", title: "Recruiter", test: false },
    messages: [
      { id: "m0", step: 0, subject: "Frontend Engineer", body: "Hi Jordan", status: "sent", due_at: null, sent_at: "2026-10-06T15:00:00Z" },
      { id: "m1", step: 1, subject: "Re: Frontend Engineer", body: "Following up", status: status === "active" ? "scheduled" : "skipped", due_at: "2026-10-13T15:00:00Z", sent_at: null },
    ],
    created_at: "2026-10-06T15:00:00Z", updated_at: "2026-10-06T15:00:00Z",
  });
  await page.route("**/api/v2/outreach/threads/t1", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(thread("active")) }));
  await page.route("**/api/v2/outreach/threads/t1/replied", (route) => (writes.push({ method: "POST", path: "/outreach/threads/t1/replied", body: null }), route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(thread("replied")) })));

  await page.goto(`/jobs/${smokeJob.id}?outreach=t1`);
  const dialog = page.getByRole("dialog", { name: "Email Acme Corporation" });
  await expect(dialog.getByText("To Jordan Lee")).toBeVisible();
  await expect(dialog.getByLabel("Subject")).toHaveValue("Re: Frontend Engineer");
  await dialog.getByRole("button", { name: "They replied" }).click();
  await expect(dialog.getByText("They replied")).toBeVisible();
  expect(writes.some((write) => write.path === "/outreach/threads/t1/replied")).toBe(true);
});
