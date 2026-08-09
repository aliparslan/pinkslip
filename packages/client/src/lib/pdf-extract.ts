export type PdfLink = { url: string };

function textItemValue(item: unknown): { str: string; x: number; y: number; width: number } | null {
  if (!item || typeof item !== "object" || !("str" in item)) return null;
  const candidate = item as { str?: unknown; transform?: unknown; width?: unknown };
  if (typeof candidate.str !== "string" || !candidate.str.trim()) return null;
  const transform = Array.isArray(candidate.transform) ? candidate.transform : [];
  return {
    str: candidate.str,
    x: typeof transform[4] === "number" ? transform[4] : 0,
    y: typeof transform[5] === "number" ? transform[5] : 0,
    width: typeof candidate.width === "number" ? candidate.width : 0,
  };
}

/** Browser-only PDF.js extraction used as the offline import fallback. */
export async function extractPdfText(file: File): Promise<{ text: string; links: PdfLink[] }> {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const allText: string[] = [];
  const allLinks: PdfLink[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const annotations = await page.getAnnotations();
      const rows: Array<{ y: number; items: Array<{ str: string; x: number; width: number }> }> = [];

      for (const rawItem of content.items) {
        const item = textItemValue(rawItem);
        if (!item) continue;
        let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
        if (!row) {
          row = { y: item.y, items: [] };
          rows.push(row);
        }
        row.items.push({ str: item.str, x: item.x, width: item.width });
      }

      rows.sort((a, b) => b.y - a.y);
      const lines = rows.map((row) => {
        const items = row.items.sort((a, b) => a.x - b.x);
        let line = "";
        let previousEnd: number | null = null;
        for (const item of items) {
          const value = item.str.trim();
          if (!value) continue;
          const gap = previousEnd === null ? 0 : item.x - previousEnd;
          if (line) line += gap > 18 ? " | " : " ";
          line += value;
          previousEnd = item.x + item.width;
        }
        return line.replace(/\s+/g, " ").trim();
      }).filter(Boolean);
      allText.push(lines.join("\n"));

      for (const annotation of annotations) {
        if (annotation.subtype === "Link" && annotation.url) {
          allLinks.push({ url: annotation.url });
        }
      }
    }
  } finally {
    await pdf.destroy();
  }

  return { text: allText.join("\n\n"), links: allLinks };
}
