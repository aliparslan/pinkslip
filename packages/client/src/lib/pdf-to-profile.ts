import type { DegreeType, ResumeProfile } from "../../../../shared/resume-profile";
import {
  inferDegreeType,
  inferFieldOfStudy,
} from "./resume-fields";

type PdfLink = { url: string };

type SectionType =
  | "experience"
  | "education"
  | "projects"
  | "skills"
  | "leadership"
  | "certifications"
  | "publications"
  | "awards"
  | "volunteer";

type DatedLine = {
  prefix: string;
  start: string;
  end: string;
  matched: boolean;
};

const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const SEASON = "(?:Spring|Summer|Fall|Autumn|Winter)";
const YEAR = "(?:\\d{4}|(?:19|20)XX)";
const DATE = `(?:Expected\\s+)?(?:(?:${MONTH}\\.?|${SEASON})\\s+)?${YEAR}`;
const COMPACT_MONTH_RANGE_AT_END = new RegExp(`(${MONTH})\\.?\\s*(?:-|–|—|to)\\s*(${MONTH})\\.?\\s+(${YEAR})\\s*$`, "i");
const DATE_RANGE_AT_END = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(Present|Current|${DATE})\\s*$`, "i");
const SINGLE_DATE_AT_END = new RegExp(`(${DATE})\\s*$`, "i");

const BULLET_PREFIX = /^[\-•●◦▪‣\uF0B7]\s*/;

const SECTION_PATTERNS: Array<[SectionType, RegExp]> = [
  ["experience", /^(?:(?:work|professional)\s+)?experience$|^employment(?:\s+history)?$/i],
  ["education", /^education(?:\s+and\s+training)?$/i],
  ["projects", /^(?:(?:selected\s+)?projects?|project\s+experience(?:\s*(?:&|and)\s*activities)?|projects?\s*(?:&|and)\s*activities)$/i],
  ["skills", /^(?:technical\s+|programming\s+)?skills(?:\s*(?:&|and)\s*(?:technical\s+tools?|interests?|hobbies))?$/i],
  ["leadership", /^(?:leadership|affiliations|activities)(?:\s+and\s+affiliations)?$/i],
  ["certifications", /^certifications?(?:\s+and\s+licenses)?$/i],
  ["publications", /^publications?$/i],
  ["awards", /^(?:awards?|honors?)(?:\s+and\s+(?:awards?|honors?))?$/i],
  ["volunteer", /^volunteer(?:\s+experience)?$/i],
];

function classifyLine(line: string): SectionType | null {
  if (isBulletLine(line)) return null;
  const clean = line
    .replace(/[^a-zA-Z\s&/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length < 3 || clean.length > 50) return null;
  return SECTION_PATTERNS.find(([, pattern]) => pattern.test(clean))?.[0] ?? null;
}

function splitTrailingDate(text: string): DatedLine {
  const compactMonthRange = COMPACT_MONTH_RANGE_AT_END.exec(text);
  if (compactMonthRange) {
    const year = compactMonthRange[3].trim();
    return {
      prefix: text.slice(0, compactMonthRange.index).replace(/[|,;\s]+$/, "").trim(),
      start: `${compactMonthRange[1]} ${year}`,
      end: `${compactMonthRange[2]} ${year}`,
      matched: true,
    };
  }
  const range = DATE_RANGE_AT_END.exec(text);
  if (range) {
    return {
      prefix: text.slice(0, range.index).replace(/[|,;\s]+$/, "").trim(),
      start: cleanDate(range[1]),
      end: /current/i.test(range[2]) ? "Present" : cleanDate(range[2]),
      matched: true,
    };
  }
  const single = SINGLE_DATE_AT_END.exec(text);
  if (single) {
    return {
      prefix: text.slice(0, single.index).replace(/[|,;\s]+$/, "").trim(),
      start: "",
      end: cleanDate(single[1]),
      matched: true,
    };
  }
  return { prefix: text.trim(), start: "", end: "", matched: false };
}

function cleanDate(value: string): string {
  return value.replace(/^Expected\s+/i, "").replace(/\.(?=\s|$)/g, "").trim();
}

function looksLikeLocationColumn(value: string): boolean {
  if (/^Remote(?:\s*[-–—/]\s*[A-Za-z ]+)?$/i.test(value)) return true;
  return /^[^|,]{1,50},\s*[^|,]{2,50}(?:\s+and\s+[^|,]{1,50},\s*[^|,]{2,50})?$/i.test(value);
}

function splitTrailingLocation(text: string): { prefix: string; location: string } {
  const columns = text.split(/\s+\|\s+/);
  if (columns.length > 1) {
    const lastColumn = columns.at(-1)?.trim() ?? "";
    if (looksLikeLocationColumn(lastColumn)) {
      return { prefix: columns.slice(0, -1).join(" | ").trim(), location: lastColumn };
    }
  }
  const match = text.match(/(?:^|\s)([A-Z][A-Za-z.'-]*,\s*[A-Z]{2}|Remote(?:\s*[-–—/]\s*[A-Za-z ]+)?)[|,;\s]*$/);
  if (!match || match.index === undefined) return { prefix: text.trim(), location: "" };
  const leadingSpace = match[0].length - match[0].trimStart().length;
  return {
    prefix: text.slice(0, match.index + leadingSpace).replace(/[|,;\s]+$/, "").trim(),
    location: match[1].trim(),
  };
}

function findEmail(text: string): string {
  return text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/)?.[0] ?? "";
}

function findPhone(text: string): string {
  return text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] ?? "";
}

function findLocation(text: string): string {
  return text.match(/[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*,\s*[A-Z]{2}/)?.[0] ?? "";
}

function isBulletLine(line: string): boolean {
  return BULLET_PREFIX.test(line.trim()) || /^\d+[.)]\s+/.test(line.trim());
}

function cleanBullet(line: string): string {
  return line.trim().replace(BULLET_PREFIX, "").replace(/^\d+[.)]\s+/, "").trim();
}

function joinWrappedText(previous: string, continuation: string): string {
  const next = continuation.trim();
  if (!previous) return next;
  if (previous.endsWith("-") && /^[a-z]/.test(next)) {
    return `${previous.slice(0, -1)}${next}`;
  }
  return `${previous} ${next}`.replace(/\s+/g, " ").trim();
}

function appendBulletContinuation(bullets: string[], line: string): boolean {
  if (!bullets.length) return false;
  bullets[bullets.length - 1] = joinWrappedText(bullets[bullets.length - 1], line);
  return true;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/[),.;]+$/, "");
  if (!trimmed) return "";
  if (/^(?:mailto|tel):/i.test(trimmed)) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function displayedUrls(text: string): string[] {
  const withoutEmails = text.replace(/[\w.+-]+@[\w.-]+\.\w{2,}/g, "");
  const matches = withoutEmails.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(?:\/[^\s|]*)?/gi) ?? [];
  return matches.map(normalizeUrl);
}

function contactUrl(text: string, links: PdfLink[], kind: "linkedin" | "github" | "website"): string {
  const candidates = [...displayedUrls(text), ...links.map((link) => normalizeUrl(link.url))];
  if (kind === "linkedin") return candidates.find((url) => /linkedin\.com\/in\//i.test(url)) ?? "";
  if (kind === "github") return candidates.find((url) => /github\.com\//i.test(url)) ?? "";
  return candidates.find((url) =>
    /^https?:\/\//i.test(url)
    && !/(?:linkedin|github)\.com/i.test(url)
  ) ?? "";
}

function normalizeSpacedCapitalName(value: string): string {
  const words = value.trim().split(/\s+/);
  const normalized: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const next = words[index + 1];
    if (/^[A-Z]$/.test(word) && next && /^[A-Z]{2,}$/.test(next)) {
      normalized.push(`${word}${next}`);
      index += 1;
    } else {
      normalized.push(word);
    }
  }
  return normalized.join(" ");
}

function findName(lines: string[]): string {
  for (const line of lines) {
    if (findEmail(line) || findPhone(line) || displayedUrls(line).length > 0) continue;
    if (/\bresumes?\b/i.test(line)) continue;
    if (/[|•☞,:]/.test(line) || /\d/.test(line) || line.length > 60) continue;
    const normalized = normalizeSpacedCapitalName(line);
    const words = normalized.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;
    if (!words.every((word) => /^[A-Za-z][A-Za-z.'-]*$/.test(word))) continue;
    return normalized;
  }
  return "";
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function looksLikeRoleTitle(text: string): boolean {
  return /\b(?:engineer|developer|researcher|scientist|analyst|designer|architect|manager|lead|director|consultant|specialist|assistant|associate|intern|founder|teacher|instructor|advisor|treasurer|member|editor|caller)\b/i.test(text);
}

function parseExperience(lines: string[]): ResumeProfile["experience"] {
  const experience: ResumeProfile["experience"] = [];
  let company = "";
  let location = "";
  let current: ResumeProfile["experience"][number] | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isBulletLine(line)) {
      if (current) current.bullets.push(cleanBullet(line));
      continue;
    }

    const dated = splitTrailingDate(line);
    if (dated.matched) {
      const located = splitTrailingLocation(dated.prefix);
      let title = located.prefix;
      let roleCompany = company;
      const roleLocation = located.location || location;
      const parts = title.split(/\s+\|\s+|\s+[–—-]\s+/).filter(Boolean);

      if (parts.length > 1 && looksLikeRoleTitle(parts[0])) {
        title = parts.shift() ?? "";
        roleCompany = parts.join(" – ");
      } else if (!roleCompany && parts.length > 1) {
        roleCompany = parts.shift() ?? "";
        title = parts.join(" – ");
      }

      current = {
        id: genId(),
        company: roleCompany,
        title,
        location: roleLocation,
        startDate: dated.start,
        endDate: dated.end,
        bullets: [],
      };
      experience.push(current);
      continue;
    }

    const located = splitTrailingLocation(line);
    const nextIsDated = index + 1 < lines.length && splitTrailingDate(lines[index + 1]).matched;
    const looksLikeCompanyLine = nextIsDated && /^[A-Z]/.test(line) && line.length < 100;
    if (located.location || looksLikeCompanyLine) {
      company = located.prefix;
      location = located.location;
      continue;
    }

    if (current && appendBulletContinuation(current.bullets, line)) continue;
    if (current) {
      current.bullets.push(line.trim());
      continue;
    }
    if (!company) company = line;
  }

  return experience.filter((entry) => entry.title || entry.bullets.length);
}

function parseProjects(lines: string[]): ResumeProfile["projects"] {
  const projects: ResumeProfile["projects"] = [];
  let current: ResumeProfile["projects"][number] | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isBulletLine(line)) {
      if (current) current.bullets.push(cleanBullet(line));
      continue;
    }

    const dated = splitTrailingDate(line);
    const located = splitTrailingLocation(dated.prefix);
    const nextDated = index + 1 < lines.length
      ? splitTrailingDate(lines[index + 1])
      : null;
    const usesFollowingDetailLine = !dated.matched
      && Boolean(nextDated?.matched)
      && Boolean(located.location);
    if (!dated.matched && !usesFollowingDetailLine && current && appendBulletContinuation(current.bullets, line)) continue;

    const heading = located.prefix;
    const url = displayedUrls(heading)[0] ?? "";
    const withoutUrl = url
      ? heading.replace(new RegExp(url.replace(/^https?:\/\//i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")
      : heading;
    const name = withoutUrl.split(/\s+[–—-]\s+|\s+\|\s+/)[0].replace(/[|,;\s]+$/, "").trim();
    const projectDate = usesFollowingDetailLine && nextDated
      ? nextDated
      : dated;

    current = {
      id: genId(),
      name: name || heading,
      url,
      date: projectDate.start && projectDate.end
        ? `${projectDate.start} – ${projectDate.end}`
        : projectDate.end,
      bullets: [],
    };
    projects.push(current);
    if (usesFollowingDetailLine) index += 1;
  }

  return projects.filter((entry) => entry.name || entry.bullets.length);
}

function parseSkills(lines: string[]): ResumeProfile["skills"] {
  const skills: ResumeProfile["skills"] = [];
  for (const line of lines) {
    const clean = isBulletLine(line) ? cleanBullet(line) : line.trim();
    const colon = clean.match(/^([^:]{1,40}):\s*(.+)$/);
    if (colon) {
      skills.push({ category: colon[1].trim(), items: colon[2].trim() });
    } else if (skills.length) {
      skills[skills.length - 1].items = joinWrappedText(skills[skills.length - 1].items, clean);
    } else if (clean) {
      skills.push({ category: "Skills", items: clean });
    }
  }
  return skills;
}

function looksLikeInstitution(text: string): boolean {
  return /\b(?:university|college|school|institute|academy)\b/i.test(text);
}

function looksLikeDegree(text: string): boolean {
  return /\b(?:bachelor'?s?|master'?s?|doctor|ph\.?d|associate'?s?|certificate|diploma|b\.?a\.?|b\.?s\.?|m\.?a\.?|m\.?s\.?|mcs|mba|jd|md)\b/i.test(text);
}

function looksLikeEducationDetail(text: string): boolean {
  return /^(?:relevant\s+)?(?:coursework|concentration|minor|master[’']?s?\s+thesis|thesis|honors?|activities)\s*:/i.test(text)
    || /^candidate\s+for\s+(?:a\s+)?minor\b/i.test(text);
}

function degreeDetails(text: string): {
  degreeType: DegreeType | undefined;
  fieldOfStudy: string;
  gpa: string;
} {
  const gpaPattern = /(?:[,;]\s*)?GPA\s*:?\s*([0-9](?:\.\d{1,2})?)(?:\s*\/\s*[0-9](?:\.\d{1,2})?)?/i;
  const gpa = text.match(gpaPattern)?.[1] ?? "";
  const degreeText = text
    .replace(gpaPattern, "")
    .replace(/^Candidate\s+for\s+(?:an?\s+)?/i, "")
    .replace(/[|,;\s]+$/, "")
    .trim();
  const degreeType = inferDegreeType(degreeText);
  const fieldOfStudy = inferFieldOfStudy(degreeText, degreeType);
  return {
    degreeType: degreeType || undefined,
    fieldOfStudy,
    gpa,
  };
}

function splitDegreeContent(text: string): { degrees: string[]; minors: string[] } {
  const segments = text
    .split(/\s+\|\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const minors = segments
    .filter((segment) => /^minor\b/i.test(segment))
    .map((segment) => segment.replace(/^minor(?:\s+(?:in|of))?\s*/i, "").trim())
    .filter(Boolean);
  const degreeSegments = segments.filter((segment) => looksLikeDegree(segment) && !/^minor\b/i.test(segment));
  const descriptiveDegrees = degreeSegments.filter((segment) => segment.length > 6);
  if (descriptiveDegrees.length > 1) {
    return {
      degrees: descriptiveDegrees.filter((segment) => !/\bexpected\b/i.test(segment)),
      minors,
    };
  }

  const primary = descriptiveDegrees[0] ?? degreeSegments[0] ?? text.trim();
  const repeated = primary
    .split(/[,;]\s*(?=(?:b\.?\s*(?:a|s|eng)\.?|bachelor'?s?)\b)/i)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return { degrees: repeated.length > 1 ? repeated : [primary], minors };
}

function dateSortKey(value: string): number {
  const year = Number(value.match(/(?:19|20)\d{2}/)?.[0] ?? 0);
  const monthName = value.match(new RegExp(MONTH, "i"))?.[0]?.slice(0, 3).toLowerCase() ?? "";
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  return year * 12 + Math.max(0, months.indexOf(monthName));
}

function earlierDate(current: string, candidate: string): string {
  if (!current) return candidate;
  if (!candidate) return current;
  return dateSortKey(candidate) && dateSortKey(candidate) < dateSortKey(current) ? candidate : current;
}

function laterDate(current: string, candidate: string): string {
  if (!current) return candidate;
  if (!candidate) return current;
  if (/present|current/i.test(candidate)) return "Present";
  if (/present|current/i.test(current)) return "Present";
  return dateSortKey(candidate) > dateSortKey(current) ? candidate : current;
}

function parseEducation(lines: string[]): ResumeProfile["education"] {
  const education: ResumeProfile["education"] = [];
  let institution = "";
  let location = "";
  let institutionDates: Pick<DatedLine, "start" | "end"> = { start: "", end: "" };

  for (let index = 0; index < lines.length; index += 1) {
    const line = isBulletLine(lines[index]) ? cleanBullet(lines[index]) : lines[index];
    const dated = splitTrailingDate(line);
    const located = splitTrailingLocation(dated.prefix);
    const content = located.prefix;

    if (looksLikeInstitution(content) && !looksLikeDegree(content)) {
      institution = content;
      location = located.location;
      institutionDates = { start: dated.start, end: dated.end };
      continue;
    }

    if (!dated.matched && (located.location || (index + 1 < lines.length && looksLikeDegree(lines[index + 1])))) {
      institution = content;
      location = located.location;
      institutionDates = { start: "", end: "" };
      continue;
    }

    if (!institution && !looksLikeDegree(content)) {
      institution = content;
      location = located.location;
      institutionDates = { start: dated.start, end: dated.end };
      continue;
    }

    const standaloneGpa = !looksLikeDegree(content)
      ? content.match(/\bGPA\s*:?\s*([0-9](?:\.\d{1,2})?)(?:\s*\/\s*[0-9](?:\.\d{1,2})?)?/i)?.[1]
      : null;
    if (standaloneGpa) {
      for (let entryIndex = education.length - 1; entryIndex >= 0; entryIndex -= 1) {
        const entry = education[entryIndex];
        if (entry.institution !== institution) break;
        if (!entry.gpa) entry.gpa = standaloneGpa;
      }
      continue;
    }

    if (looksLikeEducationDetail(content)) continue;
    if (!looksLikeDegree(content) && !dated.matched) continue;

    const degreeContent = splitDegreeContent(content);
    const parsedDegrees = degreeContent.degrees.map(degreeDetails);
    const credentials: ResumeProfile["education"][number]["credentials"] = [];
    for (const degree of parsedDegrees) {
      const existing = credentials.find((credential) =>
        credential.degreeType === degree.degreeType
        && degreeContent.degrees.length > 1
        && !content.includes("|")
      );
      if (existing) {
        if (degree.fieldOfStudy) existing.fieldsOfStudy.push(degree.fieldOfStudy);
      } else {
        credentials.push({
          id: genId(),
          degreeType: degree.degreeType,
          fieldsOfStudy: degree.fieldOfStudy ? [degree.fieldOfStudy] : [],
        });
      }
    }
    if (credentials.length > 0) {
      const degreeGpa = parsedDegrees.find((degree) => degree.gpa)?.gpa;
      const startDate = dated.start || institutionDates.start;
      const endDate = dated.end || institutionDates.end;
      const existingEntry = education.find((entry) =>
        entry.institution.trim().toLowerCase() === institution.trim().toLowerCase()
      );
      if (existingEntry) {
        existingEntry.credentials.push(...credentials);
        existingEntry.minors = [...new Set([...existingEntry.minors, ...degreeContent.minors])];
        existingEntry.location ||= located.location || location;
        existingEntry.startDate = earlierDate(existingEntry.startDate, startDate);
        existingEntry.endDate = laterDate(existingEntry.endDate, endDate);
        existingEntry.gpa ||= degreeGpa;
      } else {
        education.push({
          id: genId(),
          institution,
          credentials,
          minors: degreeContent.minors,
          location: located.location || location,
          startDate,
          endDate,
          gpa: degreeGpa,
        });
      }
    }
  }

  return education.filter((entry) => entry.institution || entry.credentials.length > 0);
}

function parseOptionalSection(
  kind: Exclude<SectionType, "experience" | "education" | "projects" | "skills">,
  lines: string[]
): ResumeProfile["optionalSections"][number] | null {
  if (kind === "leadership" || kind === "volunteer") {
    const roles = parseExperience(lines);
    if (roles.length > 0) {
      return {
        kind,
        items: roles.map((role) => ({
          category: [role.title, role.company].filter(Boolean).join(" · "),
          items: [
            role.location,
            [role.startDate, role.endDate].filter(Boolean).join(" – "),
            ...role.bullets,
          ].filter(Boolean).join(" · "),
        })),
      };
    }
  }

  const items = parseSkills(lines);
  if (items.length === 0) return null;
  return { kind, items };
}

export function parseResumeText(text: string, links: PdfLink[] = []): Partial<ResumeProfile> {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const sectionHeaders = lines
    .map((line, index) => ({ type: classifyLine(line), index }))
    .filter((entry): entry is { type: SectionType; index: number } => Boolean(entry.type));
  const firstSectionIndex = sectionHeaders[0]?.index ?? lines.length;
  const headerLines = lines.slice(0, firstSectionIndex);
  const headerText = headerLines.join(" ");
  const contactName = findName(headerLines);

  const contact = {
    name: contactName,
    email: findEmail(headerText),
    phone: findPhone(headerText),
    location: headerLines
      .map((line) => findLocation(line.replace(contactName, "")))
      .find(Boolean) ?? "",
    linkedin: contactUrl(headerText, links, "linkedin"),
    github: contactUrl(headerText, links, "github"),
    website: contactUrl(headerText, links, "website"),
  };

  const experience: ResumeProfile["experience"] = [];
  const education: ResumeProfile["education"] = [];
  const projects: ResumeProfile["projects"] = [];
  const skills: ResumeProfile["skills"] = [];
  const optionalSections: ResumeProfile["optionalSections"] = [];

  for (let sectionIndex = 0; sectionIndex < sectionHeaders.length; sectionIndex += 1) {
    const section = sectionHeaders[sectionIndex];
    const end = sectionHeaders[sectionIndex + 1]?.index ?? lines.length;
    const sectionLines = lines.slice(section.index + 1, end);
    if (section.type === "experience") experience.push(...parseExperience(sectionLines));
    if (section.type === "education") education.push(...parseEducation(sectionLines));
    if (section.type === "projects") projects.push(...parseProjects(sectionLines));
    if (section.type === "skills") skills.push(...parseSkills(sectionLines));
    if (!["experience", "education", "projects", "skills"].includes(section.type)) {
      const optional = parseOptionalSection(
        section.type as Exclude<SectionType, "experience" | "education" | "projects" | "skills">,
        sectionLines
      );
      if (optional) optionalSections.push(optional);
    }
  }

  return { contact, experience, education, projects, skills, optionalSections };
}
