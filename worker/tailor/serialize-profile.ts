import type { DegreeType, ResumeProfile, OptionalSectionKind } from "../types";

const SECTION_TITLES: Record<OptionalSectionKind, string> = {
  leadership: "Leadership & Affiliations",
  certifications: "Certifications",
  publications: "Publications",
  awards: "Awards & Honors",
  volunteer: "Volunteer Experience",
};

const DEGREE_LABELS: Partial<Record<DegreeType, string>> = {
  high_school: "High school diploma",
  associate: "Associate degree",
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  doctorate: "Doctorate / PhD",
  professional: "Professional degree",
  certificate: "Certificate",
};

function educationLabels(entry: ResumeProfile["education"][number]): string[] {
  const credentials = entry.credentials.map((credential) => [
    credential.degreeType ? DEGREE_LABELS[credential.degreeType] ?? "Other degree" : "",
    credential.fieldsOfStudy.join(" and "),
  ].filter(Boolean).join(", "));
  if (entry.minors.length) credentials.push(`Minor in ${entry.minors.join(" and ")}`);
  return credentials.filter(Boolean);
}

function linkedinUrl(handle: string): string {
  if (!handle) return "";
  if (handle.startsWith("http")) return handle;
  return `https://linkedin.com/in/${handle}`;
}

function githubUrl(handle: string): string {
  if (!handle) return "";
  if (handle.startsWith("http")) return handle;
  return `https://github.com/${handle}`;
}

export function serializeProfileForPrompt(profile: ResumeProfile, notes?: string): string {
  const sections: string[] = [];

  const c = profile.contact;
  const contactParts: string[] = [];
  if (c.location) contactParts.push(c.location);
  if (c.phone) contactParts.push(c.phone);
  if (c.email) contactParts.push(`[${c.email}](mailto:${c.email})`);
  if (c.linkedin) contactParts.push(`[LinkedIn](${linkedinUrl(c.linkedin)})`);
  if (c.github) contactParts.push(`[GitHub](${githubUrl(c.github)})`);
  if (c.website) contactParts.push(`[Website](${c.website})`);

  if (c.name) {
    sections.push(`# ${c.name}`);
    if (contactParts.length > 0) {
      sections.push(contactParts.join(" | "));
    }
  }

  if (profile.experience.length > 0) {
    const lines: string[] = ["## Work Experience", ""];
    for (const exp of profile.experience) {
      const datePart = [exp.startDate, exp.endDate].filter(Boolean).join(" -- ");
      const entryParts = [exp.company, exp.location, datePart].filter(Boolean);
      lines.push(`**${entryParts.shift()}** | ${entryParts.join(" | ")}`);
      if (exp.title) lines.push(`*${exp.title}*`);
      for (const b of exp.bullets) {
        if (b.trim()) lines.push(`- ${b.trim()}`);
      }
      lines.push("");
    }
    sections.push(lines.join("\n"));
  }

  if (profile.education.length > 0) {
    const lines: string[] = ["## Education", ""];
    for (const edu of profile.education) {
      const datePart = [edu.startDate, edu.endDate].filter(Boolean).join(" -- ");
      const entryParts = [edu.institution, edu.location, datePart].filter(Boolean);
      lines.push(`**${entryParts.shift()}** | ${entryParts.join(" | ")}`);
      const degreeParts = [...educationLabels(edu), edu.gpa ? `GPA: ${edu.gpa}` : ""].filter(Boolean);
      if (degreeParts.length > 0) lines.push(`*${degreeParts.join(", ")}*`);
      lines.push("");
    }
    sections.push(lines.join("\n"));
  }

  if (profile.projects.length > 0) {
    const lines: string[] = ["## Projects", ""];
    for (const proj of profile.projects) {
      let heading = `**${proj.name}**`;
      const meta: string[] = [];
      if (proj.date) meta.push(proj.date);
      if (proj.url) meta.push(`[Live Demo](${proj.url})`);
      if (meta.length > 0) heading += ` -- ${meta.join(" | ")}`;
      lines.push(heading);
      for (const b of proj.bullets) {
        if (b.trim()) lines.push(`- ${b.trim()}`);
      }
      lines.push("");
    }
    sections.push(lines.join("\n"));
  }

  if (profile.skills.length > 0) {
    const lines: string[] = ["## Skills", ""];
    for (const s of profile.skills) {
      if (s.category && s.items) lines.push(`**${s.category}**: ${s.items}`);
    }
    sections.push(lines.join("\n"));
  }

  for (const section of profile.optionalSections ?? []) {
    const title = SECTION_TITLES[section.kind] ?? section.kind;
    const lines: string[] = [`## ${title}`, ""];
    for (const item of section.items) {
      if (item.category && item.items) lines.push(`**${item.category}**: ${item.items}`);
    }
    if (lines.length > 2) sections.push(lines.join("\n"));
  }

  let result = sections.join("\n\n").trim();

  if (notes?.trim()) {
    result += `\n\n---\n\nSUPPLEMENTARY NOTES:\n${notes.trim()}`;
  }

  return result;
}
