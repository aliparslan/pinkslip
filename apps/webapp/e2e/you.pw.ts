import { expect, test } from "./fixtures";
import { installApiMocks } from "./api-mocks";

// Port plan 4.5–4.8: You, Account, Feedback, Preferences, Onboarding and
// Alerts against mocked API responses.

type Write = { method: string; path: string; body: unknown };
const guest = (page: import("@playwright/test").Page) => page.route("**/api/v2/me", (route) => route.fulfill({
  status: 200, contentType: "application/json",
  body: JSON.stringify({ user: { id: "guest", name: "", role: "user", created_at: "2026-01-01" }, session: { state: "guest" }, account: null, is_admin: false }),
}));

test("You summarizes each setting, and Appearance applies at once and sticks", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/you");
  await expect(page.getByRole("link", { name: /Job preferences All career stages/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Account avery@example.com/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Admin workspace/ })).toBeVisible();

  await page.getByRole("combobox", { name: "Appearance" }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await expect(page.getByRole("combobox", { name: "Appearance" })).toHaveValue("dark");
});

test("preferences autosave a moment after a change and can reset", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, { onWrite: (write) => writes.push(write) });
  await page.goto("/you/preferences");
  await page.getByRole("button", { name: "Internships" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const saved = writes.filter((write) => write.path === "/preferences").at(-1)?.body as { search_profile: { target_levels: string[] } };
  expect(saved.search_profile.target_levels).toEqual(["new_grad", "early_career"]);

  // Career stage keeps at least one.
  await page.getByRole("button", { name: "New grad" }).click();
  await page.getByRole("button", { name: /Early/ }).click();
  await expect(page.getByRole("button", { name: /Early/ })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.getByRole("button", { name: "Internships" })).toHaveAttribute("aria-pressed", "true");
});

test("alerts: the account switch saves; the device row reflects the browser", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, { onWrite: (write) => writes.push(write) });
  await page.goto("/you/alerts");
  await page.getByRole("switch", { name: "Job alerts" }).click();
  await expect.poll(() => writes.find((write) => write.path === "/push/settings")?.body).toEqual({ enabled: true, push_enabled: true });
  await expect(page.getByText("This device")).toBeVisible();
});

test("a guest signs in by email link, with validation first", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, { onWrite: (write) => writes.push(write) });
  await guest(page);
  await page.goto("/you/account");
  await expect(page.getByText("Browsing as a guest")).toBeVisible();
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await page.getByLabel("Email").fill("avery@example.com");
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByText("Link sent to avery@example.com.", { exact: false })).toBeVisible();
  expect(writes.find((write) => write.path === "/auth/email/start")?.body).toEqual({ email: "avery@example.com" });
  await expect(page.getByRole("button", { name: "Resend link" })).toBeVisible();
});

test("feedback needs a subject, sends, and returns to You", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, { onWrite: (write) => writes.push(write) });
  await page.goto("/you/feedback");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Add a short subject.")).toBeVisible();
  await page.getByLabel("Subject").fill("Dark mode for the resume preview");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page).toHaveURL("/you");
  expect(writes.find((write) => write.path === "/interactions/feedback")?.body)
    .toMatchObject({ submission_type: "feature_request", title: "Dark mode for the resume preview" });
});

test("the feed offers setup until it's done; finishing saves the search and returns", async ({ page }) => {
  const writes: Write[] = [];
  await installApiMocks(page, { searchProfile: { onboarding_completed_at: null, onboarding_version: 0 }, onWrite: (write) => writes.push(write) });
  await page.goto("/");
  await page.getByRole("link", { name: "Set up" }).click();
  await expect(page).toHaveURL("/welcome");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "What are you looking for?" })).toBeVisible();
  await page.getByRole("button", { name: "Internships" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Where can you work?" })).toBeFocused();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Add your resume" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("heading", { name: "Hear about new jobs first" })).toBeVisible();
  await page.getByRole("button", { name: "Show my jobs" }).click();
  await expect(page).toHaveURL("/");

  const last = writes.filter((write) => write.path === "/preferences").at(-1)?.body as { search_profile: Record<string, unknown> };
  expect(last.search_profile.onboarding_version).toBe(3);
  expect(last.search_profile.onboarding_completed_at).toEqual(expect.any(String));
  expect(last.search_profile.target_levels).toEqual(["new_grad", "early_career"]);
  await expect(page.getByRole("link", { name: "Set up" })).toHaveCount(0);
});
