/** A PDF.js text item: its string and where it sits on the page. */
export interface PdfTextItem {
  str: string;
  /** PDF.js's matrix: [a, b, c, d, x, y]. */
  transform: number[];
  width: number;
  height: number;
}

interface Part { str: string; x: number; end: number }

/** A gap this wide between two runs on one row is a column, not a space:
 * a right-aligned date or city, kept on its row after " | ". */
const columnGap = (height: number) => Math.max(18, height * 1.8);

/**
 * Rebuilds a page's lines from its text items. Some PDFs, LaTeX's among them,
 * have no newline characters at all, so a converter that only breaks where it
 * finds one returns the page as one run (2026-10-29). Items keep the PDF's own
 * order, so columns stay apart; a run that starts on a new baseline starts a
 * new line, and runs on the same baseline join left to right.
 */
export function pdfTextLines(items: readonly PdfTextItem[]): string[] {
  const rows: { y: number; height: number; parts: Part[] }[] = [];
  for (const item of items) {
    if (!item.str || !Array.isArray(item.transform)) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    const height = Math.abs(item.height) || Math.abs(item.transform[3] ?? 0);
    const row = rows.at(-1);
    // A space carries no height, so it stays on the row it follows.
    const sameRow = row && (!item.str.trim() || Math.abs(row.y - y) <= Math.max(row.height, height) * 0.5);
    if (sameRow) {
      row.parts.push({ str: item.str, x, end: x + item.width });
      if (item.str.trim()) row.height = Math.max(row.height, height);
    } else if (item.str.trim()) {
      rows.push({ y, height, parts: [{ str: item.str, x, end: x + item.width }] });
    }
  }
  return rows.map(({ height, parts }) => {
    let line = "";
    let end = -Infinity;
    let spaced = false;
    for (const part of [...parts].sort((a, b) => a.x - b.x)) {
      // LaTeX fills the room before a right-aligned date with one wide space:
      // it marks a break but doesn't close the gap.
      if (!part.str.trim()) {
        spaced = true;
        continue;
      }
      const gap = part.x - end;
      if (line) {
        if (gap > columnGap(height)) line = `${line.trimEnd()} | `;
        else if ((spaced || gap > height * 0.15) && !/\s$/.test(line) && !/^\s/.test(part.str)) line += " ";
      }
      line += part.str;
      end = Math.max(end, part.end);
      spaced = false;
    }
    return line.replace(/\s+/g, " ").trim();
  }).filter(Boolean);
}
