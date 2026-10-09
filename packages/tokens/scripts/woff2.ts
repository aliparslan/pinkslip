/**
 * Minimal WOFF2 cmap reader for the font coverage check.
 *
 * Only the `cmap` table is needed, and WOFF2 never transforms it, so the
 * directory walk just needs stored lengths and one Brotli decompression. This
 * avoids a font-library dependency for a single test.
 */
import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";

const KNOWN_TABLE_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca",
  "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea",
  "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL",
  "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
  "Gloc", "Feat", "Sill",
];

function readBase128(view: DataView, cursor: { offset: number }): number {
  let result = 0;
  for (let index = 0; index < 5; index++) {
    const byte = view.getUint8(cursor.offset++);
    result = (result << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return result >>> 0;
  }
  throw new Error("Invalid UIntBase128 value in the WOFF2 directory");
}

interface TableEntry {
  tag: string;
  storedLength: number;
}

function readTableDirectory(view: DataView, bytes: Uint8Array, numTables: number): { tables: TableEntry[]; dataOffset: number } {
  const cursor = { offset: 48 };
  const tables: TableEntry[] = [];
  for (let index = 0; index < numTables; index++) {
    const flags = view.getUint8(cursor.offset++);
    const tagIndex = flags & 0x3f;
    const transform = flags >> 6;
    let tag: string;
    if (tagIndex === 0x3f) {
      tag = String.fromCharCode(...bytes.subarray(cursor.offset, cursor.offset + 4));
      cursor.offset += 4;
    } else {
      tag = KNOWN_TABLE_TAGS[tagIndex] ?? "";
    }
    const originalLength = readBase128(view, cursor);
    const transformed = (tag === "glyf" || tag === "loca") && transform !== 3;
    const storedLength = transformed ? readBase128(view, cursor) : originalLength;
    tables.push({ tag, storedLength });
  }
  return { tables, dataOffset: cursor.offset };
}

function readCmap(view: DataView, offset: number): Set<number> {
  const codepoints = new Set<number>();
  const numSubtables = view.getUint16(offset + 2);
  for (let index = 0; index < numSubtables; index++) {
    const subtable = offset + view.getUint32(offset + 4 + index * 8 + 4);
    const format = view.getUint16(subtable);
    if (format === 4) {
      const segCount = view.getUint16(subtable + 6) / 2;
      const endBase = subtable + 14;
      const startBase = endBase + segCount * 2 + 2;
      const deltaBase = startBase + segCount * 2;
      const rangeBase = deltaBase + segCount * 2;
      for (let segment = 0; segment < segCount; segment++) {
        const end = view.getUint16(endBase + segment * 2);
        const start = view.getUint16(startBase + segment * 2);
        const delta = view.getInt16(deltaBase + segment * 2);
        const range = view.getUint16(rangeBase + segment * 2);
        for (let codepoint = start; codepoint <= end && codepoint !== 0xffff; codepoint++) {
          let glyph = range === 0 ? (codepoint + delta) & 0xffff : 0;
          if (range !== 0) {
            const at = rangeBase + segment * 2 + range + (codepoint - start) * 2;
            if (at + 2 <= view.byteLength) {
              glyph = view.getUint16(at);
              if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
            }
          }
          if (glyph !== 0) codepoints.add(codepoint);
        }
      }
    } else if (format === 12) {
      const groups = view.getUint32(subtable + 12);
      for (let group = 0; group < groups; group++) {
        const record = subtable + 16 + group * 12;
        const start = view.getUint32(record);
        const end = view.getUint32(record + 4);
        if (view.getUint32(record + 8) === 0) continue;
        for (let codepoint = start; codepoint <= end; codepoint++) codepoints.add(codepoint);
      }
    }
  }
  return codepoints;
}

/** Every code point with a non-zero glyph in the font's cmap. */
export function fontCodepoints(path: string): Set<number> {
  const buffer = readFileSync(path);
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0) !== 0x774f4632) throw new Error(`${path} is not a WOFF2 file`);
  const numTables = view.getUint16(12);
  const totalCompressedSize = view.getUint32(20);
  const { tables, dataOffset } = readTableDirectory(view, bytes, numTables);
  const compressed = bytes.subarray(dataOffset, dataOffset + totalCompressedSize);
  const font = brotliDecompressSync(compressed);
  const fontView = new DataView(font.buffer, font.byteOffset, font.byteLength);
  let offset = 0;
  for (const table of tables) {
    if (table.tag === "cmap") return readCmap(fontView, offset);
    offset += table.storedLength;
  }
  throw new Error(`${path} has no cmap table`);
}
