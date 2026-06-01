export interface ProfileContact {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
}

export interface ProfileProject {
  name: string;
  url: string;
}

interface TypstResumeOptions {
  companyName?: string | null;
  jobTitle?: string | null;
  profileContact?: ProfileContact | null;
  profileProjects?: ProfileProject[] | null;
}

const TEMPLATE_SOURCE = `
#let resume(
  author: "",
  location: "",
  email: "",
  github: "",
  linkedin: "",
  phone: "",
  personal-site: "",
  accent-color: "#000000",
  font: "Inter",
  paper: "us-letter",
  author-font-size: 20pt,
  font-size: 10pt,
  body,
) = {
  set document(author: author, title: author)
  set text(font: font, size: font-size, lang: "en", ligatures: false)
  set page(margin: (x: 0.5in, y: 0.4in), paper: paper)
  set par(leading: 0.52em)
  show link: underline
  show heading.where(level: 2): it => [
    #pad(top: 2pt, bottom: -10pt, [#smallcaps(it.body)])
    #line(length: 100%, stroke: 1pt)
  ]
  show heading: set text(fill: rgb(accent-color))
  show link: set text(fill: rgb(accent-color))
  show heading.where(level: 1): it => [
    #set align(left)
    #set text(weight: 700, size: author-font-size)
    #pad(it.body)
  ]

  [= #(author)]

  let contact-item(value, prefix: "", link-type: "") = {
    if value != "" {
      if link-type != "" {
        link(link-type + value)[#(prefix + value)]
      } else {
        value
      }
    }
  }

  pad(
    top: 0.25em,
    align(left)[
      #{
        let items = (
          contact-item(phone, link-type: "tel:"),
          contact-item(location),
          contact-item(email, link-type: "mailto:"),
          contact-item(github, link-type: "https://"),
          contact-item(linkedin, link-type: "https://"),
          contact-item(personal-site, link-type: "https://"),
        )
        items.filter(x => x != none).join(" | ")
      }
    ],
  )

  set par(justify: true)
  set list(spacing: 4pt)
  body
}

#let dates-helper(start-date: "", end-date: "") = {
  if start-date == "" { end-date }
  else { start-date + " " + sym.dash.em + " " + end-date }
}

#let generic-two-by-two(top-left: "", top-right: "", bottom-left: "", bottom-right: "") = {
  [
    #top-left #h(1fr) #top-right \\
    #bottom-left #h(1fr) #bottom-right
  ]
}

#let generic-one-by-two(left: "", right: "") = {
  [#left #h(1fr) #right]
}

#let edu(institution: "", dates: "", degree: "", gpa: "", location: "") = {
  generic-two-by-two(
    top-left: strong(institution),
    top-right: location,
    bottom-left: emph(degree),
    bottom-right: emph(dates),
  )
}

#let work(title: "", dates: "", company: "", location: "") = {
  generic-two-by-two(
    top-left: strong(company),
    top-right: dates,
    bottom-left: emph(title),
    bottom-right: emph(location),
  )
}

#let project(role: "", name: "", url: "", dates: "") = {
  generic-one-by-two(
    left: {
      if role == "" {
        [*#name* #if url != "" and dates != "" [ (#link("https://" + url)[#url])]]
      } else {
        [*#name* -- #role #if url != "" [ (#link("https://" + url)[#url])]]
      }
    },
    right: {
      if dates == "" and url != "" { link("https://" + url)[#url] }
      else { dates }
    },
  )
}

#let extracurriculars(activity: "", dates: "") = {
  generic-one-by-two(left: strong(activity), right: dates)
}
`.trim();

type SectionKind = "work" | "education" | "projects" | "skills" | "other";

const WORK_KEYWORDS = new Set([
  "work experience", "experience", "employment", "professional experience",
]);
const EDU_KEYWORDS = new Set(["education"]);
const PROJECT_KEYWORDS = new Set(["projects", "personal projects", "side projects"]);
const SKILLS_KEYWORDS = new Set([
  "skills", "technical skills", "programming skills",
  "leadership", "leadership & affiliations", "affiliations",
  "certifications", "awards", "honors", "activities",
  "extracurricular", "volunteer", "interests", "languages",
]);

function classifySection(heading: string): SectionKind {
  const lower = heading.toLowerCase().replace(/[^a-z &]/g, "").trim();
  if (WORK_KEYWORDS.has(lower)) return "work";
  if (EDU_KEYWORDS.has(lower)) return "education";
  if (PROJECT_KEYWORDS.has(lower)) return "projects";
  if (SKILLS_KEYWORDS.has(lower)) return "skills";
  return "other";
}

function escapeTypst(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/%/g, "\\%")
    .replace(/&/g, "\\&")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/@/g, "\\@");
}

