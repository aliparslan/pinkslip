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

export type LegacyCompatibleEducationEntry = EducationEntry & {
  degree: string;
  degreeType?: DegreeType;
  fieldOfStudy: string;
};

export type LegacyCompatibleResumeProfile = Omit<ResumeProfile, "education"> & {
  education: LegacyCompatibleEducationEntry[];
};

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

function legacyDegreeLabel(credential: EducationCredential | undefined): string {
  if (!credential) return "";
  const labels: Record<DegreeType, string> = {
    high_school: "High school diploma",
    associate: "Associate degree",
    bachelor: "Bachelor's degree",
    master: "Master's degree",
    doctorate: "Doctorate",
    professional: "Professional degree",
    certificate: "Certificate",
    other: "Degree",
  };
  const label = credential.degreeType ? labels[credential.degreeType] : "";
  const field = credential.fieldsOfStudy.join(" and ");
  if (label && field) return `${label} in ${field}`;
  return label || field;
}

/**
 * Keeps installed schema-v1 clients readable while the App Store update rolls
 * out. Unknown v2 fields survive the old editor's object spreads, and legacy
 * degree edits are folded back into the first credential during normalization.
 */
export function withLegacyResumeAliases(profile: ResumeProfile): LegacyCompatibleResumeProfile {
  return {
    ...profile,
    education: profile.education.map((entry) => {
      const credential = entry.credentials[0];
      return {
        ...entry,
        degree: legacyDegreeLabel(credential),
        degreeType: credential?.degreeType,
        fieldOfStudy: credential?.fieldsOfStudy.join(" and ") ?? "",
      };
    }),
  };
}

export function normalizeEducationEntry(
  value: (Partial<EducationEntry> & LegacyEducationEntry) | null | undefined,
  index = 0,
): EducationEntry {
  const source = value && typeof value === "object" ? value : {};
  const id = source.id?.trim() || stableId("education", `${index}|${source.institution ?? ""}`);
  const incomingCredentials = Array.isArray(source.credentials) ? source.credentials : [];
  let credentials = incomingCredentials.length
    ? incomingCredentials.map((credential, credentialIndex) => normalizeCredential(
        credential,
        `${id}|${credentialIndex}|${credential.degreeType ?? ""}`,
      ))
    : [legacyCredential(source)];
  const includesLegacyEditorFields = typeof source.degree === "string"
    || typeof source.fieldOfStudy === "string"
    || source.degreeType !== undefined;
  if (incomingCredentials.length && includesLegacyEditorFields) {
    const editedCredential = legacyCredential(source);
    credentials = [{ ...credentials[0], ...editedCredential }, ...credentials.slice(1)];
  }
  return {
    id,
    institution: source.institution?.trim() ?? "",
    credentials,
    minors: cleanStrings(source.minors),
    location: source.location?.trim() ?? "",
    startDate: source.startDate?.trim() ?? "",
    endDate: source.endDate?.trim() ?? "",
    gpa: source.gpa?.trim() || undefined,
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
      ? input.education
        .filter((entry) => Boolean(entry) && typeof entry === "object")
        .map((entry, index) => normalizeEducationEntry(entry, index))
      : [],
    projects: Array.isArray(input.projects) ? input.projects : [],
    skills: Array.isArray(input.skills) ? input.skills : [],
    optionalSections: Array.isArray(input.optionalSections) ? input.optionalSections : [],
  };
}
