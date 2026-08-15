import type { ResumeProfile } from "../../../../shared/resume-profile";
import type {
  ResumeImportAssessment,
  ResumeImportConfidenceLevel,
  ResumeImportFieldConfidence,
  ResumeImportFieldKind,
} from "../../../../shared/resume-import";

function textScore(value: string | undefined, weight: number): number {
  return value?.trim() ? weight : 0;
}

const MIN_CONFIDENT_LOCAL_SCORE = 24;

export interface ResumeImportQualityAssessment {
  score: number;
  materiallyWeak: boolean;
  reasons: Array<
    | "missing_identity"
    | "missing_structure"
    | "incomplete_experience"
    | "incomplete_education"
    | "incomplete_project"
    | "suspicious_fused_fields"
    | "low_quality_score"
  >;
}

function hasSuspiciousFusedField(profile: Partial<ResumeProfile>): boolean {
  return (profile.experience ?? []).some((entry) => (
    /,[A-Z]{2}[A-Z]/.test(entry.company)
    || /,[A-Z]{2}[A-Z]/.test(entry.title)
    || /\b(?:university|college).*(?:bachelor|master|doctor|associate)/i.test(entry.title)
  )) || (profile.education ?? []).some((entry) => (
    /,[A-Z]{2}[A-Z]/.test(entry.institution)
    || entry.credentials.some((credential) => credential.fieldsOfStudy.some((field) => (
      /\b(?:university|college|institute)\b.*\b(?:bachelor|master|doctor|associate)/i.test(field)
    )))
  ));
}

/** Prefer the extraction that retained actual resume structure, not merely more text. */
export function resumeImportQualityScore(profile: Partial<ResumeProfile>): number {
  let score = 0;
  score += textScore(profile.contact?.name, 8);
  score += textScore(profile.contact?.email, 5);
  score += textScore(profile.contact?.phone, 2);
  score += textScore(profile.contact?.location, 2);
  score += textScore(profile.contact?.linkedin, 2);
  score += textScore(profile.contact?.github, 2);
  score += textScore(profile.contact?.website, 1);

  for (const entry of profile.experience ?? []) {
    score += 4;
    score += textScore(entry.company, 6);
    score += textScore(entry.title, 6);
    score += textScore(entry.location, 2);
    score += textScore(entry.startDate, 1);
    score += textScore(entry.endDate, 1);
    score += Math.min(8, entry.bullets.filter((bullet) => bullet.trim()).length * 2);
    if (!entry.company || !entry.title) score -= 8;
    if (/,[A-Z]{2}[A-Z]|\b(?:university|college).*(?:bachelor|master)/i.test(entry.title)) score -= 10;
  }

  for (const entry of profile.education ?? []) {
    score += 4;
    score += textScore(entry.institution, 8);
    score += textScore(entry.location, 2);
    score += entry.credentials.length * 4;
    score += entry.credentials.reduce(
      (sum, credential) => sum + credential.fieldsOfStudy.filter((field) => field.trim()).length * 2,
      0,
    );
    if (!entry.institution) score -= 12;
  }

  for (const entry of profile.projects ?? []) {
    score += textScore(entry.name, 3);
    score += textScore(entry.role, 1);
    score += textScore(entry.teamInfo, 1);
    score += Math.min(4, entry.bullets.filter((bullet) => bullet.trim()).length);
  }
  score += (profile.skills ?? []).filter((row) => row.items.trim()).length * 2;
  score += (profile.optionalSections ?? []).length * 2;
  return score;
}

export function chooseBestResumeImport(
  server: Partial<ResumeProfile>,
  local: Partial<ResumeProfile>,
): "server" | "local" {
  return resumeImportQualityScore(local) >= resumeImportQualityScore(server) ? "local" : "server";
}

/**
 * Decide whether the local PDF.js result is trustworthy enough to avoid a
 * network conversion. Missing optional sections are not a failure: the local
 * result is weak only when its identity, row boundaries, or core fields are
 * incomplete enough that a second extractor can materially improve it.
 */
