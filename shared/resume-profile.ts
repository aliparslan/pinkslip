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

export function normalizeEducationEntry(
  value: Partial<EducationEntry> | null | undefined,
  index = 0,
): EducationEntry {
  const source = value && typeof value === "object" ? value : {};
  const id = source.id?.trim() || stableId("education", `${index}|${source.institution ?? ""}`);
  const incomingCredentials = Array.isArray(source.credentials) ? source.credentials : [];
  const credentials = incomingCredentials.map((credential, credentialIndex) => normalizeCredential(
    credential,
    `${id}|${credentialIndex}|${credential.degreeType ?? ""}`,
  ));
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

export function normalizeResumeProfile(value: unknown): ResumeProfile {
  const empty = createEmptyResumeProfile();
  if (!value || typeof value !== "object") return empty;
  const input = value as Partial<ResumeProfile>;
  if (input.schemaVersion !== 2) return empty;
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
