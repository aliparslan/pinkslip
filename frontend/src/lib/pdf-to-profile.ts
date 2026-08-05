import type { ResumeProfile } from "../../../shared/resume-profile";
import {
  formatDegree,
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
const DATE = `(?:${MONTH}\\.?\\s+)?\\d{4}`;
const DATE_RANGE_AT_END = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(Present|Current|${DATE})\\s*$`, "i");
const SINGLE_DATE_AT_END = new RegExp(`(${DATE})\\s*$`, "i");

const SECTION_PATTERNS: Array<[SectionType, RegExp]> = [
  ["experience", /^(?:(?:work|professional)\s+)?experience$|^employment(?:\s+history)?$/i],
  ["education", /^education(?:\s+and\s+training)?$/i],
  ["projects", /^(?:selected\s+)?projects?$/i],
  ["skills", /^(?:technical\s+|programming\s+)?skills$/i],
  ["leadership", /^(?:leadership|affiliations|activities)(?:\s+and\s+affiliations)?$/i],
  ["certifications", /^certifications?(?:\s+and\s+licenses)?$/i],
  ["publications", /^publications?$/i],
  ["awards", /^(?:awards?|honors?)(?:\s+and\s+(?:awards?|honors?))?$/i],
  ["volunteer", /^volunteer(?:\s+experience)?$/i],
];

function textItemValue(item: unknown): { str: string; x: number; y: number; width: number } | null {
  if (!item || typeof item !== "object" || !("str" in item)) return null;
  const candidate = item as { str?: unknown; transform?: unknown; width?: unknown };
  if (typeof candidate.str !== "string" || !candidate.str.trim()) return null;
  const transform = Array.isArray(candidate.transform) ? candidate.transform : [];
  return {
    str: candidate.str,
    x: typeof transform[4] === "number" ? transform[4] : 0,
    y: typeof transform[5] === "number" ? transform[5] : 0,
    width: typeof candidate.width === "number" ? candidate.width : 0,
  };
}

async function extractPdfText(file: File): Promise<{ text: string; links: PdfLink[] }> {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import("pdfjs-dist"),
    // @ts-ignore Vite resolves the worker URL import in the browser build.
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const allText: string[] = [];
  const allLinks: PdfLink[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const annotations = await page.getAnnotations();
    const rows: Array<{ y: number; items: Array<{ str: string; x: number; width: number }> }> = [];

    for (const rawItem of content.items) {
      const item = textItemValue(rawItem);
      if (!item) continue;
      let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
      if (!row) {
        row = { y: item.y, items: [] };
        rows.push(row);
      }
      row.items.push({ str: item.str, x: item.x, width: item.width });
    }

    rows.sort((a, b) => b.y - a.y);
    const lines = rows.map((row) => {
      const items = row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let previousEnd: number | null = null;
      for (const item of items) {
        const value = item.str.trim();
        if (!value) continue;
        const gap = previousEnd === null ? 0 : item.x - previousEnd;
        if (line) line += gap > 18 ? " | " : " ";
        line += value;
        previousEnd = item.x + item.width;
      }
      return line.replace(/\s+/g, " ").trim();
    }).filter(Boolean);
    allText.push(lines.join("\n"));

    for (const annotation of annotations) {
      if (annotation.subtype === "Link" && annotation.url) {
        allLinks.push({ url: annotation.url });
      }
    }
  }

  await pdf.destroy();
  return { text: allText.join("\n\n"), links: allLinks };
}

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
  const range = DATE_RANGE_AT_END.exec(text);
  if (range) {
    return {
      prefix: text.slice(0, range.index).replace(/[|,;\s]+$/, "").trim(),
      start: range[1].trim(),
      end: /current/i.test(range[2]) ? "Present" : range[2].trim(),
      matched: true,
    };
  }
  const single = SINGLE_DATE_AT_END.exec(text);
  if (single) {
    return {
      prefix: text.slice(0, single.index).replace(/[|,;\s]+$/, "").trim(),
      start: "",
      end: single[1].trim(),
      matched: true,
    };
  }
  return { prefix: text.trim(), start: "", end: "", matched: false };
}

function splitTrailingLocation(text: string): { prefix: string; location: string } {
  const columns = text.split(/\s+\|\s+/);
  if (columns.length > 1) {
    const lastColumn = columns.at(-1)?.trim() ?? "";
    if (/^(?:[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*,\s*[A-Z]{2}|Remote(?:\s*[-–—/]\s*[A-Za-z ]+)?)$/i.test(lastColumn)) {
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
  return /^[\-•●◦▪‣]\s*/.test(line.trim()) || /^\d+[.)]\s+/.test(line.trim());
}

function cleanBullet(line: string): string {
  return line.trim().replace(/^[\-•●◦▪‣]\s*/, "").replace(/^\d+[.)]\s+/, "").trim();
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

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
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

      if (!roleCompany) {
        const parts = title.split(/\s+\|\s+|\s+[–—-]\s+/).filter(Boolean);
        if (parts.length > 1) {
          roleCompany = parts.shift() ?? "";
          title = parts.join(" – ");
        }
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
    if (!company) company = line;
  }

  return experience.filter((entry) => entry.title || entry.bullets.length);
}

function parseProjects(lines: string[]): ResumeProfile["projects"] {
  const projects: ResumeProfile["projects"] = [];
  let current: ResumeProfile["projects"][number] | null = null;

  for (const line of lines) {
    if (isBulletLine(line)) {
      if (current) current.bullets.push(cleanBullet(line));
      continue;
    }

    const dated = splitTrailingDate(line);
    if (!dated.matched && current && appendBulletContinuation(current.bullets, line)) continue;

    const heading = dated.prefix;
    const url = displayedUrls(heading)[0] ?? "";
    const withoutUrl = url
      ? heading.replace(new RegExp(url.replace(/^https?:\/\//i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")
      : heading;
    const name = withoutUrl.split(/\s+[–—-]\s+|\s+\|\s+/)[0].replace(/[|,;\s]+$/, "").trim();

    current = {
      id: genId(),
      name: name || heading,
      url,
      date: dated.start && dated.end ? `${dated.start} – ${dated.end}` : dated.end,
      bullets: [],
    };
    projects.push(current);
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
    }
  }
  return skills;
}

function looksLikeInstitution(text: string): boolean {
  return /\b(?:university|college|school|institute|academy)\b/i.test(text);
}

function looksLikeDegree(text: string): boolean {
  return /\b(?:bachelor|master|doctor|ph\.?d|associate|certificate|diploma|b\.?a\.?|b\.?s\.?|m\.?a\.?|m\.?s\.?|mcs|mba|jd|md)\b/i.test(text);
}

function degreeDetails(text: string): { degree: string; degreeType: ResumeProfile["education"][number]["degreeType"]; fieldOfStudy: string; gpa: string } {
  const gpa = text.match(/(?:,\s*)?GPA\s*:?\s*([0-4](?:\.\d{1,2})?)/i)?.[1] ?? "";
  const degreeText = text.replace(/(?:,\s*)?GPA\s*:?\s*[0-4](?:\.\d{1,2})?/i, "").replace(/[|,;\s]+$/, "").trim();
  const degreeType = inferDegreeType(degreeText);
  const fieldOfStudy = inferFieldOfStudy(degreeText, degreeType);
  return {
    degree: formatDegree(degreeType, fieldOfStudy) || degreeText,
    degreeType: degreeType || undefined,
    fieldOfStudy,
    gpa,
  };
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

    const degree = degreeDetails(content);
    education.push({
      id: genId(),
      institution,
      degree: degree.degree,
      degreeType: degree.degreeType,
      fieldOfStudy: degree.fieldOfStudy,
      location: located.location || location,
      startDate: dated.start || institutionDates.start,
      endDate: dated.end || institutionDates.end,
      gpa: degree.gpa,
    });
  }

  return education.filter((entry) => entry.institution || entry.degree);
}

export function parseResumeText(text: string, links: PdfLink[] = []): Partial<ResumeProfile> {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const sectionHeaders = lines
    .map((line, index) => ({ type: classifyLine(line), index }))
    .filter((entry): entry is { type: SectionType; index: number } => Boolean(entry.type));
  const firstSectionIndex = sectionHeaders[0]?.index ?? lines.length;
  const headerLines = lines.slice(0, firstSectionIndex);
  const headerText = headerLines.join(" ");

  const contact = {
    name: headerLines.find((line) => !findEmail(line) && !findPhone(line) && line.length < 60) ?? "",
    email: findEmail(headerText),
    phone: findPhone(headerText),
    location: findLocation(headerText),
    linkedin: contactUrl(headerText, links, "linkedin"),
    github: contactUrl(headerText, links, "github"),
    website: contactUrl(headerText, links, "website"),
  };

  const experience: ResumeProfile["experience"] = [];
  const education: ResumeProfile["education"] = [];
  const projects: ResumeProfile["projects"] = [];
  const skills: ResumeProfile["skills"] = [];

  for (let sectionIndex = 0; sectionIndex < sectionHeaders.length; sectionIndex += 1) {
    const section = sectionHeaders[sectionIndex];
    const end = sectionHeaders[sectionIndex + 1]?.index ?? lines.length;
    const sectionLines = lines.slice(section.index + 1, end);
    if (section.type === "experience") experience.push(...parseExperience(sectionLines));
    if (section.type === "education") education.push(...parseEducation(sectionLines));
    if (section.type === "projects") projects.push(...parseProjects(sectionLines));
    if (section.type === "skills") skills.push(...parseSkills(sectionLines));
  }

  return { contact, experience, education, projects, skills, optionalSections: [] };
}

export async function parsePdfToProfile(file: File): Promise<Partial<ResumeProfile>> {
  const { text, links } = await extractPdfText(file);
  return parseResumeText(text, links);
}
