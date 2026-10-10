import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";
import { installApiMocks } from "./api-mocks";

// Port plan 4.10–4.12: resume import and editor, and the answers bank.

type Write = { method: string; path: string; body: unknown };
const textPdf = fileURLToPath(new URL("../../native/assets/fixtures/resume-text.pdf", import.meta.url));

test("adding a position edits it on its own view and autosaves", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, { onWrite: (write) => writes.push(write) });
  await page.goto("/you/resume");
  await expect(page.getByRole("button", { name: /Avery Tester/ })).toBeVisible();
  await page.getByRole("button", { name: "Add experience" }).click();
  await expect(page).toHaveURL(/edit=experience%3A|edit=experience:/);
  await page.getByLabel("Title").fill("Software Engineer Intern");
  await page.getByLabel("Company").fill("Acme");
  await page.getByRole("switch", { name: "I work here now" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /Software Engineer Intern Acme/ })).toBeVisible();
  await expect.poll(() => {
    const body = writes.filter((write) => write.path === "/profile").at(-1)?.body as { data?: { experience: { title: string; endDate: string }[] } } | undefined;
    return body?.data?.experience[0];
  }).toMatchObject({ title: "Software Engineer Intern", endDate: "Present" });
});

test("an empty new position is dropped on the way back", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/you/resume");
  await page.getByRole("button", { name: "Add project" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /Untitled project/ })).toHaveCount(0);
});

test("a PDF imports in the browser, with a review step before it replaces anything", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/you/resume");
  await page.locator('input[type="file"]').setInputFiles(textPdf);
  const review = page.getByRole("dialog", { name: "Use this resume?" });
  await expect(review).toBeVisible({ timeout: 20_000 });
  await review.getByRole("button", { name: "Use this resume" }).click();
  await expect(page.getByText("Resume imported").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Experience" })).toBeVisible();
});

test("a file that isn't a PDF is refused with a way forward", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/you/resume");
  await page.locator('input[type="file"]').setInputFiles({ name: "resume.txt", mimeType: "text/plain", buffer: Buffer.from("not a pdf") });
  await expect(page.getByText("Choose a PDF resume.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose another PDF" })).toBeVisible();
});

test("answers: chips save, tapping again un-answers, and remembered answers delete with Undo", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, {
    onWrite: (write) => writes.push(write),
    answers: [{ key: "q:Why us?", label: "Why do you want to work here?", value: "The mission.", updated_at: "2026-10-01T00:00:00.000Z" }],
  });
  await page.route("**/api/v2/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ user: { id: "u1", name: "Avery", role: "user", created_at: "2026-01-01" }, session: { state: "authenticated" }, account: null, is_admin: false, features: { access_required: false, tailoring_enabled: false, tailoring_provider: null, tailoring_model: "", auto_apply_enabled: true } }),
  }));
  await page.goto("/you/answers");
  await page.getByRole("group", { name: "Open to relocation" }).getByRole("button", { name: "Yes" }).click();
  await expect.poll(() => writes.find((write) => write.path === "/apply/answers/relocation")?.body).toEqual({ value: "yes" });
  await page.getByRole("group", { name: "Open to relocation" }).getByRole("button", { name: "Yes" }).click();
  await expect.poll(() => writes.some((write) => write.method === "DELETE" && write.path === "/apply/answers/relocation")).toBe(true);

  await page.getByRole("button", { name: "Delete answer to Why do you want to work here?" }).click();
  await expect(page.getByText("Why do you want to work here?")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Why do you want to work here?")).toBeVisible();
});

test("without auto-apply, answers and tailoring say they're coming", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/you/answers");
  await expect(page.getByRole("heading", { name: "Coming soon" })).toBeVisible();
  await page.goto("/you/tailoring");
  await expect(page.getByRole("heading", { name: "Coming soon" })).toBeVisible();
});
