import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";
import { FILL_FORM_FUNCTION, READ_FORM_BODY } from "../../apps/native/src/platform/autofill/scripts.generated";
import { openFormPage, reconnectFormPage } from "../../worker/apply/browser";
import { fillPlan, prepareForm, recheck, type Prepared } from "../../worker/apply/send-engine";

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

    // The form's markup with long attributes and text trimmed, to see why a
    // question was read the way it was.
    if (path === "/dom") {
      const browser = await puppeteer.launch(env.BROWSER, { keep_alive: 60_000 });
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.goto(String(body.url), { waitUntil: "networkidle2", timeout: 45_000 });
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        const html = await page.evaluate(`(() => {
          const root = (document.querySelector("form") || document.body).cloneNode(true);
          root.querySelectorAll("svg, script, style, path").forEach((node) => node.remove());
          for (const node of root.querySelectorAll("*")) {
            for (const attribute of [...node.attributes]) {
              if (!/^(class|id|for|name|type|role|aria-|required|data-field|data-option|data-testid|placeholder|value|tabindex|for)/.test(attribute.name)) node.removeAttribute(attribute.name);
              else if (attribute.value.length > 80) node.setAttribute(attribute.name, attribute.value.slice(0, 80));
            }
          }
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let text = walker.nextNode(); text; text = walker.nextNode()) if (text.nodeValue.length > 90) text.nodeValue = text.nodeValue.slice(0, 90) + "…";
          return root.outerHTML;
        })()`);
        return new Response(String(html), { headers: { "content-type": "text/plain" } });
      } finally {
        await browser.close();
      }
    }

    // Phase 1's engine (worker/apply/send-engine.ts) as a dry run: /prepare
    // declines cookies, uploads the resume first and waits for the site's
    // own autofill; the runner plans; /finish fills, rechecks and pictures it.
    if (path === "/prepare") {
      const started = Date.now();
      const page = await openFormPage(env.BROWSER as unknown as Fetcher, String(body.url));
      try {
        const prepared = await prepareForm(page, body.resume as never);
        page.detach();
        return Response.json({ sessionId: page.sessionId, status: page.status, blocked: page.blocked, url: page.url(), prepared, ms: Date.now() - started });
      } catch (error) {
        await page.close();
        return Response.json({ error: String(error), ms: Date.now() - started });
      }
    }

    // The planner runs on the Mac, so options a search box reveals go back to
    // the runner, which plans them and calls /finish again with those picks.
    if (path === "/finish") {
      const started = Date.now();
      const page = await reconnectFormPage(env.BROWSER as unknown as Fetcher, String(body.sessionId), String(body.url));
      let keep = false;
      try {
        const prepared = body.prepared as Extract<Prepared, { kind: "ready" }>;
        const revealed: unknown[] = [];
        const replan = body.replanned ? undefined : async (controls: unknown[]) => { revealed.push(...controls); return { steps: [] }; };
        const filled = await recheck(page, body.plan as never, prepared, body.resume as never,
          await fillPlan(page, body.plan as never, prepared, body.resume as never, replan as never));
        if (revealed.length > 0) {
          keep = true;
          page.detach();
          return Response.json({ revealed, ms: Date.now() - started });
        }
        const shot = await page.screenshot();
        let binary = "";
        for (let index = 0; index < shot.length; index += 0x8000) binary += String.fromCharCode(...shot.subarray(index, index + 0x8000));
        return Response.json({ filled, screenshot: btoa(binary), ms: Date.now() - started });
      } catch (error) {
        return Response.json({ error: String(error), ms: Date.now() - started });
      } finally {
        if (!keep) await page.close();
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