export function assessResumeImportQuality(
  profile: Partial<ResumeProfile>,
): ResumeImportQualityAssessment {
  const reasons: ResumeImportQualityAssessment["reasons"] = [];
  const contact = profile.contact;
  const hasIdentity = Boolean(
    contact?.name?.trim()
    && (contact.email?.trim() || contact.phone?.trim() || contact.linkedin?.trim()),
  );
  const hasStructure = (
    (profile.experience?.length ?? 0)
    + (profile.education?.length ?? 0)
    + (profile.projects?.length ?? 0)
    + (profile.skills?.length ?? 0)
    + (profile.optionalSections?.length ?? 0)
  ) > 0;
  const incompleteExperience = (profile.experience ?? []).some(
    (entry) => !entry.company.trim() || !entry.title.trim(),
  );
  const incompleteEducation = (profile.education ?? []).some((entry) => (
    !entry.institution.trim()
    || entry.credentials.length === 0
    || entry.credentials.some((credential) => credential.fieldsOfStudy.length === 0)
  ));
  const incompleteProject = (profile.projects ?? []).some((entry) => !entry.name.trim());
  const score = resumeImportQualityScore(profile);

  if (!hasIdentity) reasons.push("missing_identity");
  if (!hasStructure) reasons.push("missing_structure");
  if (incompleteExperience) reasons.push("incomplete_experience");
  if (incompleteEducation) reasons.push("incomplete_education");
  if (incompleteProject) reasons.push("incomplete_project");
  if (hasSuspiciousFusedField(profile)) reasons.push("suspicious_fused_fields");
  if (score < MIN_CONFIDENT_LOCAL_SCORE) reasons.push("low_quality_score");

  return { score, materiallyWeak: reasons.length > 0, reasons };
}

export function shouldRequestServerResumeImport(profile: Partial<ResumeProfile>): boolean {
  return assessResumeImportQuality(profile).materiallyWeak;
}

export function resumeImportWarnings(profile: Partial<ResumeProfile>): string[] {
  return [
    !profile.contact?.name ? "We couldn’t identify a name." : "",
    !profile.contact?.email ? "We couldn’t identify an email address." : "",
    (profile.experience?.length ?? 0) === 0 ? "We couldn’t identify an experience section." : "",
    (profile.education?.length ?? 0) === 0 ? "We couldn’t identify an education section." : "",
  ].filter(Boolean);
}

const FUSED_FIELD = /,[A-Z]{2}[A-Z]|\b(?:university|college|institute)\b.*\b(?:bachelor|master|doctor|associate)\b/i;
const DATE_VALUE = /^(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|spring|summer|fall|autumn|winter)\.?\s+)?(?:19|20)\d{2}$|^(?:present|current)$/i;
const LOCATION_VALUE = /(?:,\s*[A-Z]{2}\b)|(?:\bremote\b)|(?:\b[A-Za-z .'-]+,\s*[A-Za-z .'-]+\b)/i;

function confidenceForValue(
  value: string | undefined,
  kind: ResumeImportFieldKind,
): Pick<ResumeImportFieldConfidence, "confidence" | "reason"> {
  const clean = value?.trim() ?? "";
  if (!clean) return { confidence: "low", reason: "missing" };
  if (FUSED_FIELD.test(clean) || clean.includes(" | ")) {
    return { confidence: "low", reason: "fused" };
  }
  if (kind === "date" && !DATE_VALUE.test(clean)) {
    return { confidence: "medium", reason: "ambiguous" };
  }
  if (kind === "location" && !LOCATION_VALUE.test(clean)) {
    return { confidence: "medium", reason: "inferred" };
  }
  if ((kind === "organization" || kind === "title" || kind === "credential" || kind === "field_of_study") && clean.length < 3) {
    return { confidence: "medium", reason: "ambiguous" };
  }
  return { confidence: "high", reason: "well_formed" };
}

