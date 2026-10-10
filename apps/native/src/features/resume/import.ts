import { ApiError, type ApiClient, type ResumeImportErrorCode } from "@pinkslip/core/api";
import { importMessages } from "@pinkslip/core/resume-import-apply";
import type { ResumeImportAssessment } from "@pinkslip/domain/resume-import";
import type { ResumeProfile } from "@pinkslip/domain/resume-profile";
import * as Crypto from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { parseResumeFile, pickPdf } from "../../platform/resume-file";
import { parseWithOcr, ResumeImportFailure } from "./import-policy";
import type { OcrPage } from "./ResumeOcrProvider";
import { currentSessionToken } from "../../platform/session";
export { ResumeImportFailure } from "./import-policy";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export interface ImportedResume {
  profile: Partial<ResumeProfile>; warnings: string[]; assessment: ResumeImportAssessment | null;
  sourceFile: { uri: string; name: string };
  isCurrent(): boolean;
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
 * (text PDFs). Missing text falls back to bounded local page rendering and
 * the existing OCR endpoint. The caller retains the PDF for applications
 * after the person accepts the import.
 */
export async function pickAndImportResume(api: ApiClient, render: (uri: string) => Promise<OcrPage[]>, isActive = () => true): Promise<ImportedResume | null> {
  const token = currentSessionToken();
  const current = () => isActive() && token === currentSessionToken();
  const picked = await pickPdf();
  if (!picked || !current()) return null;
  try {
    if (picked.size > MAX_RESUME_BYTES) throw new ResumeImportFailure("file_too_large");
    if (!(await looksLikePdf(picked.uri))) throw new ResumeImportFailure("invalid_pdf");
    if (!current()) return null;
    const result = await parseWithOcr(() => parseResumeFile(api, picked.uri), async () => {
      const pages = await render(picked.uri);
      if (!current()) throw new Error("Session changed");
      const files: File[] = [];
      try {
        for (const page of pages) {
          const file = new File(Paths.cache, `resume-ocr-${Crypto.randomUUID()}.jpg`);
          files.push(file);
          file.write(Uint8Array.from(atob(page.base64), (character) => character.charCodeAt(0)));
        }
        return await api.resumeImport.ocr(files);
      } finally {
        for (const file of files) if (file.exists) file.delete();
      }
    });
    if (!current()) return null;
    return { profile: result.profile, warnings: result.warnings ?? [], assessment: result.assessment ?? null,
      sourceFile: { uri: picked.uri, name: picked.name }, isCurrent: current };
  } catch (failure) {
    if (!current()) return null;
    if (failure instanceof ResumeImportFailure) throw failure;
    const code = failure instanceof ApiError && failure.code === "network_unavailable" ? "offline"
      : failure instanceof ApiError && failure.code === "request_timeout" ? "conversion_unavailable"
      : failure instanceof ApiError && failure.code && failure.code in importMessages ? failure.code as ResumeImportErrorCode
      : failure instanceof ApiError ? "unknown" : "offline";
    throw new ResumeImportFailure(code);
  }
}
