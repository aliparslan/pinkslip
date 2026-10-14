import { cleanPersonName, type PersonName } from "./email-pattern";

/* Reading LinkedIn profiles from search-engine results ("X-ray search"), so
 * Pinkslip never visits LinkedIn itself. See docs/recruiter-contacts-sourcing.md. */

export interface SearchResult {
  title: string;
  link: string;
  snippet?: string;
}

export interface LinkedInPerson {
  profileUrl: string;
  slug: string;
  rawName: string;
  name: PersonName | null;
  /** The title's text after the name, e.g. "University Recruiter - Stripe". */
  headline: string;
  snippet: string;
  /** Google's "Experience: …" line, usually the current employer. */
  experience: string | null;
}

const EARLY_CAREER_TITLES = [
  "university recruiter",
  "university recruiting",
  "campus recruiter",
  "campus recruiting",
  "early career recruiter",
  "early careers",
  "early talent",
  "emerging talent",
  "new grad recruiter",
  "intern recruiter",
];

export function earlyCareerQuery(company: string): string {
  return `site:linkedin.com/in (${EARLY_CAREER_TITLES.map((title) => `"${title}"`).join(" OR ")}) "${company}"`;
}

/** Recruiters of any kind, the fallback when a company has no early-career team. */
export function recruiterQuery(company: string): string {
  return `site:linkedin.com/in ("technical recruiter" OR "recruiter" OR "talent acquisition") "${company}"`;
}

/** Pages that show addresses at the domain, to learn its pattern. */
export function addressQuery(domain: string): string {
  return `"@${domain}" -site:${domain}`;
}

export function parseLinkedInResult(result: SearchResult): LinkedInPerson | null {
  const match = /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#]+)/i.exec(result.link);
  if (!match?.[1]) return null;
  const slug = decodeURIComponent(match[1]).toLowerCase();
  const title = result.title.replace(/\s*\|\s*LinkedIn\s*$/i, "").replace(/\s*(?:\.\.\.|…)\s*$/, "").trim();
  const [rawName = "", ...rest] = title.split(/\s+[-–—]\s+/);
  const snippet = (result.snippet ?? "").replace(/\s+/g, " ").trim();
  const experience = /Experience:\s*([^·|\n]+?)\s*(?:·|\||$)/i.exec(snippet)?.[1]?.trim() ?? null;
  return {
    profileUrl: `https://www.linkedin.com/in/${encodeURIComponent(slug)}`,
    slug,
    rawName: rawName.trim(),
    name: cleanPersonName(rawName),
    headline: rest.join(" - ").trim(),
    snippet,
    experience,
  };
}

export type RecruiterKind =
  | "early_career"
  | "technical"
  | "recruiter"
  | "coordinator"
  | "intern"
  | "other";

/** Best first. Interns and non-recruiters aren't contacted. */
export const RECRUITER_KIND_RANK: Record<RecruiterKind, number> = {
  early_career: 0,
  technical: 1,
  recruiter: 2,
  coordinator: 3,
  intern: 9,
  other: 9,
};

const RECRUITING = /\b(?:recruit\w*|sourc(?:er|ing)|talent (?:acquisition|partner|advisor|lead|team)|university programs?|campus programs?|early (?:career|talent) programs?)\b/i;
const EARLY_CAREER = /\b(?:universit(?:y|ies)|campus|early[\s-]?(?:careers?|talent|in[\s-]career)|emerging talent|new[\s-]?grads?|internships?|intern (?:recruit\w*|programs?|hiring)|students?|college|entry[\s-]?level)\b/i;
const SELF_INTERN = /\b(?:recruit\w*|talent acquisition|sourcing|people|hr|human resources|talent)\s+intern\b|^intern\b|\bintern\s+(?:at|@)\b/i;
const TECHNICAL = /\b(?:technical|tech|engineering|software|eng|gtm|product)\s+(?:recruit|sourc)/i;
const COORDINATOR = /\b(?:coordinator|scheduler|scheduling|recruiting operations|recruiting ops)\b/i;

function kindOf(text: string): RecruiterKind {
  if (!RECRUITING.test(text)) return "other";
  if (SELF_INTERN.test(text)) return "intern";
  if (EARLY_CAREER.test(text)) return "early_career";
  if (COORDINATOR.test(text)) return "coordinator";
  if (TECHNICAL.test(text)) return "technical";
  return "recruiter";
}

/** What kind of recruiter the headline says. The snippet is used only when
 * the headline names no role, and the answer is then marked weak. */
export function classifyRecruiter(person: Pick<LinkedInPerson, "headline" | "snippet">): { kind: RecruiterKind; weak: boolean } {
  const fromHeadline = kindOf(person.headline);
  // "Software Engineering Intern at Acme" names a role; "Acme" alone doesn't.
  if (fromHeadline !== "other" || person.headline.split(/\s+/).length > 3) return { kind: fromHeadline, weak: false };
  // The snippet's opening usually repeats the headline before "Experience:".
  const opening = person.snippet.split(/\s·\s|Experience:/i)[0] ?? "";
  return { kind: kindOf(opening), weak: true };
}

export type CompanyMatch =
  /** Google's Experience line names the company. */
  | "current"
  /** The headline names it and the Experience line doesn't contradict it. */
  | "headline"
  /** "Former" or "ex-", or the headline names the company while the
   * Experience line names another employer (the headline is stale). */
  | "former"
  | "none";

const LEGAL_SUFFIX = /\b(?:inc|llc|ltd|corp|corporation|co|company|technologies|labs|hq)\b\.?/gi;

export function companyKey(name: string): string {
  return name.toLowerCase().replace(LEGAL_SUFFIX, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function mentions(text: string, key: string): boolean {
  if (!key) return false;
  const escaped = key.replace(/ /g, "[^a-z0-9]*");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(text.toLowerCase());
}

export function matchCompany(person: Pick<LinkedInPerson, "headline" | "snippet" | "experience">, companyName: string, aliases: string[] = []): CompanyMatch {
  const keys = [companyName, ...aliases].map(companyKey).filter(Boolean);
  const experienceKey = person.experience ? companyKey(person.experience) : null;
  const experienceMatches = experienceKey !== null
    && keys.some((key) => experienceKey === key || experienceKey.startsWith(`${key} `));
  if (experienceMatches) return "current";
  const formerly = keys.some((key) =>
    // Within one clause: "Former University Recruiter at Acme", "ex-Acme".
    new RegExp(`\\b(?:former(?:ly)?|ex|previously|prev)\\b[^|·;,]{0,50}?\\b${key.replace(/ /g, "[^a-z0-9]*")}\\b`, "i")
      .test(`${person.headline} ${person.snippet}`));
  if (formerly) return "former";
  if (keys.some((key) => mentions(person.headline, key))) return experienceKey ? "former" : "headline";
  return "none";
}
