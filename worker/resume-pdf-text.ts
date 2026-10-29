import { pdfTextLines, type PdfTextItem } from "../packages/core/src/pdf-lines";

/** Resumes are a page or two; more than this isn't one. */
const MAX_PAGES = 10;

export class ProtectedPdfError extends Error {}

/**
 * The PDF's own text, rebuilt line by line, and its link targets, read with
 * PDF.js (unpdf's build runs in Workers). Workers AI's converter keeps only
 * the newlines a PDF writes, and LaTeX writes none, so a LaTeX resume came
 * back as one run of text and fell to the half-minute scan (2026-10-29).
 * Null when PDF.js can't read the file; the converter's text is still there.
 */
export async function readPdfText(bytes: Uint8Array): Promise<{ text: string; links: { url: string }[] } | null> {
  const { getDocumentProxy } = await import("unpdf");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // A copy: PDF.js takes over the buffer it's given.
    pdf = await getDocumentProxy(bytes.slice());
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") throw new ProtectedPdfError();
    return null;
  }
  try {
    const lines: string[] = [];
    const links: { url: string }[] = [];
    for (let number = 1; number <= Math.min(pdf.numPages, MAX_PAGES); number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      lines.push(...pdfTextLines(content.items.flatMap((item): PdfTextItem[] => "str" in item ? [item] : [])));
      for (const annotation of await page.getAnnotations()) {
        if (annotation.subtype === "Link" && typeof annotation.url === "string") links.push({ url: annotation.url });
      }
    }
    return { text: lines.join("\n"), links };
  } catch {
    return null;
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}
