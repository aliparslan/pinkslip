import type { ResumeImportErrorCode } from "./api";
import type { ResumeProfile } from "@pinkslip/domain/resume-profile";

/** Resume import outcomes shared by the web and iOS imports: what each
 * failure tells the person, how an import merges into the resume, and the
 * one-line summary of what it found. */
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
