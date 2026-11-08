/**
 * Whether a company's logo is a full square that should fill its tile, or a
 * mark that sits inset on the white tile (owner, 2026-11-08, option B on
 * Paper "Critic fixes · Nov 8": "square ones fill the tile").
 *
 * The favicons are PNGs. A logo fills when it's opaque at the middle of each
 * edge and at a point 12% in from each corner: full squares and app-icon
 * squares with rounded corners pass; circles (clear at 12% in) and marks on a
 * clear background don't. Anything that can't be read is left inset.
 */

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** Opaque enough to count as part of the logo's own background. */
const OPAQUE = 230;

interface Header {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

function readUint32(bytes: Uint8Array, at: number): number {
  return ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** The alpha of every pixel, row by row, or null for a PNG it can't read. */
export async function pngAlpha(bytes: Uint8Array): Promise<{ width: number; height: number; alpha: Uint8Array } | null> {
  if (bytes.length < 33 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) return null;
  let header: Header | null = null;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = readUint32(bytes, at);
    const type = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") header = { width: readUint32(data, 0), height: readUint32(data, 4), bitDepth: data[8]!, colorType: data[9]! };
    else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  // 8-bit RGBA, grey with alpha, RGB, grey and palettes cover favicons.
  if (!header || header.bitDepth !== 8 || header.width === 0 || header.height === 0 || header.width > 1024 || header.height > 1024) return null;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[header.colorType];
  if (!channels || (header.colorType === 3 && !palette)) return null;
  const joined = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  idat.reduce((offset, part) => (joined.set(part, offset), offset + part.length), 0);
  let raw: Uint8Array;
  try {
    raw = await inflate(joined);
  } catch {
    return null;
  }
  const { width, height } = header;
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) return null;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const corner = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels]! : 0;
      const value = line[x]!;
      pixels[y * stride + x] = (filter === 0 ? value
        : filter === 1 ? value + left
        : filter === 2 ? value + up
        : filter === 3 ? value + ((left + up) >> 1)
        : value + paeth(left, up, corner)) & 255;
    }
  }
  const alpha = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index++) {
    if (header.colorType === 6) alpha[index] = pixels[index * 4 + 3]!;
    else if (header.colorType === 4) alpha[index] = pixels[index * 2 + 1]!;
    else if (header.colorType === 3) alpha[index] = transparency?.[pixels[index]!] ?? 255;
    else alpha[index] = 255;
  }
  return { width, height, alpha };
}

/** True when the logo is a full square that fills its tile. */
export async function logoFills(bytes: Uint8Array): Promise<boolean> {
  // A JPEG has no transparency: it's always a full square (Linear's).
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
  const image = await pngAlpha(bytes);
  if (!image) return false;
  const { width, height, alpha } = image;
  const at = (fx: number, fy: number) => alpha[Math.min(height - 1, Math.round(fy * (height - 1))) * width + Math.min(width - 1, Math.round(fx * (width - 1)))]!;
  const points: [number, number][] = [
    [0.5, 0.02], [0.5, 0.98], [0.02, 0.5], [0.98, 0.5],
    [0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88],
  ];
  return points.every(([x, y]) => at(x, y) >= OPAQUE);
}
