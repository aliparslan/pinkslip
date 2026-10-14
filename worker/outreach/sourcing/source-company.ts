import {
  addressesAt,
  applyTemplate,
  COMMON_TEMPLATES,
  formatClaim,
  isRoleAddress,
  likelyTemplate,
  mailDomainsInText,
  patternEvidence,
  type FormatClaim,
} from "./email-pattern";
import {
  basedInUs,
  classifyRecruiter,
  companyKey,
  earlyCareerQuery,
  formatQuery,
  matchCompany,
  parseLinkedInResult,
  recruiterQuery,
  RECRUITER_KIND_RANK,
  type CompanyMatch,
  type LinkedInPerson,
  type RecruiterKind,
  type SearchResult,
} from "./linkedin-search";
import { chooseMailDomain, lookupMx, mailProvider, type MailDomain, type MailProvider } from "./mail-domain";

/* One company, start to finish: search, read profiles, decide who's kept,
 * find the mail domain and pattern, guess addresses. Shared by the Worker
 * (admin runs, later the scheduled job) and scripts/contacts/try-company.ts.
 * See docs/recruiter-contacts-sourcing.md. */

/** One search-results page. Serper's free plan refuses more than 10 results
 * a request, so a second page is a second call. */
export type Search = (query: string, page: number) => Promise<SearchResult[]>;

export type EmployerEvidence = "current employer" | "experience line" | "headline only" | "none";

export interface SourcedPerson {
  person: LinkedInPerson;
  kind: RecruiterKind;
  /** The kind came from the snippet, not a title or headline. */
  weak: boolean;
  match: CompanyMatch;
  /** What says they work there: their current employer line, Google's
   * Experience line, or only their self-written headline. */
  employerEvidence: EmployerEvidence;
  /** Why they were left out; null when kept. */
  reason: string | null;
  emailGuess: string | null;
  emailConfidence: string | null;
}

export interface SourcedCompany {
  site: string;
  mail: MailDomain;
  provider: MailProvider | null;
  pattern: { template: string; votes: number; total: number } | null;
  claims: FormatClaim[];
  roleAddresses: string[];
  /** Kept first, best first; then everyone left out. */
  people: SourcedPerson[];
  searches: number;
}

/** Searches per company: two early-career pages, one recruiter page, one
 * "email format" page. */
export const SEARCHES_PER_COMPANY = 4;

export async function sourceCompany(
  company: string,
  site: string,
  search: Search,
  lookup: (domain: string) => Promise<string[]> = lookupMx,
): Promise<SourcedCompany> {
  const [earlyFirst, earlySecond, recruiterResults, formatResults] = await Promise.all([
    search(earlyCareerQuery(company), 1),
    search(earlyCareerQuery(company), 2),
    search(recruiterQuery(company), 1),
    search(formatQuery(company), 1),
  ]);

  const profiles = new Map<string, LinkedInPerson>();
  for (const result of [...earlyFirst, ...earlySecond, ...recruiterResults]) {
    const person = parseLinkedInResult(result);
    if (person && !profiles.has(person.slug)) profiles.set(person.slug, person);
  }

  const formatText = formatResults.map((result) => `${result.title} ${result.snippet ?? ""}`).join("\n");
  const mail = await chooseMailDomain(site, mailDomainsInText(formatText, [companyKey(company), site.split(".")[0] ?? ""]), lookup);
  const claims = formatResults
    .map((result) => formatClaim(`${result.title} ${result.snippet ?? ""}`, hostname(result.link)))
    .filter((claim) => claim !== null);
  const peopleText = [...profiles.values()].map((person) => `${person.rawName} ${person.snippet}`).join("\n");
  const pattern = likelyTemplate([...claims, ...patternEvidence(peopleText, mail.domain)]);

  const isThisCompany = (name: string | null) =>
    name !== null && matchCompany({ headline: "", snippet: "", experience: name }, company) === "current";

  const people = [...profiles.values()].map((person): SourcedPerson => {
    const { kind, weak } = classifyRecruiter(person);
    const match = matchCompany(person, company);
    const rank = RECRUITER_KIND_RANK[kind];
    const reason = !person.name ? "no usable name"
      : rank >= 9 ? (kind === "intern" ? "recruiting intern" : "not a recruiter")
      : match === "former" ? `left the company${person.employer ? ` (now at ${person.employer})` : ""}`
      : match === "none" ? (person.employer ? `works at ${person.employer}` : "company not confirmed")
      : !basedInUs(person) ? `based outside the US (${person.location})`
      : null;
    const employerEvidence: EmployerEvidence = isThisCompany(person.employer) ? "current employer"
      : isThisCompany(person.experience) ? "experience line"
      : match === "headline" ? "headline only"
      : "none";
    const local = person.name && pattern ? applyTemplate(pattern.template, person.name) : null;
    return {
      person,
      kind,
      weak,
      match,
      employerEvidence,
      reason,
      emailGuess: local ? `${local}@${mail.domain}` : null,
      emailConfidence: reason === null ? emailConfidence(person, pattern, local) : null,
    };
  });

  const kept = people.filter((row) => row.reason === null).sort((a, b) =>
    RECRUITER_KIND_RANK[a.kind] - RECRUITER_KIND_RANK[b.kind]
    || Number(a.weak) - Number(b.weak)
    || Number(b.match === "current") - Number(a.match === "current"));

  return {
    site,
    mail,
    provider: mail.exchanges.length ? mailProvider(mail.exchanges) : null,
    pattern,
    claims,
    roleAddresses: addressesAt(`${formatText}\n${peopleText}`, mail.domain).filter(isRoleAddress),
    people: [...kept, ...people.filter((row) => row.reason !== null)],
    searches: SEARCHES_PER_COMPANY,
  };
}

/** When no source states a format, the most common ones, for showing. */
export const FALLBACK_TEMPLATES = COMMON_TEMPLATES.slice(0, 3);

/** How far to trust the guessed address, from the pattern's support and the
 * name. A {first} format is risky at any size: a common first name's
 * address usually belongs to whoever joined first. */
function emailConfidence(
  person: LinkedInPerson,
  pattern: SourcedCompany["pattern"],
  local: string | null,
): string {
  if (!pattern) return "no pattern found";
  if (!local) return "no guess: the format needs a last name";
  const notes: string[] = [];
  if (pattern.template === "{first}") notes.push("risky: first-name addresses often belong to someone else");
  else if (pattern.votes === pattern.total && pattern.total >= 3) notes.push("format likely");
  else if (pattern.votes / pattern.total >= 0.75) notes.push("format probable");
  else notes.push("format uncertain");
  if (person.name && person.name.lasts.length > 1 && /\{l(?:ast)?\}/.test(pattern.template)) notes.push("last name has variants");
  if (person.name && person.name.firsts.length > 1) notes.push("goes by a nickname");
  return notes.join("; ");
}

function hostname(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

interface SerperResponse {
  organic?: SearchResult[];
  credits?: number;
}

/** A Search backed by Serper (Google results). */
export function serperSearch(apiKey: string, fetcher: typeof fetch = fetch): Search {
  return async (query, page) => {
    const response = await fetcher("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 10, page, gl: "us", hl: "en" }),
    });
    if (!response.ok) throw new Error(`Search failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
    return ((await response.json()) as SerperResponse).organic ?? [];
  };
}
