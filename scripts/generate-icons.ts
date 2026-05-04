import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "fs";

function makeSvg(size: number): string {
  const pad = size * 0.2;
  const docW = size * 0.42;
  const docH = size * 0.5;
  const cx = size / 2;
  const cy = size / 2;
  const rx = docW * 0.1;
  const lineX = cx - docW * 0.3;
  const lineH = docH * 0.045;
  const lineR = lineH / 2;
  const lineGap = docH * 0.13;
  const lineY1 = cy - docH * 0.2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#1f1219"/>
  <g transform="rotate(-8 ${cx} ${cy})">
    <rect x="${cx - docW / 2}" y="${cy - docH / 2}" width="${docW}" height="${docH}" rx="${rx}" fill="#d4507a"/>
    <rect x="${lineX}" y="${lineY1}" width="${docW * 0.6}" height="${lineH}" rx="${lineR}" fill="#1f1219" opacity="0.4"/>
    <rect x="${lineX}" y="${lineY1 + lineGap}" width="${docW * 0.42}" height="${lineH}" rx="${lineR}" fill="#1f1219" opacity="0.4"/>
    <rect x="${lineX}" y="${lineY1 + lineGap * 2}" width="${docW * 0.52}" height="${lineH}" rx="${lineR}" fill="#1f1219" opacity="0.4"/>
  </g>
</svg>`;
}

for (const size of [192, 512]) {
  const svg = makeSvg(size);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  const png = resvg.render().asPng();
  writeFileSync(`frontend/public/icons/icon-${size}.png`, png);
  console.log(`Generated icon-${size}.png`);
}
