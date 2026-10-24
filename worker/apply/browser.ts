import type { Browser, BrowserWorker, Page } from "@cloudflare/puppeteer";
import { PageNavigated, type FormPage } from "./send-engine";

/** A page that's a wall rather than a form. */
const BLOCKED_TITLES = /just a moment|attention required|access denied|forbidden|are you a robot|verify you are human/i;
/** Long enough to wait for a code Greenhouse emails (Browser Run's most). */
const KEEP_ALIVE_MS = 600_000;

export interface OpenedPage extends FormPage {
  /** The HTTP status the form loaded with. */
  status: number | null;
  blocked: boolean;
  sessionId: string;
  /** Ends the browser. */
  close(): Promise<void>;
  /** Lets go but keeps the browser, to come back with the session id. */
  detach(): void;
}

function wrap(browser: Browser, page: Page, status: number | null, title: string): OpenedPage {
  return {
    status,
    blocked: BLOCKED_TITLES.test(title),
    sessionId: browser.sessionId(),
    run: async (body) => {
      try {
        return String(await page.evaluate(`(async () => { ${body} })()`));
      } catch (error) {
        if (!/execution context was destroyed|cannot find context|context.*(detached|destroyed)/i.test(String(error))) throw error;
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 8_000 }).catch(() => undefined);
        throw new PageNavigated(String(error));
      }
    },
    type: async (selector, text) => {
      await page.click(selector);
      await page.keyboard.type(text, { delay: 70 });
    },
    screenshot: async () => {
      const shot = await page.screenshot({ type: "jpeg", quality: 55, fullPage: true });
      return shot instanceof Uint8Array ? shot : new Uint8Array(shot as ArrayBuffer);
    },
    url: () => page.url(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    close: async () => { await browser.close().catch(() => undefined); },
    detach: () => browser.disconnect(),
  };
}

/** Opens the application form in Cloudflare's headless browser (Browser Run).
 * Puppeteer loads only here, so tests and the rest of the Worker never do. */
export async function openFormPage(binding: Fetcher, url: string): Promise<OpenedPage> {
  const { default: puppeteer } = await import("@cloudflare/puppeteer");
  const browser = await puppeteer.launch(binding as unknown as BrowserWorker, { keep_alive: KEEP_ALIVE_MS });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 45_000 });
    return wrap(browser, page, response?.status() ?? null, await page.title().catch(() => ""));
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}

/** Comes back to a browser kept open while the code was on its way. */
export async function reconnectFormPage(binding: Fetcher, sessionId: string, url: string): Promise<OpenedPage> {
  const { default: puppeteer } = await import("@cloudflare/puppeteer");
  const browser = await puppeteer.connect(binding as unknown as BrowserWorker, sessionId);
  // The session also has the browser's empty first tab.
  const pages = await browser.pages();
  const host = new URL(url).host;
  const page = pages.find((candidate) => { try { return new URL(candidate.url()).host === host; } catch { return false; } })
    ?? pages.find((candidate) => !candidate.url().startsWith("about:"));
  if (!page) {
    await browser.close().catch(() => undefined);
    throw new Error("The form's tab was gone when the code came.");
  }
  return wrap(browser, page, null, await page.title().catch(() => ""));
}
