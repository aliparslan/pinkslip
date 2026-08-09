import {
  normalizeResumeProfile,
  type ResumeProfile,
} from "./resume-profile";

export const RESUME_TEMPLATE_VERSION = "resume-v3";
export const RESUME_COMPILER_VERSION = "typst-web-v2";

export type EvidenceSourceType = "experience" | "project" | "education" | "skills" | "additional";
export type RequirementPriority = "required" | "preferred";

export interface JobSnapshot {
  jobId: string;
  title: string;
  company: string;
  url: string;
  description: string;
  descriptionHash: string;
  capturedAt: string;
}

export interface CandidateEvidence {
  id: string;
  sourceType: EvidenceSourceType;
  sourceEntryId: string;
  label: string;
  text: string;
}

export interface TailoringRequirement {
  id: string;
  text: string;
  priority: RequirementPriority;
  keywords: string[];
}

export interface RequirementMatch {
  requirementId: string;
  evidenceIds: string[];
  reason: string;
}

export interface TailoringGap {
  requirementId: string;
  reason: string;
}

export interface TailoringPlan {
  schemaVersion: 2;
  requirements: TailoringRequirement[];
  matches: RequirementMatch[];
  gaps: TailoringGap[];
  selectedEvidenceIds: string[];
  excludedEvidenceIds: string[];
}

export interface TailoredBullet {
  id: string;
  text: string;
  evidenceIds: string[];
}

export interface TailoredExperience {
  sourceEntryId: string;
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: TailoredBullet[];
}

export interface TailoredProject {
  sourceEntryId: string;
  name: string;
  role?: string;
  teamInfo?: string;
  url: string;
  date?: string;
  bullets: TailoredBullet[];
}

export interface TailoredResume {
  schemaVersion: 2;
  contact: ResumeProfile["contact"];
  experience: TailoredExperience[];
  education: ResumeProfile["education"];
  projects: TailoredProject[];
  skills: ResumeProfile["skills"];
  optionalSections: ResumeProfile["optionalSections"];
  removedForSpace: Array<{ evidenceId: string; label: string }>;
}

export interface ValidationIssue {
  code:
    | "missing_evidence"
    | "unsupported_number"
    | "metadata_changed"
    | "invalid_structure"
    | "unsupported_claim";
  message: string;
  path: string;
}

export interface TailoringValidation {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface TailoringArtifact {
  id: string;
  tailoringId: string;
  revision: number;
  templateVersion: string;
  compilerVersion: string;
  createdAt: string;
}

export interface StructuredTailoring {
  kind: "structured";
  id: string;
  job_id: string;
  status: "planned" | "generated" | "failed";
  jobSnapshot: JobSnapshot;
  evidence: CandidateEvidence[];
  plan: TailoringPlan;
  resumeDraft: TailoredResume | null;
  validation: TailoringValidation | null;
  templateVersion: string;
  compilerVersion: string;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  created_at: string;
  updated_at: string;
  latestArtifact: TailoringArtifact | null;
  /** True when the saved resume has changed since this plan was created. */
  sourceProfileChanged: boolean;
  /** True when this pre-snapshot plan must be replaced before it can be used. */
  requiresFreshPlan: boolean;
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => item === undefined ? null : canonicalJsonValue(item));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonicalJsonValue(item)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

/**
 * Produces the canonical payload used both for the immutable profile snapshot
 * and its hash. Sorting object keys makes the fingerprint independent of JSON
 * property insertion order while preserving user-controlled array order.
 */
export function serializeResumeProfileSnapshot(profile: ResumeProfile): string {
  return JSON.stringify(canonicalJsonValue(normalizeResumeProfile(profile)));
}

export function parseResumeProfileSnapshot(value: string | null): ResumeProfile | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || (parsed as { schemaVersion?: unknown }).schemaVersion !== 2) {
      return null;
    }
    return normalizeResumeProfile(parsed);
  } catch {
    return null;
  }
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const character of value.normalize("NFKC").trim().toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function stableTextId(prefix: string, value: string): string {
  return `${prefix}-${stableHash(value)}`;
}

