// Writes the site's icons. The tab icons are the mark below 40px
// (public/brand/mark-small.svg, the app icon's carbon copy without its ruled
// lines); the notification badge is its silhouette in white. The home-screen
// and install icons are the App Store icon, apps/native/assets/icon.png
// (owner, 2026-10-24: mail apps show the site's touch icon beside its
// emails), which is drawn separately and only read here. Run `bun run icons`
// from apps/webapp after changing either.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

// Browser tabs: the small mark on its own, as in the sidebar. No tile, so it
// sits on any tab-bar colour.
const favicon = await readFile(new URL("../public/brand/mark-small.svg", import.meta.url), "utf8");
// Android tints the badge from its alpha channel: the two slips in white,
// the front one cut out of the back one, and its folded corner cut away.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="16 13 176 176">
  <mask id="front"><rect x="16" y="13" width="176" height="176" fill="#fff"/><g transform="rotate(-6 92 116)"><path d="M50 50H134Q140 50 140 56V164L122 182H50Q44 182 44 176V56Q44 50 50 50Z" fill="#000" stroke="#000" stroke-width="14"/></g></mask>
  <g mask="url(#front)"><g transform="rotate(8 114 88)"><rect x="66" y="22" width="96" height="132" rx="6" fill="#fff"/></g></g>
  <g transform="rotate(-6 92 116)"><path d="M50 50H134Q140 50 140 56V158L116 182H50Q44 182 44 176V56Q44 50 50 50Z" fill="#fff"/></g>
</svg>
`;

// The App Store icon. Apple touch and maskable icons are full-bleed (the OS
// cuts the shape; the slips sit inside the maskable 80% circle); desktop
// install and shortcuts ("any") get the old tile's rounded corners.
const appIcon = `data:image/png;base64,${(await readFile(new URL("../../native/assets/icon.png", import.meta.url))).toString("base64")}`;
const fullBleed = `<img src="${appIcon}">`;
const tile = `<img src="${appIcon}" style="border-radius:21.875%">`;

await writeFile(new URL("../public/favicon.svg", import.meta.url), favicon);
await writeFile(new URL("../public/icons/notification-badge.svg", import.meta.url), badge);

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, source, size] of [
  // Tab icon for browsers without SVG favicons (older Safari): the bare mark.
  ["favicon-96.png", favicon, 96],
  ["icon-192.png", tile, 192],
  ["icon-512.png", tile, 512],
  ["icon-maskable-512.png", fullBleed, 512],
  ["apple-touch-icon-180.png", fullBleed, 180],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg,img{display:block;width:${size}px;height:${size}px}</style>${source}`);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await page.screenshot({ path: new URL(`../public/icons/${file}`, import.meta.url).pathname, omitBackground: true });
}
await browser.close();
console.log("Wrote favicon.svg, notification-badge.svg and five PNG icons.");