export function convertInlineToTypst(input: string): string {
  let result = input;

  const placeholders: { placeholder: string; typst: string }[] = [];
  let idx = 0;

  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    const placeholder = `\x00P${idx++}\x00`;
    placeholders.push({ placeholder, typst: `#link("${url}")[${text}]` });
    return placeholder;
  });

  result = result.replace(/\*\*([^*]+)\*\*/g, (_m, text) => {
    const placeholder = `\x00P${idx++}\x00`;
    placeholders.push({ placeholder, typst: `*${escapeTypst(text)}*` });
    return placeholder;
  });
  result = result.replace(/__([^_]+)__/g, (_m, text) => {
    const placeholder = `\x00P${idx++}\x00`;
    placeholders.push({ placeholder, typst: `*${escapeTypst(text)}*` });
    return placeholder;
  });

  result = result.replace(/\*([^*]+)\*/g, (_m, text) => {
    const placeholder = `\x00P${idx++}\x00`;
    placeholders.push({ placeholder, typst: `_${escapeTypst(text)}_` });
    return placeholder;
  });
  result = result.replace(/_([^_]+)_/g, (_m, text) => {
    const placeholder = `\x00P${idx++}\x00`;
    placeholders.push({ placeholder, typst: `_${escapeTypst(text)}_` });
    return placeholder;
  });

  result = escapeRemainingTypst(result);

  for (const { placeholder, typst } of placeholders) {
    result = result.replace(placeholder, typst);
  }

  return result;
}

function escapeRemainingTypst(input: string): string {
  return input.replace(/([#$%&@\\])/g, (ch) => {
    if (ch === "\\") return "\\\\";
    return "\\" + ch;
  });
}

function stripMarkdownPlain(input: string): string {
  return input
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

interface HeaderInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
  github: string;
  linkedin: string;
  website: string;
}

interface EntryFields {
  name: string;
  location: string;
  dates: string;
  title: string;
  url: string;
  role: string;
}

function isHeading(line: string): string | null {
  const md = line.match(/^#{1,4}\s+(.+)$/);
  if (md) return stripMarkdownPlain(md[1]).replace(/:$/, "");
  return null;
}

function isBullet(line: string): string | null {
  const m = line.match(/^[-*\u2022]\s+(.+)$/);
  return m ? m[1] : null;
}

function isEntryLine(line: string): boolean {
  return /^\*\*[^*]+\*\*/.test(line) && line.includes("|");
}

function isSubentryLine(line: string): boolean {
  return /^\*[^*]+\*$/.test(line.trim());
}

function isSkillLine(line: string): boolean {
  return /^\*\*[^*]+\*\*\s*:/.test(line);
}

function parseEntryLine(line: string): { name: string; parts: string[] } {
  const stripped = line.replace(/^\*\*([^*]+)\*\*/, "");
  const nameMatch = line.match(/^\*\*([^*]+)\*\*/);
  const name = nameMatch ? nameMatch[1].trim() : "";
  const parts = stripped.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
  return { name, parts };
}

function extractLinkUrl(text: string): string {
  const m = text.match(/\[([^\]]*)\]\(([^)]+)\)/);
  return m ? m[2] : "";
}

function extractLinkText(text: string): string {
  return text.replace(/\[([^\]]*)\]\(([^)]+)\)/g, "$1");
}

function looksLikeDates(text: string): boolean {
  return /\d{4}|present|current/i.test(text);
}

function looksLikeLocation(text: string): boolean {
  return /[A-Z][a-z]+.*,\s*[A-Z]{2}/.test(text);
}

function parseWorkEntry(line: string, nextLine: string | undefined): { fields: EntryFields; consumedNext: boolean } {
  const { name, parts } = parseEntryLine(line);
  const fields: EntryFields = { name, location: "", dates: "", title: "", url: "", role: "" };

  for (const part of parts) {
    const plain = stripMarkdownPlain(part);
    if (!fields.dates && looksLikeDates(plain)) {
      fields.dates = plain;
    } else if (!fields.location && looksLikeLocation(plain)) {
      fields.location = plain;
    } else if (!fields.location) {
      fields.location = plain;
    }
  }

  let consumedNext = false;
  if (nextLine && isSubentryLine(nextLine.trim())) {
    fields.title = nextLine.trim().replace(/^\*/, "").replace(/\*$/, "").trim();
    consumedNext = true;
  }

  return { fields, consumedNext };
}

