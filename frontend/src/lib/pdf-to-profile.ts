import type { ResumeProfile } from "./api";

async function extractPdfText(file: File): Promise<{ text: string; links: Array<{ url: string }> }> {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const allText: string[] = [];
  const allLinks: Array<{ url: string }> = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const annotations = await page.getAnnotations();

    const lines: string[] = [];
    let lastY: number | null = null;
    let currentLine = "";

    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const y = Math.round((item as any).transform?.[5] ?? 0);
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = "";
      }
      currentLine += item.str + " ";
      lastY = y;
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    allText.push(lines.join("\n"));

    for (const ann of annotations) {
      if (ann.subtype === "Link" && ann.url) {
        allLinks.push({ url: ann.url });
      }
    }
  }

  await pdf.destroy();
  return { text: allText.join("\n\n"), links: allLinks };
}

const SECTION_PATTERNS: Record<string, RegExp> = {
  experience: /^(work\s*)?experience|employment/i,
  education: /^education/i,
  projects: /^projects?/i,
  skills: /^(technical\s*)?skills|programming\s*skills/i,
  leadership: /^leadership|affiliations|activities/i,
  certifications: /^certifications?/i,
  publications: /^publications?/i,
  awards: /^awards?|honors?/i,
};

function classifyLine(line: string): string | null {
  const clean = line.replace(/[^a-zA-Z\s&]/g, "").trim();
  if (clean.length < 3 || clean.length > 50) return null;
  for (const [section, pattern] of Object.entries(SECTION_PATTERNS)) {
    if (pattern.test(clean)) return section;
  }
  return null;
}

function looksLikeDate(text: string): boolean {
  return /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}|present|current)\b/i.test(text);
}

function extractDateRange(text: string): { start: string; end: string } {
  const m = text.match(/((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*)?(?:\d{4}))[\s\-–—]+((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*)?(?:\d{4}|Present|Current))/i);
  if (m) return { start: m[1].trim(), end: m[2].trim() };
  const single = text.match(/((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*)?\d{4})/i);
  if (single) return { start: "", end: single[1].trim() };
  return { start: "", end: "" };
}

function findEmail(text: string): string {
  const m = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  return m ? m[0] : "";
}

function findPhone(text: string): string {
  const m = text.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  return m ? m[0] : "";
}

function findLocation(text: string): string {
  const m = text.match(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)?,\s*[A-Z]{2}/);
  return m ? m[0] : "";
}

function isBulletLine(line: string): boolean {
  return /^[\-•●◦▪]\s/.test(line.trim()) || /^\d+\.\s/.test(line.trim());
}

function cleanBullet(line: string): string {
  return line.trim().replace(/^[\-•●◦▪]\s*/, "").replace(/^\d+\.\s*/, "").trim();
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function parsePdfToProfile(file: File): Promise<Partial<ResumeProfile>> {
  const { text, links } = await extractPdfText(file);
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const email = findEmail(text);
  const phone = findPhone(text);
  const location = findLocation(text);
  const linkedin = links.find(l => /linkedin\.com/i.test(l.url))?.url ?? "";
  const github = links.find(l => /github\.com/i.test(l.url))?.url ?? "";
  const website = links.find(l => !(/linkedin|github|mailto/i.test(l.url)) && /^https?:\/\//i.test(l.url))?.url ?? "";

  let name = "";
  if (lines[0] && !findEmail(lines[0]) && !findPhone(lines[0]) && lines[0].length < 40 && !classifyLine(lines[0])) {
    name = lines[0];
  }

  const contact = { name, email, phone, location, linkedin, github, website };

  const sections: Array<{ type: string; startIdx: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const sectionType = classifyLine(lines[i]);
    if (sectionType) {
      sections.push({ type: sectionType, startIdx: i });
    }
  }

  const experience: ResumeProfile["experience"] = [];
  const education: ResumeProfile["education"] = [];
  const projects: ResumeProfile["projects"] = [];
  const skills: ResumeProfile["skills"] = [];

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    const endIdx = sIdx + 1 < sections.length ? sections[sIdx + 1].startIdx : lines.length;
    const sectionLines = lines.slice(section.startIdx + 1, endIdx);

    if (section.type === "experience") {
      let current: (typeof experience)[number] | null = null;
      for (const line of sectionLines) {
        if (isBulletLine(line)) {
          if (current) current.bullets.push(cleanBullet(line));
        } else if (looksLikeDate(line) && !current?.company) {
          if (current) {
            const dates = extractDateRange(line);
            current.startDate = dates.start;
            current.endDate = dates.end;
            const loc = findLocation(line);
            if (loc) current.location = loc;
          }
        } else if (line.length > 2 && line.length < 80 && !isBulletLine(line)) {
          if (current) experience.push(current);
          const dates = extractDateRange(line);
          const loc = findLocation(line);
          current = { id: genId(), company: line.replace(/[\|,].*$/, "").trim(), title: "", location: loc, startDate: dates.start, endDate: dates.end, bullets: [] };
        }
      }
      if (current) experience.push(current);
    }

    if (section.type === "education") {
      let current: (typeof education)[number] | null = null;
      for (const line of sectionLines) {
        if (line.length > 2 && line.length < 100) {
          const dates = extractDateRange(line);
          const loc = findLocation(line);
          if (!current) {
            current = { id: genId(), institution: line.replace(/[\|,].*$/, "").trim(), degree: "", location: loc, startDate: dates.start, endDate: dates.end, gpa: "" };
          } else if (!current.degree && !dates.end) {
            current.degree = line.trim();
          } else {
            education.push(current);
            current = { id: genId(), institution: line.replace(/[\|,].*$/, "").trim(), degree: "", location: loc, startDate: dates.start, endDate: dates.end, gpa: "" };
          }
        }
      }
      if (current) education.push(current);
    }

    if (section.type === "projects") {
      let current: (typeof projects)[number] | null = null;
      for (const line of sectionLines) {
        if (isBulletLine(line)) {
          if (current) current.bullets.push(cleanBullet(line));
        } else if (line.length > 2 && line.length < 80) {
          if (current) projects.push(current);
          current = { id: genId(), name: line.replace(/[\|–\-].*$/, "").trim(), role: "", teamInfo: "", url: "", bullets: [] };
        }
      }
      if (current) projects.push(current);
    }

    if (section.type === "skills") {
      for (const line of sectionLines) {
        const colonSplit = line.match(/^([^:]+):\s*(.+)$/);
        if (colonSplit) {
          skills.push({ category: colonSplit[1].trim(), items: colonSplit[2].trim() });
        }
      }
    }
  }

  return { contact, experience, education, projects, skills, optionalSections: [] };
}
