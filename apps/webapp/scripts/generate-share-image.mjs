// Writes public/og-image.png, the 1200×630 link preview for public pages
// that aren't a job: black, as each job's card is (owner, 2026-11-08), with
// the mark from the app icon (public/brand/mark.svg) and one line in the
// display face. No wordmark; the preview's own title and domain sit under it.
// Run `bun run share-image` from apps/webapp after changing the mark or the
// copy.
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const field = "#131316"; // --color-ink, the job card's field
// Inlined: a page set from a string can't load file:// fonts.
const font = async (name) => `data:font/woff2;base64,${(await readFile(new URL(`../../../packages/tokens/fonts/${name}`, import.meta.url))).toString("base64")}`;
const display = await font("founders-grotesk-semibold.woff2");
const mark = `data:image/svg+xml;base64,${(await readFile(new URL("../public/brand/mark.svg", import.meta.url))).toString("base64")}`;

const html = `<!doctype html><html><head><style>
  @font-face { font-family: Display; src: url("${display}") format("woff2"); font-weight: 600; }
  html, body { margin: 0; }
  main {
    box-sizing: border-box; width: 1200px; height: 630px; padding: 80px 96px 88px;
    display: flex; flex-direction: column; justify-content: space-between;
    background: ${field}; color: #fff;
  }
  img { display: block; width: 144px; height: 144px; margin: -8px 0 0 -12px; }
  h1 { margin: 0; font: 600 84px/1.02 Display, sans-serif; letter-spacing: -0.01em; }
</style></head><body><main>
  <img src="${mark}" alt="">
  <h1>Early-career jobs,<br>straight from the source</h1>
</main></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: fileURLToPath(new URL("../public/og-image.png", import.meta.url)) });
await browser.close();
console.log("Wrote public/og-image.png.");
