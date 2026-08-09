export type OptionalSectionKind =
  | "leadership"
  | "certifications"
  | "publications"
  | "awards"
  | "volunteer";

export interface OptionalSection {
  kind: OptionalSectionKind;
  items: Array<{ category: string; items: string }>;
}

export type DegreeType =
  | "high_school"
  | "associate"
  | "bachelor"
  | "master"
  | "doctorate"
  | "professional"
  | "certificate"
  | "other";

export interface EducationCredential {
  id: string;
  degreeType?: DegreeType;
  /** One credential can contain a double major without repeating the school. */
  fieldsOfStudy: string[];
}

export interface EducationEntry {
  id: string;
  institution: string;
  credentials: EducationCredential[];
  minors: string[];
  location: string;
  startDate: string;
  endDate: string;
  gpa?: string;
}

/** Accepted on reads while stored v1 profiles are upgraded in memory. */
interface LegacyEducationEntry {
  id?: string;
  institution?: string;
  degree?: string;
  degreeType?: DegreeType;
  fieldOfStudy?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

export interface ResumeProfile {
  schemaVersion: 2;
  contact: {
    name: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    github: string;
    website: string;
  };
  experience: Array<{
    id: string;
    company: string;
    title: string;
    location: string;
    startDate: string;
    endDate: string;
    bullets: string[];
  }>;
  education: EducationEntry[];
  projects: Array<{
    id: string;
    name: string;
    role?: string;
    teamInfo?: string;
    url: string;
    date?: string;
    bullets: string[];
  }>;
  skills: Array<{
    category: string;
    items: string;
  }>;
  optionalSections: OptionalSection[];
}

export function createEmptyResumeProfile(): ResumeProfile {
  return {
    schemaVersion: 2,
    contact: {
      name: "",
      email: "",
      phone: "",
      location: "",
      linkedin: "",
      github: "",
      website: "",
    },
    experience: [],
    education: [],
    projects: [],
    skills: [],
    optionalSections: [],
  };
}

function stableId(prefix: string, value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function cleanStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCredential(
  value: Partial<EducationCredential>,
  fallbackSeed: string,
): EducationCredential {
  return {
    id: typeof value.id === "string" && value.id.trim()
      ? value.id
      : stableId("credential", fallbackSeed),
    degreeType: value.degreeType,
    fieldsOfStudy: cleanStrings(value.fieldsOfStudy),
  };
}

function legacyCredential(entry: LegacyEducationEntry): EducationCredential {
  const field = entry.fieldOfStudy?.trim()
    || entry.degree?.replace(/^[^,]+,\s*/, "").trim()
    || "";
  return {
    id: stableId("credential", [entry.id, entry.degreeType, field].join("|")),
    degreeType: entry.degreeType,
    fieldsOfStudy: field ? [field] : [],
  };
}

export function normalizeEducationEntry(
  value: Partial<EducationEntry> & LegacyEducationEntry,
  index = 0,
): EducationEntry {
  const id = value.id?.trim() || stableId("education", `${index}|${value.institution ?? ""}`);
  const incomingCredentials = Array.isArray(value.credentials) ? value.credentials : [];
  const credentials = incomingCredentials.length
    ? incomingCredentials.map((credential, credentialIndex) => normalizeCredential(
        credential,
        `${id}|${credentialIndex}|${credential.degreeType ?? ""}`,
      ))
    : [legacyCredential(value)];
  return {
    id,
    institution: value.institution?.trim() ?? "",
    credentials,
    minors: cleanStrings(value.minors),
    location: value.location?.trim() ?? "",
    startDate: value.startDate?.trim() ?? "",
    endDate: value.endDate?.trim() ?? "",
    gpa: value.gpa?.trim() || undefined,
  };
}

/**
 * Hydrates persisted profiles at the API boundary. V1 education fields are
 * accepted on reads, while every returned/saved profile uses schema v2.
 */
export function normalizeResumeProfile(value: unknown): ResumeProfile {
  const empty = createEmptyResumeProfile();
  if (!value || typeof value !== "object") return empty;
  const input = value as Partial<ResumeProfile> & {
    education?: Array<Partial<EducationEntry> & LegacyEducationEntry>;
  };
  const contact = input.contact && typeof input.contact === "object"
    ? { ...empty.contact, ...input.contact }
    : empty.contact;
  return {
    ...empty,
    ...input,
    schemaVersion: 2,
    contact,
    experience: Array.isArray(input.experience) ? input.experience : [],
    education: Array.isArray(input.education)
      ? input.education.map((entry, index) => normalizeEducationEntry(entry, index))
      : [],
    projects: Array.isArray(input.projects) ? input.projects : [],
    skills: Array.isArray(input.skills) ? input.skills : [],
    optionalSections: Array.isArray(input.optionalSections) ? input.optionalSections : [],
  };
}
