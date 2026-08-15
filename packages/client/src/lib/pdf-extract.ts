export type PdfLink = { url: string };

export const MAX_OCR_PAGES = 3;
const OCR_RENDER_SCALE = 2.2;
const OCR_MAX_DIMENSION = 1_800;
const OCR_MAX_PIXELS = 2_500_000;
const OCR_JPEG_QUALITY = 0.86;

async function loadPdf(file: File) {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  return getDocument({ data }).promise;
}

export function ocrPageNumbers(totalPages: number): number[] {
  const count = Math.min(MAX_OCR_PAGES, Math.max(0, Math.floor(totalPages)));
  return Array.from({ length: count }, (_, index) => index + 1);
}

export function boundedOcrRenderScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const dimensionScale = OCR_MAX_DIMENSION / Math.max(width, height);
  const pixelScale = Math.sqrt(OCR_MAX_PIXELS / (width * height));
  return Math.min(OCR_RENDER_SCALE, dimensionScale, pixelScale);
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The scanned PDF page could not be prepared."));
    }, "image/jpeg", OCR_JPEG_QUALITY);
  });
}

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
  const pdf = await loadPdf(file);
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

/**
 * Render only the first few pages for transient OCR. Pages are encoded one at
 * a time and bounded by both dimensions and pixel count to avoid large mobile
 * canvas allocations.
 */
export async function renderPdfPagesForOcr(file: File): Promise<Blob[]> {
  const pdf = await loadPdf(file);
  const images: Blob[] = [];

  try {
    for (const pageNumber of ocrPageNumbers(pdf.numPages)) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: boundedOcrRenderScale(baseViewport.width, baseViewport.height),
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      try {
        await page.render({ canvas, viewport, background: "rgb(255,255,255)" }).promise;
        images.push(await canvasToJpeg(canvas));
      } finally {
        canvas.width = 1;
        canvas.height = 1;
        page.cleanup();
      }
    }
  } finally {
    await pdf.destroy();
  }

  return images;
}
