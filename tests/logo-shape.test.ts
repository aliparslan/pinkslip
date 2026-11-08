import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { logoFills } from "@worker/logo-shape";

const SIZE = 128;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set([...type].map((char) => char.charCodeAt(0)), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** An RGBA PNG whose alpha is `opaque(x, y)`. */
function png(opaque: (x: number, y: number) => boolean): Uint8Array {
  const raw = new Uint8Array(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const at = y * (SIZE * 4 + 1) + 1 + x * 4;
      raw.set([20, 20, 24, opaque(x, y) ? 255 : 0], at);
    }
  }
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, SIZE);
  new DataView(header.buffer).setUint32(4, SIZE);
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((offset, part) => (out.set(part, offset), offset + part.length), 0);
  return out;
}

describe("logo shape", () => {
  test("a full square fills its tile", async () => {
    expect(await logoFills(png(() => true))).toBe(true);
  });

  test("a square app icon with rounded corners fills too", async () => {
    const r = SIZE * 0.22;
    expect(await logoFills(png((x, y) => {
      const cx = Math.min(Math.max(x, r), SIZE - 1 - r);
      const cy = Math.min(Math.max(y, r), SIZE - 1 - r);
      return Math.hypot(x - cx, y - cy) <= r;
    }))).toBe(true);
  });

  test("a circle and a mark on a clear background stay inset", async () => {
    expect(await logoFills(png((x, y) => Math.hypot(x - 63.5, y - 63.5) <= 64))).toBe(false);
    expect(await logoFills(png((x, y) => x > 30 && x < 98 && y > 30 && y < 98))).toBe(false);
  });

  test("a JPEG is a full square", async () => {
    expect(await logoFills(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
  });

  test("anything it can't read stays inset", async () => {
    expect(await logoFills(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});
