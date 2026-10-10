import { ApiError, type ApiClient, type ResumeImportErrorCode } from "@pinkslip/core/api";
import { hasResumeContent } from "@pinkslip/core/resume-fields";
import type { ResumeImportAssessment } from "@pinkslip/domain/resume-import";
import type { ResumeProfile } from "@pinkslip/domain/resume-profile";

export interface ImportedResume {
  profile: Partial<ResumeProfile>;
  warnings: string[];
  assessment: ResumeImportAssessment | null;
}

export const importMessages: Record<ResumeImportErrorCode, string> = {
  authentication_required: "Sign in to import a resume.",
  file_too_large: "Choose a PDF smaller than 5 MB.",
  unsupported_type: "Choose a PDF resume.",
  invalid_pdf: "This file isn’t a valid PDF. Choose another file.",
  protected_pdf: "Remove the PDF’s password, then try again.",
  no_extractable_text: "No readable text was found. Try a text-based PDF.",
  offline: "You’re offline. Reconnect and try again.",
  conversion_unavailable: "Resume import is temporarily unavailable. Try again.",
  import_rate_limited: "You’ve imported several resumes recently. Try again in an hour.",
  unknown: "The resume couldn’t be imported. Try again.",
};

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

/** Merges an import into the resume: imported sections replace yours, and
 * contact fields fill in only where the import found a value. */
export function applyImport(current: ResumeProfile, imported: Partial<ResumeProfile>, normalize: (value: unknown) => ResumeProfile): ResumeProfile {
  const next = structuredClone(current);
  if (imported.contact) {
    for (const key of ["name", "email", "phone", "location", "linkedin", "github", "website"] as const) {
      const value = imported.contact[key]?.trim();
      if (value) next.contact[key] = value;
    }
  }
  if (imported.experience?.length) next.experience = imported.experience;
  if (imported.education?.length) next.education = normalize({ ...next, education: imported.education }).education;
  if (imported.projects?.length) next.projects = imported.projects;
  if (imported.skills?.length) next.skills = imported.skills;
  if (imported.optionalSections?.length) next.optionalSections = imported.optionalSections;
  return next;
}

export function importSummary(imported: Partial<ResumeProfile>): string {
  const parts = [
    [imported.experience?.length ?? 0, "role", "roles"],
    [imported.projects?.length ?? 0, "project", "projects"],
    [imported.education?.length ?? 0, "school", "schools"],
    [imported.skills?.length ?? 0, "skill group", "skill groups"],
    [imported.optionalSections?.length ?? 0, "other section", "other sections"],
  ] as const;
  return parts.filter(([count]) => count > 0).map(([count, one, many]) => `${count} ${count === 1 ? one : many}`).join(" · ");
}
