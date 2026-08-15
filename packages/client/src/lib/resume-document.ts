import {
  stableTextId,
  type TailoredResume,
} from "../../../../shared/tailoring";

export {
  RESUME_COMPILER_VERSION,
  RESUME_TEMPLATE_VERSION,
} from "../../../../shared/tailoring";

function value(input: string | undefined): string {
  return JSON.stringify(input?.trim() ?? "");
}

function nonEmpty(input: string | undefined): boolean {
  return Boolean(input?.trim());
}

function dateRange(start: string, end: string): string {
  return [start, end].filter(nonEmpty).join(" – ");
}

function webHref(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function contactLine(resume: TailoredResume): Array<{ text: string; href?: string }> {
  const contact = resume.contact;
  return [
    { text: contact.email, href: contact.email ? `mailto:${contact.email}` : undefined },
    { text: contact.phone, href: contact.phone ? `tel:${contact.phone.replace(/[^+\d]/g, "")}` : undefined },
    { text: contact.location },
    { text: contact.linkedin, href: webHref(contact.linkedin) },
    { text: contact.github, href: webHref(contact.github) },
    { text: contact.website, href: webHref(contact.website) },
  ].filter((item) => nonEmpty(item.text));
}

function linkedText(text: string, href?: string): string {
  return href
    ? `#link(${value(href)})[#text(${value(text)})]`
    : `#text(${value(text)})`;
}

function section(title: string, body: string): string {
  if (!body.trim()) return "";
  return `#section(${value(title)})\n${body}\n`;
}

function bullets(items: Array<{ text: string }>): string {
  const values = items
    .filter((item) => nonEmpty(item.text))
    .map((item) => value(item.text));
  return values.length > 0 ? `#resume-bullets(${values.join(", ")})` : "";
}

export type ResumeTemplateDensity = "standard" | "compact";

interface ResumeTemplateMetrics {
  marginX: string;
  marginY: string;
  paragraphLeading: string;
  listIndent: string;
  listBodyIndent: string;
  listSpacing: string;
  sectionBefore: string;
  sectionRuleAfter: string;
  sectionAfter: string;
  entryHeadingAfter: string;
  entrySubheadingAfter: string;
  entryAfter: string;
  nameSize: string;
  nameAfter: string;
}

const TEMPLATE_METRICS: Record<ResumeTemplateDensity, ResumeTemplateMetrics> = {
  standard: {
    marginX: "0.54in",
    marginY: "0.44in",
    paragraphLeading: "0.32em",
    listIndent: "0.88em",
    listBodyIndent: "0.3em",
    listSpacing: "0.16em",
    sectionBefore: "5pt",
    sectionRuleAfter: "1.5pt",
    sectionAfter: "2.5pt",
    entryHeadingAfter: "0.25pt",
    entrySubheadingAfter: "0.75pt",
    entryAfter: "2.5pt",
    nameSize: "18pt",
    nameAfter: "1.5pt",
  },
  compact: {
    marginX: "0.46in",
    marginY: "0.34in",
    paragraphLeading: "0.16em",
    listIndent: "0.82em",
    listBodyIndent: "0.25em",
    listSpacing: "0.05em",
    sectionBefore: "3pt",
    sectionRuleAfter: "1pt",
    sectionAfter: "1.5pt",
    entryHeadingAfter: "0pt",
    entrySubheadingAfter: "0.25pt",
    entryAfter: "1.25pt",
    nameSize: "17pt",
    nameAfter: "1pt",
  },
};

export function buildResumeTypstSource(
  resume: TailoredResume,
  density: ResumeTemplateDensity = "standard",
): string {
  const metrics = TEMPLATE_METRICS[density];
  const experience = resume.experience.map((entry) => `
#block(width: 100%, breakable: false)[
#entry-heading(${value(entry.title)}, ${value(dateRange(entry.startDate, entry.endDate))})
#entry-subheading(${value(entry.company)}, ${value(entry.location)})
${bullets(entry.bullets)}
]
#entry-gap()
`).join("\n");

  const projects = resume.projects.map((entry) => {
    const subtitle = [entry.role, entry.teamInfo].filter(nonEmpty).join(" · ");
    const subheading = entry.url
      ? `#entry-subheading-link(${value(subtitle)}, ${value(webHref(entry.url))}, ${value(entry.url)})`
      : subtitle
        ? `#entry-subheading(${value(subtitle)}, "")`
        : "";
    return `
#block(width: 100%, breakable: false)[
#entry-heading(${value(entry.name)}, ${value(entry.date)})
${subheading}
${bullets(entry.bullets)}
]
#entry-gap()
`;
  }).join("\n");

  const education = resume.education.map((entry) => {
    const credentials = entry.credentials.flatMap((credential) => {
      const degree = credential.degreeType
        ? credential.degreeType.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
        : "";
      const fields = credential.fieldsOfStudy.join(" and ");
      return [[degree, fields].filter(nonEmpty).join(" in ")].filter(nonEmpty);
    });
    const details = credentials.concat(entry.minors.map((minor) => `Minor in ${minor}`));
    const gpa = entry.gpa ? `GPA ${entry.gpa}` : "";
    return `
#block(width: 100%, breakable: false)[
#entry-heading(${value(entry.institution)}, ${value(dateRange(entry.startDate, entry.endDate))})
#entry-subheading(${value(details.join("; "))}, ${value([entry.location, gpa].filter(nonEmpty).join(" · "))})
]
#entry-gap()
`;
  }).join("\n");

  const skills = resume.skills
    .filter((row) => nonEmpty(row.category) || nonEmpty(row.items))
    .map((row) => `#skill-row(${value(row.category)}, ${value(row.items)})`)
    .join("\n");

  const optional = resume.optionalSections.map((optionalSection) => section(
    optionalSection.kind.replace(/\b\w/g, (character) => character.toUpperCase()),
    optionalSection.items.map((row) => `#skill-row(${value(row.category)}, ${value(row.items)})`).join("\n"),
  )).join("\n");

  const contacts = contactLine(resume)
    .map((item) => linkedText(item.text, item.href))
    .join(" #h(5pt) #text(\"·\") #h(5pt) ");

  return `
#set page(paper: "us-letter", margin: (x: ${metrics.marginX}, y: ${metrics.marginY}))
#set text(font: "Source Sans 3", size: 11pt, fill: rgb("171717"), lang: "en")
#set par(justify: false, leading: ${metrics.paragraphLeading})
#set list(indent: ${metrics.listIndent}, body-indent: ${metrics.listBodyIndent}, spacing: ${metrics.listSpacing}, marker: [•])

#let section(title) = block(
  width: 100%,
  sticky: true,
  above: ${metrics.sectionBefore},
  below: ${metrics.sectionAfter},
)[
  #text(upper(title), size: 11.5pt, weight: 700, tracking: 0.04em)
  #v(${metrics.sectionRuleAfter})
  #line(length: 100%, stroke: 0.55pt + rgb("525252"))
]

#let entry-heading(left, right) = {
  block(width: 100%)[
    #grid(text(left, weight: 600), text(right, weight: 500),
      columns: (1fr, auto), column-gutter: 8pt)
  ]
  v(${metrics.entryHeadingAfter})
}

#let entry-subheading(left, right) = {
  block(width: 100%)[
    #grid(text(left, fill: rgb("404040")), text(right, fill: rgb("404040")),
      columns: (1fr, auto), column-gutter: 8pt)
  ]
  v(${metrics.entrySubheadingAfter})
}

#let entry-subheading-link(left, url, label) = {
  block(width: 100%)[
    #grid(text(left, fill: rgb("404040")), link(url)[#text(label, fill: rgb("404040"))],
      columns: (1fr, auto), column-gutter: 8pt)
  ]
  v(${metrics.entrySubheadingAfter})
}

#let resume-bullets(..items) = list(..items.pos().map(item => text(item)))
#let entry-gap() = v(${metrics.entryAfter})
#let skill-row(label, body) = {
  if label != "" { text(label + ": ", weight: 600) }
  text(body)
  linebreak()
}

#align(center, stack(
  dir: ttb,
  spacing: ${metrics.nameAfter},
  [#text(${value(resume.contact.name)}, size: ${metrics.nameSize}, weight: 700)],
  [#text(size: 11pt, fill: rgb("404040"))[${contacts}]],
))

${section("Experience", experience)}
${section("Projects", projects)}
${section("Education", education)}
${section("Skills", skills)}
${optional}
`.trim();
}

export function cloneTailoredResume(resume: TailoredResume): TailoredResume {
  // Tailoring drafts are held in Svelte's deep reactive proxies. Proxies cannot
  // cross structured-clone boundaries, while TailoredResume is intentionally a
  // JSON-only persistence type. Serializing here gives the compiler, autosave,
  // and edit operations a detached plain object on every platform.
  return JSON.parse(JSON.stringify(resume)) as TailoredResume;
}

export function removeLowestPriorityContent(
  resume: TailoredResume,
  priorityEvidenceIds: string[],
): { resume: TailoredResume; removed: TailoredResume["removedForSpace"][number] | null } {
  const next = cloneTailoredResume(resume);
  const protectedEvidence = new Set(next.spaceProtectedEvidenceIds ?? []);
  for (let sectionIndex = next.optionalSections.length - 1; sectionIndex >= 0; sectionIndex -= 1) {
    const optionalSection = next.optionalSections[sectionIndex];
    let itemIndex = -1;
    for (let index = optionalSection.items.length - 1; index >= 0; index -= 1) {
      const candidate = optionalSection.items[index];
      const candidateId = stableTextId(
        "optional",
        `${optionalSection.kind}:${candidate.category}:${candidate.items}`,
      );
      if (!protectedEvidence.has(candidateId)) {
        itemIndex = index;
        break;
      }
    }
    if (itemIndex < 0) continue;
    const [item] = optionalSection.items.splice(itemIndex, 1);
    if (item) {
      const evidenceId = stableTextId(
        "optional",
        `${optionalSection.kind}:${item.category}:${item.items}`,
      );
      if (optionalSection.items.length === 0) next.optionalSections.splice(sectionIndex, 1);
      const removed = {
        evidenceId,
        label: item.category || optionalSection.kind,
        section: "optionalSections" as const,
        optionalSection: { kind: optionalSection.kind, items: [item] },
      };
      next.removedForSpace.push(removed);
      return { resume: next, removed };
    }
  }

  const priority = new Map(priorityEvidenceIds.map((id, index) => [id, index]));
  const candidates = [
    ...next.experience.flatMap((entry, entryIndex) => entry.bullets.length > 1
      ? entry.bullets.filter((bullet) => !bullet.locked).map((bullet) => ({
          kind: "experience" as const,
          entryIndex,
          bulletIndex: entry.bullets.indexOf(bullet),
          bullet,
        }))
      : []),
    ...next.projects.flatMap((entry, entryIndex) => entry.bullets.length > 1
      ? entry.bullets.filter((bullet) => !bullet.locked).map((bullet) => ({
          kind: "projects" as const,
          entryIndex,
          bulletIndex: entry.bullets.indexOf(bullet),
          bullet,
        }))
      : []),
  ].sort((a, b) => {
    const aRank = Math.max(...a.bullet.evidenceIds.map((id) => priority.get(id) ?? Number.MAX_SAFE_INTEGER));
    const bRank = Math.max(...b.bullet.evidenceIds.map((id) => priority.get(id) ?? Number.MAX_SAFE_INTEGER));
    return bRank - aRank || b.bulletIndex - a.bulletIndex;
  });
  const candidate = candidates[0];
  if (!candidate) return { resume: next, removed: null };
  const entries = candidate.kind === "experience" ? next.experience : next.projects;
  const [removedBullet] = entries[candidate.entryIndex].bullets.splice(candidate.bulletIndex, 1);
  const removed = {
    evidenceId: removedBullet.evidenceIds[0] ?? removedBullet.id,
    label: removedBullet.text,
    section: candidate.kind,
    sourceEntryId: entries[candidate.entryIndex].sourceEntryId,
    bullet: removedBullet,
  };
  next.removedForSpace.push(removed);
  return { resume: next, removed };
}

export function advanceResumeFit(
  resume: TailoredResume,
  density: ResumeTemplateDensity,
  priorityEvidenceIds: string[],
): {
  resume: TailoredResume;
  density: ResumeTemplateDensity;
  removed: TailoredResume["removedForSpace"][number] | null;
} {
  if (density === "standard") {
    return {
      resume: cloneTailoredResume(resume),
      density: "compact",
      removed: null,
    };
  }
  const removal = removeLowestPriorityContent(resume, priorityEvidenceIds);
  return {
    resume: removal.resume,
    density,
    removed: removal.removed,
  };
}

export function restoreRemovedContent(
  resume: TailoredResume,
  removedIndex: number,
): { resume: TailoredResume; restored: boolean } {
  const next = cloneTailoredResume(resume);
  const [removed] = next.removedForSpace.splice(removedIndex, 1);
  if (!removed) return { resume: next, restored: false };
  if (removed.section === "optionalSections" && removed.optionalSection) {
    const existing = next.optionalSections.find((section) => section.kind === removed.optionalSection?.kind);
    if (existing) existing.items.push(...removed.optionalSection.items);
    else next.optionalSections.push(removed.optionalSection);
    next.spaceProtectedEvidenceIds = [...new Set([...(next.spaceProtectedEvidenceIds ?? []), removed.evidenceId])];
    return { resume: next, restored: true };
  }
  if (
    (removed.section === "experience" || removed.section === "projects")
    && removed.sourceEntryId
    && removed.bullet
  ) {
    const entry = next[removed.section].find((candidate) => candidate.sourceEntryId === removed.sourceEntryId);
    if (!entry) return { resume, restored: false };
    entry.bullets.push(removed.bullet);
    return { resume: next, restored: true };
  }
  return { resume, restored: false };
}

export function restoreAllSpaceRemovedContent(resume: TailoredResume): TailoredResume {
  let next = cloneTailoredResume(resume);
  const protectedEvidenceIds = [...(next.spaceProtectedEvidenceIds ?? [])];
  while (next.removedForSpace.length > 0) {
    const restored = restoreRemovedContent(next, next.removedForSpace.length - 1);
    if (!restored.restored) break;
    next = restored.resume;
  }
  next.spaceProtectedEvidenceIds = protectedEvidenceIds;
  return next;
}
