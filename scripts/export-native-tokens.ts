/* Writes the design tokens the iOS app reads, from the same CSS the web reads.

   theme.css and skin.css stay the one source of truth. React Native can't
   parse OKLCH, so colors are converted to sRGB hex here (rgba when they carry
   alpha), relative colors such as the accent's gradient ends are resolved,
   and sizes come across as plain numbers.

   Run: bun scripts/export-native-tokens.ts  (rewrites apps/mobile/src/theme/tokens.ts) */

import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const themeCss = await Bun.file(resolve(root, "packages/ui/src/styles/theme.css")).text();
const skinCss = await Bun.file(resolve(root, "packages/ui/src/styles/skin.css")).text();
const outPath = resolve(root, "apps/mobile/src/theme/tokens.ts");

type Oklch = { l: number; c: number; h: number; a: number };

/** The declarations inside the first block whose selector matches. */
function block(css: string, selector: RegExp): Map<string, string> {
  const match = selector.exec(css);
  if (!match) throw new Error(`No block for ${selector}`);
  let depth = 0;
  let start = css.indexOf("{", match.index);
  let end = start;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = css.slice(start + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const vars = new Map<string, string>();
  for (const decl of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(decl[1]!, decl[2]!.trim());
  return vars;
}

function parseOklch(value: string, scope: Map<string, string>): Oklch | null {
  const relative = value.match(/^oklch\(from var\((--[\w-]+)\)\s+(.+?)(?:\s*\/\s*([\d.]+))?\)$/);
  if (relative) {
    const base = parseOklch(scope.get(relative[1]!) ?? "", scope);
    if (!base) return null;
    const channels = relative[2]!.match(/calc\([^)]*\)|[lch]\b/g) ?? [];
    const evalChannel = (expr: string, name: "l" | "c" | "h") => {
      const calc = expr.match(/^calc\(([lch])\s*([+*-])\s*([\d.]+)\)$/);
      if (!calc) return base[name];
      const [, , op, num] = calc;
      const n = Number(num);
      return op === "+" ? base[name] + n : op === "-" ? base[name] - n : base[name] * n;
    };
    return {
      l: evalChannel(channels[0] ?? "l", "l"),
      c: evalChannel(channels[1] ?? "c", "c"),
      h: evalChannel(channels[2] ?? "h", "h"),
      a: relative[3] ? Number(relative[3]) : 1,
    };
  }
  const plain = value.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/);
  if (!plain) return null;
  return { l: Number(plain[1]), c: Number(plain[2]), h: Number(plain[3]), a: plain[4] ? Number(plain[4]) : 1 };
}

function toCss({ l, c, h, a }: Oklch): string {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const rgb = linear.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
  if (a < 1) return `rgba(${rgb.join(", ")}, ${a})`;
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const camel = (name: string) => name.replace(/^--(color-)?/, "").replace(/-(\w)/g, (_, ch: string) => ch.toUpperCase());

function palette(colors: Map<string, string>, skin: Map<string, string>): Record<string, string> {
  const scope = new Map([...colors, ...skin]);
  const out: Record<string, string> = {};
  for (const [name, value] of scope) {
    if (!name.startsWith("--color-") && !name.startsWith("--skin-") && !name.startsWith("--edge-") && name !== "--accent-top" && name !== "--accent-bottom" && name !== "--accent-edge-top") continue;
    const color = parseOklch(value, scope);
    if (color) out[camel(name)] = toCss(color);
  }
  return out;
}

const lightColors = block(themeCss, /@theme\s*\{/);
const darkColors = block(themeCss, /:root\[data-theme="dark"\]\s*\{/);
const lightSkin = block(skinCss, /:root\s*\{/);
const darkSkin = new Map([...lightSkin, ...block(skinCss, /:root\[data-theme="dark"\]\s*\{/)]);

const light = palette(lightColors, lightSkin);
const dark = palette(new Map([...lightColors, ...darkColors]), darkSkin);

const rem = (value: string) => Math.round(Number.parseFloat(value) * (value.endsWith("rem") ? 16 : 1) * 100) / 100;
const text: Record<string, { size: number; lineHeight: number }> = {};
for (const [name, value] of lightColors) {
  const step = name.match(/^--text-([a-z]+)$/);
  if (step) text[step[1]!] = { size: rem(value), lineHeight: rem(lightColors.get(`${name}--line-height`) ?? value) };
}
const radius: Record<string, number> = {};
for (const [name, value] of lightColors) {
  const step = name.match(/^--radius-([a-z]+)$/);
  if (step) radius[step[1]!] = rem(value);
}
const rootVars = block(themeCss, /^:root\s*\{/m);
const controlH = rem(rootVars.get("--control-h") ?? "36px");
const durations: Record<string, number> = {};
for (const [name, value] of rootVars) {
  const step = name.match(/^--dur-([a-z-]+)$/);
  const ms = value.match(/([\d.]+)ms/);
  if (step && ms) durations[camel(`--${step[1]}`)] = Number(ms[1]);
}

const lines = [
  "/* Generated by scripts/export-native-tokens.ts from packages/ui/src/styles/theme.css",
  "   and skin.css. Do not edit by hand: change the CSS and run the script. */",
  "",
  `export const light = ${JSON.stringify(light, null, 2)} as const;`,
  "",
  `export const dark: Record<keyof typeof light, string> = ${JSON.stringify(dark, null, 2)};`,
  "",
  `export const text = ${JSON.stringify(text, null, 2)} as const;`,
  "",
  `export const radius = ${JSON.stringify(radius, null, 2)} as const;`,
  "",
  `/** Control heights: small, medium, large. Type size follows height. */`,
  `export const control = { sm: ${controlH - 8}, md: ${controlH}, lg: ${controlH + 8} } as const;`,
  "",
  `/** Durations in milliseconds. */`,
  `export const duration = ${JSON.stringify(durations, null, 2)} as const;`,
  "",
];
await Bun.write(outPath, lines.join("\n"));
console.log(`Wrote ${outPath}: ${Object.keys(light).length} colors per theme`);
