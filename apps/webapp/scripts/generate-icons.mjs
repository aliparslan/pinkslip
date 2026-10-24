// Writes the site's icons. The tab icons and the notification badge are the
// bare mark (public/favicon.svg; the geometry matches
// src/features/shell/BrandMark.tsx). The home-screen and install icons are
// the App Store icon, apps/native/assets/icon.png (owner, 2026-10-24: mail
// apps show the site's touch icon beside its emails), which is drawn
// separately and only read here. Run `bun run icons` from apps/webapp after
// changing either.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const pink = "#ff8cc5"; // --color-accent-fill

/** The mark in a 32-unit box, scaled by `scale` around its visual center. */
function mark(color, scale = 1, id = "gap") {
  return `<g transform="translate(16 16) scale(${scale}) translate(-16.2 -15.6)">
    <mask id="${id}"><rect width="32" height="32" fill="#fff"/><rect x="8" y="8.5" width="13" height="18.5" rx="2.4" fill="#000" stroke="#000" stroke-width="3" transform="rotate(-5 14.5 17.75)"/></mask>
    <g mask="url(#${id})"><rect x="11" y="4.5" width="13" height="18.5" rx="2.4" fill="${color}" opacity="0.5" transform="rotate(9 17.5 13.75)"/></g>
    <rect x="8" y="8.5" width="13" height="18.5" rx="2.4" fill="${color}" transform="rotate(-5 14.5 17.75)"/>
  </g>`;
}

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>\n`;

// Browser tabs: the pink mark on its own, as in the sidebar, as large as it
// can be. No tile, so it sits on any tab-bar colour.
const favicon = svg(mark(pink, 1.08));
// The App Store icon. Apple touch and maskable icons are full-bleed (the OS
// cuts the shape; the slips sit inside the maskable 80% circle); desktop
// install and shortcuts ("any") get the old tile's rounded corners.
const appIcon = `data:image/png;base64,${(await readFile(new URL("../../native/assets/icon.png", import.meta.url))).toString("base64")}`;
const fullBleed = `<img src="${appIcon}">`;
const tile = `<img src="${appIcon}" style="border-radius:21.875%">`;
// Android tints the badge from its alpha channel.
const badge = svg(mark("#fff", 0.92));

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
