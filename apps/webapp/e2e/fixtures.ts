import { expect, test as base } from "@playwright/test";

/**
 * Every test starts as a guest, whatever the local API's `.dev.vars` say
 * (an `ACCESS_CODE` there locks personal pages). Tests that need another
 * session register their own `/api/v2/me` route, which takes precedence; tests
 * that exercise the real API set `realSession: true`.
 */
export const test = base.extend<{ realSession: boolean; guestSession: void }>({
  realSession: [false, { option: true }],
  guestSession: [async ({ page, realSession }, use) => {
    if (!realSession) {
      await page.route("**/api/v2/me", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: { id: "guest", name: "", role: "user", created_at: "2026-01-01" }, session: { state: "guest" }, account: null, is_admin: false }),
      }));
    }
    await use();
  }, { auto: true }],
});

export { expect };
