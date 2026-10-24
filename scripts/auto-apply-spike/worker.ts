import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";
import { FILL_FORM_FUNCTION, READ_FORM_BODY } from "../../apps/native/src/platform/autofill/scripts.generated";

/**
 * Phase 0 of auto-apply: can Cloudflare's headless browser open real
 * Greenhouse, Ashby and Lever forms, read them with assisted apply's reader
 * and fill them with its filler? `/read` opens a page and keeps the browser
 * for `/fill`, which fills and screenshots it. Nothing here ever submits.
 */
interface Env {
  BROWSER: BrowserWorker;
}

/** A page that's a wall rather than a form. */
const BLOCKED_TITLES = /just a moment|attention required|access denied|forbidden|are you a robot|verify you are human/i;
/** Captcha and bot-check widgets, by the frames and scripts they load. */
const CHECKS: Array<[string, RegExp]> = [
  ["recaptcha", /recaptcha|google\.com\/recaptcha/i],
  ["hcaptcha", /hcaptcha\.com/i],
  ["turnstile", /challenges\.cloudflare\.com|turnstile/i],
  ["datadome", /datadome/i],
  ["perimeterx", /perimeterx|px-cdn|px-captcha/i],
  ["arkose", /arkoselabs|funcaptcha/i],
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const body = await request.json() as Record<string, unknown>;

    if (path === "/read") {
      const started = Date.now();
      const browser = await puppeteer.launch(env.BROWSER, { keep_alive: 180_000 });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      let status: number | null = null;
      let error: string | null = null;
      try {
        const response = await page.goto(String(body.url), { waitUntil: "networkidle2", timeout: 45_000 });
        status = response?.status() ?? null;
      } catch (cause) {
        error = `goto: ${String(cause)}`;
      }
      const loadMs = Date.now() - started;
      const title = await page.title().catch(() => "");
      const html = await page.content().catch(() => "");
      const frames = page.frames().map((frame) => frame.url()).filter((url) => url && url !== "about:blank");
      const scripts = await page.evaluate("Array.from(document.scripts).map((s) => s.src).filter(Boolean)").catch(() => []) as string[];
      const checks = CHECKS.filter(([, pattern]) => frames.some((url) => pattern.test(url)) || scripts.some((url) => pattern.test(url)) || pattern.test(html.slice(0, 200_000)))
        .map(([name]) => name);
      let read: unknown = null;
      const readStarted = Date.now();
      try {
        read = JSON.parse(await page.evaluate(`(async () => { ${READ_FORM_BODY} })()`) as string);
      } catch (cause) {
        error = error ?? `read: ${String(cause)}`;
      }
      const sessionId = browser.sessionId();
      browser.disconnect();
      return Response.json({
        sessionId, status, finalUrl: page.url(), title, blocked: BLOCKED_TITLES.test(title),
        loadMs, readMs: Date.now() - readStarted, checks, frames: frames.slice(0, 12), read, error,
      });
    }

    if (path === "/fill") {
      const browser = await puppeteer.connect(env.BROWSER, String(body.sessionId));
      // The session also has the browser's empty first tab; take the form's.
      const pages = await browser.pages();
      const page = pages.find((candidate) => candidate.url() === body.url)
        ?? pages.find((candidate) => !candidate.url().startsWith("about:")) ?? pages.at(-1)!;
      const started = Date.now();
      let report: unknown = null;
      let error: string | null = null;
      try {
        report = await page.evaluate(`(${FILL_FORM_FUNCTION})(${JSON.stringify(body.request)})`);
      } catch (cause) {
        error = `fill: ${String(cause)}`;
      }
      const fillMs = Date.now() - started;
      // Let validation and uploads settle before the picture.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const screenshot = await page.screenshot({ type: "jpeg", quality: 50, fullPage: true, encoding: "base64" }).catch(() => null);
      await browser.close();
      return Response.json({ report, fillMs, error, screenshot });
    }

    return new Response("Not found", { status: 404 });
  },
};
