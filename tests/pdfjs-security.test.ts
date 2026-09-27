import { describe, expect, test } from "bun:test";

describe("PDF.js hardening", () => {
  test("pins a release that contains the embedded-JavaScript security fix", async () => {
    const packageJson = JSON.parse(await Bun.file(
      new URL("../packages/client/package.json", import.meta.url),
    ).text()) as { dependencies: Record<string, string> };

    expect(packageJson.dependencies["pdfjs-dist"]).toBe("6.2.108");
  });
});