export function buildCandidateEvidence(profile: ResumeProfile): CandidateEvidence[] {
  const evidence: CandidateEvidence[] = [];
  for (const entry of profile.experience) {
    for (const bullet of entry.bullets.filter((value) => value.trim())) {
      evidence.push({
        id: stableTextId(`experience-${entry.id}`, bullet),
        sourceType: "experience",
        sourceEntryId: entry.id,
        label: `${entry.title} · ${entry.company}`,
        text: bullet.trim(),
      });
    }
  }
  for (const entry of profile.projects) {
    for (const bullet of entry.bullets.filter((value) => value.trim())) {
      evidence.push({
        id: stableTextId(`project-${entry.id}`, bullet),
        sourceType: "project",
        sourceEntryId: entry.id,
        label: entry.name,
        text: bullet.trim(),
      });
    }
  }
  for (const entry of profile.education) {
    const text = entry.credentials.map((credential) => [
      credential.degreeType ?? "",
      credential.fieldsOfStudy.join(" and "),
    ].filter(Boolean).join(" ")).concat(entry.minors.map((minor) => `Minor ${minor}`)).join("; ");
    if (text) evidence.push({
      id: stableTextId(`education-${entry.id}`, text),
      sourceType: "education",
      sourceEntryId: entry.id,
      label: entry.institution,
      text,
    });
  }
  for (const [index, skill] of profile.skills.entries()) {
    const text = [skill.category, skill.items].filter(Boolean).join(": ");
    if (text) evidence.push({
      id: stableTextId(`skills-${index}`, text),
      sourceType: "skills",
      sourceEntryId: `skills-${index}`,
      label: skill.category || "Skills",
      text,
    });
  }
  for (const section of profile.optionalSections) {
    for (const [index, item] of section.items.entries()) {
      const text = [item.category, item.items].filter(Boolean).join(": ");
      if (text) evidence.push({
        id: stableTextId(`${section.kind}-${index}`, text),
        sourceType: "additional",
        sourceEntryId: `${section.kind}-${index}`,
        label: item.category || section.kind,
        text,
      });
    }
  }
  return evidence;
}

