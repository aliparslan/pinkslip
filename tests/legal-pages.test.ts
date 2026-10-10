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
