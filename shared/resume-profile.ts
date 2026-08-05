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

export interface ResumeProfile {
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
  education: Array<{
    id: string;
    institution: string;
    degree: string;
    degreeType?: DegreeType;
    fieldOfStudy?: string;
    location: string;
    startDate: string;
    endDate: string;
    gpa?: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    role: string;
    teamInfo: string;
    url: string;
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
