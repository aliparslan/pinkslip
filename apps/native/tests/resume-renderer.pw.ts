import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve(__dirname, "../assets/resume-renderer.html"), "utf8");
const fixture = (name: string) => readFileSync(resolve(__dirname, name === "scanned-multipage" || name === "protected"
  ? `../../../tests/fixtures/resume-import/${name}.pdf` : `../assets/fixtures/${name}.pdf`)).toString("base64");

for (const name of ["resume-text", "resume-notext", "resume-malformed", "scanned-multipage", "protected"]) {
  test(`local PDF renderer: ${name}`, async ({ page }) => {
    const messages: Array<Record<string, unknown>> = [];
    const external: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.exposeFunction("recordMessage", (data: string) => messages.push(JSON.parse(data)));
    await page.addInitScript(() => {
      (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = {
        postMessage: (data: string) => (window as unknown as { recordMessage(data: string): void }).recordMessage(data),
      };
    });
    await page.route("**/*", (route) => {
      if (route.request().url() === "https://renderer.example.test/") return route.fulfill({ contentType: "text/html", body: html });
      external.push(route.request().url());
      return route.abort();
    });
    await page.goto("https://renderer.example.test/");
    await expect.poll(() => errors.length ? errors : messages.some((message) => message.kind === "ready")).toBe(true);
    await page.evaluate(({ pdf }) => {
      void (window as unknown as { pinkslipRenderPdf(pdf: string, id: string): Promise<void> }).pinkslipRenderPdf(pdf, "test");
    }, { pdf: fixture(name) });
    await expect.poll(() => messages.find((message) => message.kind === "done" || message.kind === "error"), { timeout: 20_000 }).toBeTruthy();
    expect(external).toEqual([]);
    if (name === "resume-malformed" || name === "protected") {
      expect(messages.find((message) => message.kind === "error")).toMatchObject({ code: name === "protected" ? "protected_pdf" : "invalid_pdf", id: "test" });
    } else {
      expect(messages.find((message) => message.kind === "error")).toBeUndefined();
      const pages = messages.filter((message) => message.kind === "page");
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(3);
      if (name === "scanned-multipage") expect(pages).toHaveLength(3);
      for (const page of pages) {
        expect(Number(page.width)).toBeLessThanOrEqual(1801);
        expect(Number(page.height)).toBeLessThanOrEqual(1801);
        expect(Number(page.width) * Number(page.height)).toBeLessThanOrEqual(2_505_000);
        expect(Buffer.from(String(page.base64), "base64").subarray(0, 3).toString("hex")).toBe("ffd8ff");
      }
    }
  });
}
