// OKLCH → sRGB for React Native, whose color parser stops at hex, rgb() and
// hsl(). Matrices are Björn Ottosson's reference OKLab → linear-sRGB pair.
//
// Reviewed from the earlier `port-1.2-tokens` attempt on 2026-10-09 and kept
// with its gamut policy: every Pinkslip token sits inside sRGB, so conversion
// refuses out-of-gamut values instead of gamut-mapping them. Web and native
// then show the same color on an sRGB screen.

export type Oklch = { l: number; c: number; h: number; alpha: number };
type Rgb = [number, number, number];

const OKLCH_PATTERN = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/;

export function parseOklch(value: string): Oklch {
  const match = OKLCH_PATTERN.exec(value.trim());
  if (!match) throw new Error(`Not a plain oklch() color: ${value}`);
  const [, l, c, h, alpha] = match;
  return { l: Number(l), c: Number(c), h: Number(h), alpha: alpha === undefined ? 1 : Number(alpha) };
}

/** Unclamped gamma-encoded sRGB; a channel outside [0, 1] means out of gamut. */
export function oklchToSrgb({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear: Rgb = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return linear.map((x) => Math.sign(x) * (Math.abs(x) <= 0.0031308
    ? 12.92 * Math.abs(x)
    : 1.055 * Math.abs(x) ** (1 / 2.4) - 0.055)) as Rgb;
}

// Absorbs float and matrix-precision noise; far below one 8-bit step (1/255).
const GAMUT_TOLERANCE = 1e-4;
const channel = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255);
const hex = (x: number) => channel(x).toString(16).padStart(2, "0");

/**
 * `#rrggbb` when opaque, `rgba(r, g, b, a)` when translucent. Throws when a
 * value falls outside sRGB so a token cannot silently differ between web and
 * native.
 */
export function oklchToNative(value: string): string {
  const color = parseOklch(value);
  const rgb = oklchToSrgb(color);
  if (rgb.some((x) => x < -GAMUT_TOLERANCE || x > 1 + GAMUT_TOLERANCE)) {
    throw new Error(`${value} is outside sRGB; lower its chroma until it fits`);
  }
  if (color.alpha === 1) return `#${rgb.map(hex).join("")}`;
  return `rgba(${rgb.map(channel).join(", ")}, ${color.alpha})`;
}
