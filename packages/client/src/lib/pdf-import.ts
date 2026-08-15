import type { ResumeProfile } from "../../../../shared/resume-profile";
import { extractPdfText } from "./pdf-extract";
import { parseResumeText } from "./pdf-to-profile";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const PDF_PICKER_MIME_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/octet-stream",
]);

export type LocalResumeImportErrorCode =
  | "file_too_large"
  | "unsupported_type"
  | "invalid_pdf";

export class LocalResumeImportError extends Error {
  readonly code: LocalResumeImportErrorCode;

  constructor(code: LocalResumeImportErrorCode, message: string) {
    super(message);
    this.name = "LocalResumeImportError";
    this.code = code;
  }
}

/** Keep the local fast path under the same file contract as server conversion. */
export async function validateResumePdf(file: File): Promise<void> {
  if (file.size > MAX_RESUME_BYTES) {
    throw new LocalResumeImportError("file_too_large", "Choose a PDF smaller than 5 MB.");
  }
  const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const isPdf = signature.length === 5
    && signature[0] === 0x25
    && signature[1] === 0x50
    && signature[2] === 0x44
    && signature[3] === 0x46
    && signature[4] === 0x2d;
  if (!isPdf) {
    if (file.type && !PDF_PICKER_MIME_TYPES.has(file.type.toLowerCase())) {
      throw new LocalResumeImportError("unsupported_type", "Choose a PDF resume.");
    }
    throw new LocalResumeImportError("invalid_pdf", "This file is not a valid PDF.");
  }
}

/** Server failures that are safe to recover from without changing the selected file. */
export function shouldUseLocalPdfFallback(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  const failure = error as { code?: unknown; status?: unknown };
  if (typeof failure.code !== "string" && typeof failure.status !== "number") return true;
  return failure.code === "network_unavailable"
    || failure.code === "request_timeout"
    || failure.code === "conversion_unavailable"
    || (typeof failure.status === "number" && failure.status >= 500);
}

/** Browser-only local fallback. The shared parser remains free of PDF.js and DOM imports. */
export async function parsePdfToProfile(file: File): Promise<Partial<ResumeProfile>> {
  const { text, links } = await extractPdfText(file);
  return parseResumeText(text, links);
}
