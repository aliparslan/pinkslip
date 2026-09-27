import { describe, expect, test } from "bun:test";
import { LEGAL_STYLES, privacyPolicyPage, supportPage } from "../worker/legal";

describe("public legal pages", () => {
  test("the privacy policy describes the app's material data practices and deletion path", () => {
    const html = privacyPolicyPage();

    expect(html).toContain("Privacy policy");
    expect(html).toContain("resume and profile content");
    expect(html).toContain("Workers AI");
    expect(html).toContain("Sign in with Apple");
    expect(html).toContain("You → Account → Delete account");
    expect(html).toContain("does not sell personal information");
    expect(html).toContain("mailto:login@pinkslip.work");
  });

  test("the support page provides real contact and self-service paths", () => {
    const html = supportPage();

    expect(html).toContain("mailto:login@pinkslip.work");
    expect(html).toContain("You → Help and feedback");
    expect(html).toContain("Delete account");
    expect(html).toContain('href="/privacy"');
  });

  test("the shared stylesheet remains script-free and mobile friendly", () => {
    expect(LEGAL_STYLES).toContain("color-scheme: light dark");
    expect(LEGAL_STYLES).toContain("max-width: 32rem");
    expect(LEGAL_STYLES).not.toContain("javascript:");
  });

  test("browser navigations reach the Worker instead of the SPA fallback", async () => {
    const config = await Bun.file(new URL("../wrangler.toml", import.meta.url)).text();

    expect(config).toContain('"/privacy"');
    expect(config).toContain('"/support"');
    expect(config).toContain('"/auth/email/verify"');
    expect(config).toContain('"/.well-known/apple-app-site-association"');
  });
});