function parseEduEntry(line: string, nextLine: string | undefined): { fields: EntryFields; consumedNext: boolean } {
  const { name, parts } = parseEntryLine(line);
  const fields: EntryFields = { name, location: "", dates: "", title: "", url: "", role: "" };

  for (const part of parts) {
    const plain = stripMarkdownPlain(part);
    if (!fields.dates && looksLikeDates(plain)) {
      fields.dates = plain;
    } else if (!fields.location && looksLikeLocation(plain)) {
      fields.location = plain;
    } else if (!fields.location) {
      fields.location = plain;
    }
  }

  let consumedNext = false;
  if (nextLine && isSubentryLine(nextLine.trim())) {
    fields.title = nextLine.trim().replace(/^\*/, "").replace(/\*$/, "").trim();
    consumedNext = true;
  }

  return { fields, consumedNext };
}

function parseProjectEntry(line: string): EntryFields {
  const fields: EntryFields = { name: "", location: "", dates: "", title: "", url: "", role: "" };

  const nameMatch = line.match(/^\*\*([^*]+)\*\*/);
  const rawName = nameMatch ? nameMatch[1].trim() : "";
  fields.name = rawName;

  let afterBold = line.replace(/^\*\*[^*]+\*\*/, "").trim();

  const dashPrefix = afterBold.match(/^--\s*(.*)$/);
  if (dashPrefix) {
    afterBold = dashPrefix[1];
  }

  const parts = afterBold.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
  const roleParts: string[] = [];

  for (const part of parts) {
    const url = extractLinkUrl(part);
    if (url && !fields.url) {
      fields.url = url.replace(/^https?:\/\//, "");
      continue;
    }
    const plain = stripMarkdownPlain(part);
    if (!fields.dates && looksLikeDates(plain)) {
      fields.dates = plain;
    } else if (plain) {
      roleParts.push(plain);
    }
  }

  fields.role = roleParts.join(" | ");
  return fields;
}

function extractHeader(lines: string[]): { header: HeaderInfo; bodyStart: number } {
  const header: HeaderInfo = { name: "", email: "", phone: "", location: "", github: "", linkedin: "", website: "" };
  let i = 0;

  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) return { header, bodyStart: 0 };

  const firstLine = lines[i].trim();
  const heading = isHeading(firstLine);
  if (heading) {
    header.name = heading;
    i++;
  } else {
    header.name = stripMarkdownPlain(firstLine);
    i++;
  }

  while (i < lines.length && !lines[i].trim()) i++;

  if (i < lines.length && !isHeading(lines[i].trim())) {
    const contactLine = lines[i].trim();
    const tokens = contactLine.split(/\s*\|\s*/).map(t => t.trim()).filter(Boolean);

    for (const tok of tokens) {
      const url = extractLinkUrl(tok);
      const text = extractLinkText(tok).trim().toLowerCase();

      if (url && url.includes("mailto:")) {
        header.email = url.replace("mailto:", "");
      } else if (!url && /\S+@\S+\.\S+/.test(tok)) {
        header.email = tok;
      } else if (/^[\d(+][\d\s().-]{7,}$/.test(stripMarkdownPlain(tok))) {
        header.phone = stripMarkdownPlain(tok);
      } else if (url && /github/i.test(url)) {
        header.github = url.replace(/^https?:\/\//, "");
      } else if (text === "github" || /github\.com/i.test(tok)) {
        header.github = (url || stripMarkdownPlain(tok)).replace(/^https?:\/\//, "");
      } else if (url && /linkedin/i.test(url)) {
        header.linkedin = url.replace(/^https?:\/\//, "");
      } else if (text === "linkedin" || /linkedin\.com/i.test(tok)) {
        header.linkedin = (url || stripMarkdownPlain(tok)).replace(/^https?:\/\//, "");
      } else if (url) {
        header.website = url.replace(/^https?:\/\//, "");
      } else if (/[A-Z][a-z]+.*,\s*[A-Z]{2}/.test(tok)) {
        header.location = tok;
      } else if (!header.location && /^[A-Z][a-z]/.test(tok) && tok.length < 40) {
        header.location = tok;
      }
    }
    i++;
  }

  while (i < lines.length && !lines[i].trim()) i++;

  return { header, bodyStart: i };
}

export function buildTypstResume(markdown: string, options: TypstResumeOptions = {}): string {
  const rawLines = markdown.replace(/\r/g, "").split("\n");
  const { header, bodyStart } = extractHeader(rawLines);

  const pc = options.profileContact;
  const finalName = pc?.name || header.name || "Resume";
  const finalLocation = pc?.location || header.location;
  const finalEmail = pc?.email || header.email;
  const finalPhone = pc?.phone || header.phone;
  const rawGh = pc?.github || header.github || "";
  const finalGithub = rawGh
    ? rawGh.replace(/^https?:\/\//, "").replace(/^github\.com\//i, "github.com/").replace(/^(?!github\.com\/)/, "github.com/")
    : "";
  const rawLi = pc?.linkedin || header.linkedin || "";
  const finalLinkedin = rawLi
    ? rawLi.replace(/^https?:\/\//, "").replace(/^linkedin\.com\/in\//i, "linkedin.com/in/").replace(/^(?!linkedin\.com\/in\/)/, "linkedin.com/in/")
    : "";
  const finalWebsite = (pc?.website || header.website || "").replace(/^https?:\/\//, "");

  const projectUrlMap = new Map<string, string>();
  if (options.profileProjects) {
    for (const p of options.profileProjects) {
      if (p.name && p.url) {
        projectUrlMap.set(p.name.toLowerCase(), p.url.replace(/^https?:\/\//, ""));
      }
    }
  }

  const output: string[] = [
    `// Tailored for ${options.companyName ?? "job"} – ${options.jobTitle ?? "role"}`,
    "",
    TEMPLATE_SOURCE,
    "",
    `#show: resume.with(`,
    `  author: ${JSON.stringify(finalName)},`,
  ];

  if (finalLocation) output.push(`  location: ${JSON.stringify(finalLocation)},`);
  if (finalEmail) output.push(`  email: ${JSON.stringify(finalEmail)},`);
  if (finalPhone) output.push(`  phone: ${JSON.stringify(finalPhone)},`);
  if (finalGithub) output.push(`  github: ${JSON.stringify(finalGithub)},`);
  if (finalLinkedin) output.push(`  linkedin: ${JSON.stringify(finalLinkedin)},`);
  if (finalWebsite) output.push(`  personal-site: ${JSON.stringify(finalWebsite)},`);
  output.push(`  font: "Inter",`);
  output.push(`)`, "");

  let currentSection: SectionKind = "other";
  let i = bodyStart;

  while (i < rawLines.length) {
    const line = rawLines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    const heading = isHeading(line);
    if (heading) {
      output.push("");
      output.push(`== ${heading}`);
      currentSection = classifySection(heading);
      i++;
      continue;
    }

    if (currentSection === "work" && isEntryLine(line)) {
      const nextLine = i + 1 < rawLines.length ? rawLines[i + 1] : undefined;
      const { fields, consumedNext } = parseWorkEntry(line, nextLine);
      output.push(`#work(company: "${escapeTypst(fields.name)}", title: "${escapeTypst(fields.title)}", dates: "${escapeTypst(fields.dates)}", location: "${escapeTypst(fields.location)}")`);
      i += consumedNext ? 2 : 1;
      continue;
    }

    if (currentSection === "education" && isEntryLine(line)) {
      const nextLine = i + 1 < rawLines.length ? rawLines[i + 1] : undefined;
      const { fields, consumedNext } = parseEduEntry(line, nextLine);
      output.push(`#edu(institution: "${escapeTypst(fields.name)}", degree: "${escapeTypst(fields.title)}", dates: "${escapeTypst(fields.dates)}", location: "${escapeTypst(fields.location)}")`);
      i += consumedNext ? 2 : 1;
      continue;
    }

    if (currentSection === "projects" && isEntryLine(line)) {
      const fields = parseProjectEntry(line);
      if (!fields.url && projectUrlMap.has(fields.name.toLowerCase())) {
        fields.url = projectUrlMap.get(fields.name.toLowerCase())!;
      }
      const urlArg = fields.url ? `, url: "${escapeTypst(fields.url)}"` : "";
      const datesArg = fields.dates ? `, dates: "${escapeTypst(fields.dates)}"` : "";
      output.push(`#project(name: "${escapeTypst(fields.name)}", role: "${escapeTypst(fields.role)}"${urlArg}${datesArg})`);
      i++;
      continue;
    }

    if (currentSection === "skills" && isSkillLine(line)) {
      const m = line.match(/^\*\*([^*]+)\*\*\s*:\s*(.+)$/);
      if (m) {
        output.push(`*${escapeTypst(m[1])}*: ${escapeTypst(m[2])}`);
      }
      i++;
      continue;
    }

    const bulletText = isBullet(line);
    if (bulletText) {
      output.push(`- ${convertInlineToTypst(bulletText)}`);
      i++;
      continue;
    }

    if (isSubentryLine(line) && currentSection !== "work" && currentSection !== "education") {
      const text = line.replace(/^\*/, "").replace(/\*$/, "").trim();
      output.push(`_${escapeTypst(text)}_`);
      i++;
      continue;
    }

    output.push(convertInlineToTypst(line));
    i++;
  }

  return output.join("\n").trim() + "\n";
}

export function typstResumeFileName(companyName?: string | null, jobTitle?: string | null): string {
  const parts = [companyName, jobTitle].filter(Boolean);
  const slug = parts.length > 0
    ? [...parts, "resume"].join(" ").toLowerCase().replace(/[^\w ]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80)
    : "tailored-resume";
  return `${slug || "tailored-resume"}.pdf`;
}
