export { applyImport, importMessages, importSummary } from "@pinkslip/core/resume-import-apply";
import { ApiError, type ApiClient, type ResumeImportErrorCode } from "@pinkslip/core/api";
import { hasResumeContent } from "@pinkslip/core/resume-fields";
import type { ResumeImportAssessment } from "@pinkslip/domain/resume-import";
import { importMessages } from "@pinkslip/core/resume-import-apply";
import type { ResumeProfile } from "@pinkslip/domain/resume-profile";

export interface ImportedResume {
  profile: Partial<ResumeProfile>;
  warnings: string[];
  assessment: ResumeImportAssessment | null;
}

export class ResumeImportFailure extends Error {
  constructor(readonly code: ResumeImportErrorCode) {
    super(importMessages[code]);
  }
}

function localCode(error: unknown): ResumeImportErrorCode {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (/password|encrypted|protected/.test(message)) return "protected_pdf";
  if (/invalid pdf|formaterror|missing pdf|corrupt/.test(message)) return "invalid_pdf";
  if (/no resume details|no readable|no text/.test(message)) return "no_extractable_text";
  return navigator.onLine ? "conversion_unavailable" : "offline";
}

/** `ResumeProfile.svelte`'s import: check the file, read it in the browser
 * with PDF.js first (private and fast), ask the server only when that read is
 * weak, and fall back to OCR of rendered pages for scans. PDF.js loads only
 * when someone imports. */
export async function importResume(api: ApiClient, file: File): Promise<ImportedResume> {
  try {
    const [pdf, { importResumeAdaptively }] = await Promise.all([import("./pdf-import"), import("./orchestrator")]);
    await pdf.validateResumePdf(file);
    const result = await importResumeAdaptively({
      parseLocal: () => pdf.parsePdfToProfile(file),
      serverAvailable: navigator.onLine,
      parseServer: () => api.resumeImport.parse(file),
      parseOcr: async () => {
        const { renderPdfPagesForOcr } = await import("./pdf-extract");
        const pages = await renderPdfPagesForOcr(file);
        if (pages.length === 0) throw new Error("No PDF pages were available for scanning.");
        return api.resumeImport.ocr(pages);
      },
    });
    if (!hasResumeContent(result.profile)) throw new ResumeImportFailure("no_extractable_text");
    return { profile: result.profile, warnings: result.warnings, assessment: result.assessment ?? null };
  } catch (failure) {
    if (failure instanceof ResumeImportFailure) throw failure;
    const code = failure instanceof ApiError && failure.code ? failure.code as ResumeImportErrorCode
      : failure && typeof failure === "object" && "code" in failure && typeof failure.code === "string" ? failure.code as ResumeImportErrorCode
        : localCode(failure);
    throw new ResumeImportFailure(code in importMessages ? code : "unknown");
  }
}
