import { ApiError, type ResumeImportErrorCode, type ResumeImportResult } from "@pinkslip/core/api";
import { hasResumeContent } from "@pinkslip/core/resume-fields";
import { importMessages } from "@pinkslip/core/resume-import-apply";

export class ResumeImportFailure extends Error {
  constructor(readonly code: ResumeImportErrorCode) { super(importMessages[code]); }
}

/** Only missing text triggers OCR. A rejected, protected, or unavailable
 * import must keep its original error rather than starting a second upload. */
export async function parseWithOcr(parse: () => Promise<ResumeImportResult>, ocr: () => Promise<ResumeImportResult>): Promise<ResumeImportResult> {
  try {
    const result = await parse();
    if (hasResumeContent(result.profile)) return result;
  } catch (error) {
    if (!(error instanceof ApiError && error.code === "no_extractable_text")) throw error;
  }
  const result = await ocr();
  if (!hasResumeContent(result.profile)) throw new ResumeImportFailure("no_extractable_text");
  return result;
}
