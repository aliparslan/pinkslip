import { describe, expect, test } from "bun:test";
import { termsPage } from "../shared/legal";
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
    expect(html).toContain("mailto:support@pinkslip.work");
  });

  test("the support page provides real contact and self-service paths", () => {
    const html = supportPage();

    expect(html).toContain("mailto:support@pinkslip.work");
    expect(html).toContain("You → Help and feedback");
    expect(html).toContain("Delete account");
    expect(html).toContain('href="/privacy"');
  });

  test("the terms cover applying, outreach, tips and the App Store, and link the policy", () => {
    const html = termsPage.bodyHtml;

    expect(termsPage.path).toBe("/terms");
    expect(html).toContain("you choose whether to send it");
    expect(html).toContain("Pinkslip limits how many messages go out");
    expect(html).toContain("Tips are optional and go through Stripe");
    expect(html).toContain("Apple's standard license");
    expect(html).toContain("You → Account → Delete account");
    expect(html).toContain("mailto:support@pinkslip.work");
    expect(html).toContain('href="/privacy"');
    // Pinkslip is one person, so the copy never speaks as "we".
    expect(html).not.toMatch(/\b([Ww]e|[Uu]s|[Oo]ur)\b/);
  });

  test("the privacy policy and support page link the terms", () => {
    expect(privacyPolicyPage()).toContain('href="/terms"');
    expect(supportPage()).toContain('href="/terms"');
  });

  test("the shared stylesheet remains script-free and mobile friendly", () => {
    expect(LEGAL_STYLES).toContain("color-scheme: light dark");
    expect(LEGAL_STYLES).toContain("max-width: 32rem");
    expect(LEGAL_STYLES).not.toContain("javascript:");
  });

  test("the web Worker owns the hostnames and the API serves no pages", async () => {
    // Chunk 3.4: a backend deploy must never be able to take the site down.
    const api = Bun.TOML.parse(await Bun.file(new URL("../wrangler.toml", import.meta.url)).text()) as Record<string, unknown>;
    expect(api.assets).toBeUndefined();
    expect(api.routes).toBeUndefined();
    expect(api.workers_dev).toBe(false);

    const webSource = await Bun.file(new URL("../apps/webapp/wrangler.jsonc", import.meta.url)).text();
    const web = JSON.parse(webSource.replace(/^\s*\/\/.*$/gm, "")) as {
      routes: { pattern: string; custom_domain: boolean }[];
      services: { binding: string; service: string }[];
    };
    expect(web.routes.map((route) => route.pattern).sort()).toEqual(["pinkslip.alip.dev", "pinkslip.work"]);
    expect(web.routes.every((route) => route.custom_domain)).toBe(true);
    expect(web.services).toContainEqual({ binding: "API", service: "pinkslip" });
  });
});
