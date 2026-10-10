// Writes every brand icon from one mark: public/favicon.svg, the PWA and
// Apple touch PNGs, the monochrome notification badge, and the iOS app icon. The geometry
// matches src/features/shell/BrandMark.tsx. Run `bun run icons` from
// apps/webapp after changing the mark.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const pink = "#ff8cc5"; // --color-accent-fill
const ink = "#110c0e"; // --color-accent-ink
const plum = "#1f1219"; // the iOS app icon's background, as the 1.x app had

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
// Desktop install and shortcuts ("any"): the same tile with more air.
const tile = svg(`<rect width="32" height="32" rx="7" fill="${pink}"/>${mark(ink, 0.78)}`);
// Maskable and Apple touch icons are full-bleed: the OS cuts the shape, and
// maskable content must sit inside the central 80% circle.
const maskable = svg(`<rect width="32" height="32" fill="${pink}"/>${mark(ink, 0.6)}`);
const apple = svg(`<rect width="32" height="32" fill="${pink}"/>${mark(ink, 0.72)}`);
// The iOS app icon: the pink mark on dark plum, full-bleed and opaque.
const iosApp = svg(`<rect width="32" height="32" fill="${plum}"/>${mark(pink, 0.72)}`);
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
  ["icon-maskable-512.png", maskable, 512],
  ["apple-touch-icon-180.png", apple, 180],
  // The iOS app icon (apps/native): full-bleed, opaque, 1024px.
  ["../../../native/assets/icon.png", iosApp, 1024],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`);
  await page.screenshot({ path: new URL(`../public/icons/${file}`, import.meta.url).pathname, omitBackground: true });
}
await browser.close();
console.log("Wrote favicon.svg, notification-badge.svg, five PNG icons and the iOS app icon.");
