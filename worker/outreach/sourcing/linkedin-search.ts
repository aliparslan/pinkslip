import { isUsJobLocation } from "../../us-jobs";
import { cleanPersonName, type PersonName } from "./email-pattern";

/* Reading LinkedIn profiles from search-engine results ("X-ray search"), so
 * Pinkslip never visits LinkedIn itself. See docs/recruiter-contacts-sourcing.md. */

export interface SearchResult {
  title: string;
  link: string;
  snippet?: string;
  /** Serper's line for LinkedIn profiles: "Seattle, Washington, United
   * States · University Recruiter · Stripe" (location · role · employer). */
  subtitle?: string;
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
  location: string | null;
  /** The current position, from the subtitle. */
  role: string | null;
  /** The current employer, from the subtitle. */
  employer: string | null;
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

/** "Acme email format" pages (RocketReach, LeadIQ and others) state the
 * company's address format in their snippets. Searching for an address
 * ("@acme.com") isn't allowed on Serper's free plan. */
export function formatQuery(company: string): string {
  return `${company} email format`;
}

export function parseLinkedInResult(result: SearchResult): LinkedInPerson | null {
  const match = /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#]+)/i.exec(result.link);
  if (!match?.[1]) return null;
  const slug = decodeURIComponent(match[1]).toLowerCase();
  const title = result.title.replace(/\s*\|\s*LinkedIn\s*$/i, "").replace(/\s*(?:\.\.\.|…)\s*$/, "").trim();
  const [rawName = "", ...rest] = title.split(/\s+[-–—]\s+/);
  const snippet = (result.snippet ?? "").replace(/\s+/g, " ").trim();
  const experience = /Experience:\s*([^·|\n]+?)\s*(?:·|\||$)/i.exec(snippet)?.[1]?.trim() ?? null;
  const subtitle = (result.subtitle ?? "").split(/\s+·\s+/).map((part) => part.trim()).filter(Boolean);
  // Three parts: location · role · employer. Two: location · employer.
  const location = subtitle.length >= 2 ? subtitle[0] ?? null : null;
  const role = subtitle.length >= 3 ? subtitle.slice(1, -1).join(" · ") : null;
  const employer = subtitle.length >= 2 ? subtitle.at(-1) ?? null : null;
  return {
    profileUrl: `https://www.linkedin.com/in/${encodeURIComponent(slug)}`,
    slug,
    rawName: rawName.trim(),
    name: cleanPersonName(rawName),
    headline: rest.join(" - ").trim(),
    snippet,
    experience,
    location,
    role,
    employer,
  };
}

/** Pinkslip's jobs are in the US, so are the recruiters it contacts. An
 * unknown location isn't evidence against. */
export function basedInUs(person: Pick<LinkedInPerson, "location">): boolean {
  return isUsJobLocation(person.location ?? "");
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

const RECRUITING = /\b(?:recruit\w*|sourc(?:er|ing)|talent (?:acquisition|partner|advisor|lead|team)|(?:early|emerging|university|campus) talent|university (?:programs?|relations)|campus programs?|early (?:career|talent) programs?)\b/i;
const EARLY_CAREER = /\b(?:universit(?:y|ies)|campus|early[\s-]?(?:careers?|talent|in[\s-]career)|emerging talent|new[\s-]?grads?|internships?|intern (?:recruit\w*|programs?|hiring)|students?|college|entry[\s-]?level)\b/i;
const SELF_INTERN = /\b(?:recruit\w*|talent acquisition|sourcing|people|hr|human resources|talent)\s+intern\b|^intern\b|\bintern\s+(?:at|@)\b/i;
const TECHNICAL = /\b(?:technical|tech|engineering|software|eng)\s+(?:recruit|sourc)/i;
const COORDINATOR = /\b(?:coordinator|scheduler|scheduling|recruiting operations|recruiting ops)\b/i;

function kindOf(text: string): RecruiterKind {
  if (!RECRUITING.test(text)) return "other";
  if (SELF_INTERN.test(text)) return "intern";
  if (EARLY_CAREER.test(text)) return "early_career";
  if (COORDINATOR.test(text)) return "coordinator";
  if (TECHNICAL.test(text)) return "technical";
  return "recruiter";
}

/** What kind of recruiter the current role and headline say. Early-career
 * work named in either wins; otherwise the role, which is the actual
 * position, beats the self-written headline. The snippet is used only when
 * neither names a role, and the answer is then marked weak. */
export function classifyRecruiter(person: Pick<LinkedInPerson, "headline" | "snippet"> & { role?: string | null }): { kind: RecruiterKind; weak: boolean } {
  const kinds = [person.role ?? "", person.headline].filter(Boolean).map(kindOf);
  if (kinds.includes("intern")) return { kind: "intern", weak: false };
  if (kinds.includes("early_career")) return { kind: "early_career", weak: false };
  const best = kinds.find((kind) => kind !== "other");
  if (best) return { kind: best, weak: false };
  // "Software Engineering Intern at Acme" names a role; "Acme" alone doesn't.
  if (person.role || person.headline.split(/\s+/).length > 3) return { kind: "other", weak: false };
  // The snippet's opening usually repeats the headline before "Experience:".
  const opening = person.snippet.split(/\s·\s|Experience:/i)[0] ?? "";
  return { kind: kindOf(opening), weak: true };
}

export type CompanyMatch =
  /** The subtitle's employer or Google's Experience line names the company. */
  | "current"
  /** Only the headline names it, and nothing names another employer. */
  | "headline"
  /** "Former" or "ex-", or the headline names the company while the
   * current employer is another (the headline is stale). */
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

export function matchCompany(
  person: Pick<LinkedInPerson, "headline" | "snippet" | "experience"> & { employer?: string | null },
  companyName: string,
  aliases: string[] = [],
): CompanyMatch {
  const keys = [companyName, ...aliases].map(companyKey).filter(Boolean);
  const isCompany = (name: string | null | undefined) => {
    if (!name) return false;
    const key = companyKey(name);
    return keys.some((candidate) => key === candidate || key.startsWith(`${candidate} `));
  };
  if (isCompany(person.employer) || isCompany(person.experience)) return "current";
  // Clause by clause, so "Recruiter @ Acme | Ex-Globex" isn't read as ex-Acme.
  const clauses = `${person.headline}|${person.snippet}`.split(/[|·;,]/);
  const formerly = keys.some((key) => {
    const pattern = new RegExp(`\\b(?:former(?:ly)?|ex|previously|prev)\\b.{0,50}?\\b${key.replace(/ /g, "[^a-z0-9]*")}\\b`, "i");
    return clauses.some((clause) => pattern.test(clause));
  });
  if (formerly) return "former";
  if (keys.some((key) => mentions(person.headline, key))) {
    return person.employer || person.experience ? "former" : "headline";
  }
  return "none";
}
