import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { boundedOcrRenderScale, ocrPageNumbers, OCR_JPEG_QUALITY } from "@pinkslip/core/resume-ocr";

/** PDF.js's in-process worker keeps rendering fully local in WKWebView;
 * no CDN, separate worker URL, credentials, or API access. */
const local = globalThis as typeof globalThis & {
  pdfjsWorker: { WorkerMessageHandler: unknown };
  ReactNativeWebView?: { postMessage(message: string): void };
  pinkslipRenderPdf?: (base64: string, id: string) => Promise<void>;
};
local.pdfjsWorker = { WorkerMessageHandler };
const post = (message: unknown) => local.ReactNativeWebView?.postMessage(JSON.stringify(message));

local.pinkslipRenderPdf = async (base64, id) => {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  const loading = getDocument({ data: bytes, useSystemFonts: true, isOffscreenCanvasSupported: false });
  try {
    const pdf = await loading.promise;
    const pages = ocrPageNumbers(pdf.numPages);
    for (const number of pages) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: boundedOcrRenderScale(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      try {
        await page.render({ canvas, viewport, background: "rgb(255,255,255)" }).promise;
        post({ id, kind: "page", number, width: canvas.width, height: canvas.height,
          base64: canvas.toDataURL("image/jpeg", OCR_JPEG_QUALITY).split(",")[1] });
      } finally { canvas.width = 1; canvas.height = 1; page.cleanup(); }
    }
    post({ id, kind: "done", count: pages.length });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    post({ id, kind: "error", code: name === "PasswordException" ? "protected_pdf" : name === "InvalidPDFException" ? "invalid_pdf" : "unknown" });
  } finally { await loading.destroy(); }
};
post({ kind: "ready" });
