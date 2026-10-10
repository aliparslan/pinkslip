import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";

// Session and access (port plan 3.2). The account API is intercepted so each
// state is deterministic regardless of the local deployment's access code.

type Me = Record<string, unknown>;
const user = (overrides: Me = {}) => ({ id: "u1", name: "Avery", role: "user", created_at: "2026-01-01", ...overrides });
const guest: Me = { user: user(), session: { state: "guest" }, account: null, is_admin: false };
const signedIn: Me = { user: user(), session: { state: "authenticated" }, account: { authenticated: true, email: "avery@example.com", provider: "email", providers: ["email"] }, is_admin: false };
const admin: Me = { ...signedIn, user: user({ role: "admin" }), is_admin: true };

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function mockMe(page: Page, respond: () => [number, unknown]) {
  await page.route("**/api/v2/me", (route) => json(route, ...respond()));
}

test("a locked deployment gates personal pages but not the catalog", async ({ page }) => {
  let unlocked = false;
  await mockMe(page, () => unlocked ? [200, guest] : [401, { error: "Access required", code: "access_required" }]);
  await page.route("**/api/v2/access", (route) => {
    const { code } = route.request().postDataJSON() as { code: string };
    if (code !== "letmein") return json(route, 401, { error: "Invalid code", code: "invalid_access_code" });
    unlocked = true;
    return json(route, 200, { ok: true, required: true });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();

  await page.goto("/you");
  await expect(page.getByRole("heading", { level: 1, name: "Enter the shared code" })).toBeVisible();
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("Enter the shared access code.")).toBeVisible();
  await page.getByLabel("Access code").fill("nope");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("That code didn't match.")).toBeVisible();
  await page.getByLabel("Access code").fill("letmein");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "You" })).toBeVisible();
});

test("admin pages are a 404 for everyone but admins", async ({ page }) => {
  let me = signedIn;
  await mockMe(page, () => [200, me]);
  await page.goto("/admin/runs");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  me = admin;
  await page.goto("/admin/runs");
  await expect(page.getByRole("heading", { level: 1, name: "Runs" })).toBeVisible();
});

test("the email sign-in result shows once and leaves the URL", async ({ page }) => {
  await mockMe(page, () => [200, signedIn]);
  await page.goto("/you/account?auth=email-success&from=email");
  // Base UI also mirrors each toast into a screen-reader announcement.
  await expect(page.getByText("Signed in from your email link.").first()).toBeVisible();
  await expect(page).toHaveURL("/you/account?from=email");
  await page.goto("/you/account?auth=email-expired");
  await expect(page.getByText("That sign-in link expired. Send yourself a fresh one.").first()).toBeVisible();
  await expect(page).toHaveURL("/you/account");
});

test("signing out confirms, adopts the new session and says so", async ({ page }) => {
  await mockMe(page, () => [200, signedIn]);
  await page.route("**/api/v2/auth/logout", (route) => json(route, 200, guest));
  await page.goto("/you/account");
  await expect(page.getByText("avery@example.com")).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Log out?" });
  await confirm.getByRole("button", { name: "Log out" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText("Signed out").first()).toBeVisible();
  await expect(page.getByText("Not signed in")).toBeVisible();
});

test("a failed session load offers a retry", async ({ page }) => {
  let fail = true;
  await mockMe(page, () => fail ? [500, { error: "Down" }] : [200, guest]);
  await page.goto("/library/saved");
  const failure = page.getByRole("alert").filter({ hasText: "Couldn't load your account" });
  await expect(failure).toBeVisible({ timeout: 10_000 });
  fail = false;
  await failure.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
});
