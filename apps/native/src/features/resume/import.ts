import { ApiError, type ApiClient, type ResumeImportErrorCode } from "@pinkslip/core/api";
import { importMessages } from "@pinkslip/core/resume-import-apply";
import { hasResumeContent } from "@pinkslip/core/resume-fields";
import type { ResumeImportAssessment } from "@pinkslip/domain/resume-import";
import type { ResumeProfile } from "@pinkslip/domain/resume-profile";
import { File } from "expo-file-system";
import { keepResumeFile, parseResumeFile, pickPdf } from "../../platform/resume-file";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export interface ImportedResume { profile: Partial<ResumeProfile>; warnings: string[]; assessment: ResumeImportAssessment | null }

export class ResumeImportFailure extends Error {
  constructor(readonly code: ResumeImportErrorCode) { super(importMessages[code]); }
}

/** A real PDF starts with "%PDF-". */
async function looksLikePdf(uri: string): Promise<boolean> {
  try {
    const head = (await new File(uri).bytes()).slice(0, 5);
    return String.fromCharCode(...head) === "%PDF-";
  } catch {
    return true;
  }
}

/**
 * The iOS import (D10): pick a PDF, check it, and parse it on the server
 * (text PDFs). The PDF is kept on this iPhone for applications. Scanned
 * PDFs come back as `no_extractable_text` for now. Null when cancelled.
 */
export async function pickAndImportResume(api: ApiClient): Promise<ImportedResume | null> {
  const picked = await pickPdf();
  if (!picked) return null;
  try {
    if (picked.size > MAX_RESUME_BYTES) throw new ResumeImportFailure("file_too_large");
    if (!(await looksLikePdf(picked.uri))) throw new ResumeImportFailure("invalid_pdf");
    const result = await parseResumeFile(api, picked.uri);
    if (!hasResumeContent(result.profile)) throw new ResumeImportFailure("no_extractable_text");
    await keepResumeFile(picked).catch(() => undefined);
    return { profile: result.profile, warnings: result.warnings ?? [], assessment: result.assessment ?? null };
  } catch (failure) {
    if (failure instanceof ResumeImportFailure) throw failure;
    const code = failure instanceof ApiError && failure.code && failure.code in importMessages ? failure.code as ResumeImportErrorCode
      : failure instanceof ApiError ? "unknown" : "offline";
    throw new ResumeImportFailure(code);
  }
}