function numbers(value: string): Set<string> {
  return new Set(value.match(/(?:\$|#)?\d[\d,.]*(?:%|[kKmMbB])?/g) ?? []);
}

const TECHNOLOGY_TERMS = [
  "AWS", "Azure", "C#", "C++", "Cloudflare", "Docker", "DynamoDB", "Elasticsearch",
  "FastAPI", "Firebase", "GCP", "Gemini", "GitHub", "GraphQL", "Java", "JavaScript",
  "Kafka", "Kubernetes", "LangChain", "LangGraph", "MongoDB", "MySQL", "Next.js",
  "Node.js", "OpenAI", "Oracle", "PostgreSQL", "Python", "PyTorch", "React", "Redis",
  "Ruby", "Rust", "Snowflake", "Spring", "SQL", "Supabase", "Svelte", "Swift",
  "TensorFlow", "Terraform", "TypeScript", "Vue", "Workers AI",
] as const;

function technologyTerms(value: string): string[] {
  const padded = ` ${value.toLowerCase()} `;
  return TECHNOLOGY_TERMS.filter((term) => {
    const needle = term.toLowerCase();
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(padded);
  });
}

function sameMetadata(
  output: TailoredExperience | TailoredProject,
  source: ResumeProfile["experience"][number] | ResumeProfile["projects"][number],
): boolean {
  if ("company" in output && "company" in source) {
    return output.company === source.company
      && output.title === source.title
      && output.location === source.location
      && output.startDate === source.startDate
      && output.endDate === source.endDate;
  }
  if ("name" in output && "name" in source) {
    return output.name === source.name
      && output.role === source.role
      && output.teamInfo === source.teamInfo
      && output.url === source.url
      && output.date === source.date;
  }
  return false;
}

export function validateTailoredResume(
  profile: ResumeProfile,
  evidence: CandidateEvidence[],
  resume: TailoredResume,
): TailoringValidation {
  const issues: ValidationIssue[] = [];
  if (
    !resume
    || typeof resume !== "object"
    || resume.schemaVersion !== 2
    || !resume.contact
    || !Array.isArray(resume.experience)
    || !Array.isArray(resume.education)
    || !Array.isArray(resume.projects)
    || !Array.isArray(resume.skills)
    || !Array.isArray(resume.optionalSections)
    || !Array.isArray(resume.removedForSpace)
  ) {
    return {
      valid: false,
      issues: [{
        code: "invalid_structure",
        message: "The structured resume is incomplete or malformed.",
        path: "resume",
      }],
    };
  }
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  if (JSON.stringify(resume.contact) !== JSON.stringify(profile.contact)) {
    issues.push({ code: "metadata_changed", message: "Contact details changed.", path: "contact" });
  }
  if (JSON.stringify(resume.education) !== JSON.stringify(profile.education)) {
    issues.push({ code: "metadata_changed", message: "Education details changed.", path: "education" });
  }
  if (JSON.stringify(resume.skills) !== JSON.stringify(profile.skills)) {
    issues.push({ code: "metadata_changed", message: "Skills changed outside the saved resume.", path: "skills" });
  }
  if (JSON.stringify(resume.optionalSections) !== JSON.stringify(profile.optionalSections)) {
    issues.push({ code: "metadata_changed", message: "Additional details changed outside the saved resume.", path: "optionalSections" });
  }

  const validateEntries = (
    entries: Array<TailoredExperience | TailoredProject>,
    sourceEntries: Array<ResumeProfile["experience"][number] | ResumeProfile["projects"][number]>,
    path: "experience" | "projects",
  ) => {
    for (const [entryIndex, entry] of entries.entries()) {
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.bullets) || entry.bullets.length === 0) {
        issues.push({
          code: "invalid_structure",
          message: "Each included entry needs at least one supported bullet.",
          path: `${path}.${entryIndex}`,
        });
        continue;
      }
      const source = sourceEntries.find((candidate) => candidate.id === entry.sourceEntryId);
      if (!source || !sameMetadata(entry, source)) {
        issues.push({
          code: "metadata_changed",
          message: "Entry metadata does not match the saved resume.",
          path: `${path}.${entryIndex}`,
        });
      }
      for (const [bulletIndex, bullet] of entry.bullets.entries()) {
        if (
          !bullet
          || typeof bullet.text !== "string"
          || !bullet.text.trim()
          || !Array.isArray(bullet.evidenceIds)
          || bullet.evidenceIds.length === 0
        ) {
          issues.push({
            code: "invalid_structure",
            message: "Each bullet needs text and supporting evidence.",
            path: `${path}.${entryIndex}.bullets.${bulletIndex}`,
          });
          continue;
        }
        const cited = bullet.evidenceIds.map((id) => evidenceById.get(id)).filter(Boolean) as CandidateEvidence[];
        if (cited.length !== bullet.evidenceIds.length) {
          issues.push({
            code: "missing_evidence",
            message: "This bullet cites evidence that no longer exists.",
            path: `${path}.${entryIndex}.bullets.${bulletIndex}`,
          });
        }
        const expectedSourceType = path === "experience" ? "experience" : "project";
        if (cited.some((item) =>
          item.sourceType !== expectedSourceType || item.sourceEntryId !== entry.sourceEntryId
        )) {
          issues.push({
            code: "unsupported_claim",
            message: "This bullet cites evidence from a different resume entry.",
            path: `${path}.${entryIndex}.bullets.${bulletIndex}`,
          });
        }
        if (cited.length === 0) {
          continue;
        }
        const supportedNumbers = numbers(cited.map((item) => item.text).join(" "));
        for (const value of numbers(bullet.text)) {
          if (!supportedNumbers.has(value)) {
            issues.push({
              code: "unsupported_number",
              message: `The number ${value} is not present in the cited evidence.`,
              path: `${path}.${entryIndex}.bullets.${bulletIndex}`,
            });
          }
        }
        const supportedText = cited.map((item) => item.text).join(" ");
        const supportedTechnologies = new Set(technologyTerms(supportedText));
        for (const technology of technologyTerms(bullet.text)) {
          if (!supportedTechnologies.has(technology)) {
            issues.push({
              code: "unsupported_claim",
              message: `${technology} is not present in the cited evidence.`,
              path: `${path}.${entryIndex}.bullets.${bulletIndex}`,
            });
          }
        }
      }
    }
  };
  validateEntries(resume.experience, profile.experience, "experience");
  validateEntries(resume.projects, profile.projects, "projects");
  return { valid: issues.length === 0, issues };
}
