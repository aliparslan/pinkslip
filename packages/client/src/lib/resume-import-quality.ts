import type { ResumeProfile } from "../../../../shared/resume-profile";

function textScore(value: string | undefined, weight: number): number {
  return value?.trim() ? weight : 0;
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

export function resumeImportWarnings(profile: Partial<ResumeProfile>): string[] {
  return [
    !profile.contact?.name ? "We couldn’t identify a name." : "",
    !profile.contact?.email ? "We couldn’t identify an email address." : "",
    (profile.experience?.length ?? 0) === 0 ? "We couldn’t identify an experience section." : "",
    (profile.education?.length ?? 0) === 0 ? "We couldn’t identify an education section." : "",
  ].filter(Boolean);
}
