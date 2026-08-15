import type { ResumeProfile } from "./resume-profile";

export type ApplicationAts = "greenhouse" | "lever" | "ashby" | "workday" | "generic";

export interface ApplicationEducationRecord {
  institution: string;
  location: string;
  degree: string;
  discipline: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

export interface ApplicationResumePayload {
  ats: ApplicationAts;
  contact: ResumeProfile["contact"];
  experience: ResumeProfile["experience"];
  education: ApplicationEducationRecord[];
  projects: ResumeProfile["projects"];
  skills: ResumeProfile["skills"];
}

function displayDegree(value: string | undefined): string {
  if (!value) return "";
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function educationForGreenhouse(profile: ResumeProfile): ApplicationEducationRecord[] {
  return profile.education.flatMap((entry) => {
    const records = entry.credentials.flatMap((credential) => {
      const fields = credential.fieldsOfStudy.length > 0 ? credential.fieldsOfStudy : [""];
      return fields.map((discipline) => ({
        institution: entry.institution,
        location: entry.location,
        degree: displayDegree(credential.degreeType),
        discipline,
        startDate: entry.startDate,
        endDate: entry.endDate,
        gpa: entry.gpa ?? "",
      }));
    });
    return records.length > 0 ? records : [{
      institution: entry.institution,
      location: entry.location,
      degree: "",
      discipline: "",
      startDate: entry.startDate,
      endDate: entry.endDate,
      gpa: entry.gpa ?? "",
    }];
  });
}

function educationGroupedBySchool(profile: ResumeProfile): ApplicationEducationRecord[] {
  return profile.education.map((entry) => ({
    institution: entry.institution,
    location: entry.location,
    degree: entry.credentials.map((credential) => displayDegree(credential.degreeType)).filter(Boolean).join("; "),
    discipline: entry.credentials.flatMap((credential) => credential.fieldsOfStudy)
      .concat(entry.minors.map((minor) => `Minor: ${minor}`))
      .join("; "),
    startDate: entry.startDate,
    endDate: entry.endDate,
    gpa: entry.gpa ?? "",
  }));
}

/**
 * Produce a deterministic projection for a future supervised application
 * flow. This deliberately performs no network or form interaction.
 */
export function adaptResumeForAts(
  profile: ResumeProfile,
  ats: ApplicationAts,
): ApplicationResumePayload {
  return {
    ats,
    contact: structuredClone(profile.contact),
    experience: structuredClone(profile.experience),
    education: ats === "greenhouse"
      ? educationForGreenhouse(profile)
      : educationGroupedBySchool(profile),
    projects: structuredClone(profile.projects),
    skills: structuredClone(profile.skills),
  };
}
