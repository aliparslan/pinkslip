import { api, type ResumeImportResult } from "./api";
import { renderPdfPagesForOcr } from "./pdf-extract";

/** Render scanned pages locally, upload them transiently, and discard the images. */
export async function parseScannedPdfWithOcr(file: File): Promise<ResumeImportResult> {
  const pages = await renderPdfPagesForOcr(file);
  if (pages.length === 0) throw new Error("No PDF pages were available for scanning.");
  return api.resumeImport.ocr(pages);
}
