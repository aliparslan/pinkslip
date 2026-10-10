// Writes public/og-image.png, the 1200×630 link preview for every public
// page: the pink tile with the mark and one line in the display face. No
// wordmark; the preview's own title and domain sit under it. Run
// `bun run share-image` from apps/webapp after changing the mark or the copy.
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const pink = "#ff8cc5"; // --color-accent-fill
const ink = "#110c0e"; // --color-accent-ink
// Inlined: a page set from a string can't load file:// fonts.
const font = async (name) => `data:font/woff2;base64,${(await readFile(new URL(`../../../packages/tokens/fonts/${name}`, import.meta.url))).toString("base64")}`;
const display = await font("founders-grotesk-semibold.woff2");

// The mark from scripts/generate-icons.mjs (src/features/shell/BrandMark.tsx).
const mark = `<svg viewBox="0 0 32 32" width="176" height="176" style="flex-shrink: 0; margin: -34px 0 0 -36px" aria-hidden="true">
  <mask id="gap"><rect width="32" height="32" fill="#fff"/><rect x="8" y="8.5" width="13" height="18.5" rx="2.4" fill="#000" stroke="#000" stroke-width="3" transform="rotate(-5 14.5 17.75)"/></mask>
  <g mask="url(#gap)"><rect x="11" y="4.5" width="13" height="18.5" rx="2.4" fill="${ink}" opacity="0.5" transform="rotate(9 17.5 13.75)"/></g>
  <rect x="8" y="8.5" width="13" height="18.5" rx="2.4" fill="${ink}" transform="rotate(-5 14.5 17.75)"/>
</svg>`;

const html = `<!doctype html><html><head><style>
  @font-face { font-family: Display; src: url("${display}") format("woff2"); font-weight: 600; }
  html, body { margin: 0; }
  main {
    box-sizing: border-box; width: 1200px; height: 630px; padding: 88px 96px;
    display: flex; flex-direction: column; justify-content: space-between;
    background: ${pink}; color: ${ink};
  }
  h1 { margin: 0; font: 600 96px/1 Display, sans-serif; letter-spacing: -0.01em; }
</style></head><body><main>
  ${mark}
  <h1>Early-career jobs,<br>straight from the source</h1>
</main></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: fileURLToPath(new URL("../public/og-image.png", import.meta.url)) });
await browser.close();
console.log("Wrote public/og-image.png.");