function field(
  path: string,
  label: string,
  value: string | undefined,
  kind: ResumeImportFieldKind,
  optional = false,
): ResumeImportFieldConfidence | null {
  const clean = value?.trim() ?? "";
  if (optional && !clean) return null;
  return { path, label, value: clean, kind, ...confidenceForValue(clean, kind) };
}

/**
 * Produces field-level review hints without pretending the parser knows more
 * than it does. High confidence means structurally plausible, not verified.
 */
export function assessResumeImportFields(profile: Partial<ResumeProfile>): ResumeImportAssessment {
  const fields: ResumeImportFieldConfidence[] = [];
  const add = (item: ResumeImportFieldConfidence | null) => {
    if (item) fields.push(item);
  };

  add(field("contact.name", "Name", profile.contact?.name, "identity"));
  add(field("contact.email", "Email", profile.contact?.email, "identity", true));
  add(field("contact.phone", "Phone", profile.contact?.phone, "identity", true));

  for (const [index, entry] of (profile.experience ?? []).entries()) {
    const prefix = `experience.${entry.id || index}`;
    add(field(`${prefix}.company`, `Employer for ${entry.title || `role ${index + 1}`}`, entry.company, "organization"));
    add(field(`${prefix}.title`, `Title at ${entry.company || `role ${index + 1}`}`, entry.title, "title"));
    add(field(`${prefix}.location`, `Location for ${entry.company || `role ${index + 1}`}`, entry.location, "location", true));
    add(field(`${prefix}.startDate`, `Start date for ${entry.company || `role ${index + 1}`}`, entry.startDate, "date", true));
    add(field(`${prefix}.endDate`, `End date for ${entry.company || `role ${index + 1}`}`, entry.endDate, "date", true));
  }

  for (const [index, entry] of (profile.education ?? []).entries()) {
    const prefix = `education.${entry.id || index}`;
    add(field(`${prefix}.institution`, `School ${index + 1}`, entry.institution, "organization"));
    add(field(`${prefix}.location`, `Location for ${entry.institution || `school ${index + 1}`}`, entry.location, "location", true));
    add(field(`${prefix}.startDate`, `Start date for ${entry.institution || `school ${index + 1}`}`, entry.startDate, "date", true));
    add(field(`${prefix}.endDate`, `End date for ${entry.institution || `school ${index + 1}`}`, entry.endDate, "date", true));
    if (entry.credentials.length === 0) {
      add(field(`${prefix}.credentials`, `Credential for ${entry.institution || `school ${index + 1}`}`, "", "credential"));
    }
    for (const [credentialIndex, credential] of entry.credentials.entries()) {
      add(field(
        `${prefix}.credentials.${credential.id || credentialIndex}.degreeType`,
        `Degree at ${entry.institution || `school ${index + 1}`}`,
        credential.degreeType,
        "credential",
      ));
      if (credential.fieldsOfStudy.length === 0) {
        add(field(
          `${prefix}.credentials.${credential.id || credentialIndex}.fieldsOfStudy`,
          `Field of study at ${entry.institution || `school ${index + 1}`}`,
          "",
          "field_of_study",
        ));
      } else {
        for (const [fieldIndex, value] of credential.fieldsOfStudy.entries()) {
          add(field(
            `${prefix}.credentials.${credential.id || credentialIndex}.fieldsOfStudy.${fieldIndex}`,
            `Field of study at ${entry.institution || `school ${index + 1}`}`,
            value,
            "field_of_study",
          ));
        }
      }
    }
  }

  for (const [index, entry] of (profile.projects ?? []).entries()) {
    add(field(`projects.${entry.id || index}.name`, `Project ${index + 1}`, entry.name, "title"));
  }

  const reviewPaths = fields
    .filter((item) => item.confidence !== "high")
    .map((item) => item.path);
  const levels: ResumeImportConfidenceLevel[] = fields.map((item) => item.confidence);
  const overall: ResumeImportConfidenceLevel = levels.includes("low")
    ? "low"
    : levels.includes("medium")
      ? "medium"
      : "high";
  return { overall, fields, reviewPaths };
}
