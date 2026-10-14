import { compact, words, type EmailContent } from "./rules";

/*
 * Which application an email is about, strongest evidence first:
 *   1. a job link or job ID from one of the candidates appears in the email;
 *   2. a candidate's title appears (the longest such title wins);
 *   3. there is exactly one candidate.
 * Anything else is ambiguous, and the user is asked. The same rules pick a
 * catalog job when the user isn't tracking one at that company yet.
 */

export interface JobCandidate {
  /** An application id, or a catalog job id. */
  id: string;
  title: string;
  external_id: string | null;
  url: string | null;
}

export type CandidateMatch =
  | { kind: "match"; id: string; by: "job_reference" | "title" | "only_candidate" }
  | { kind: "ambiguous"; ids: string[] }
  | { kind: "none" };

function normalizeUrl(href: string): string {
  try {
    const url = new URL(href);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return href.toLowerCase();
  }
}

/** Long IDs only: a short number could appear in any email by chance. */
function referencesJob(candidate: JobCandidate, haystack: string, links: string[]): boolean {
  const id = candidate.external_id?.trim().toLowerCase() ?? "";
  if (id.length >= 6 && new RegExp(`(^|[^a-z0-9])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(haystack)) {
    return true;
  }
  if (candidate.url) {
    const target = normalizeUrl(candidate.url);
    return target.length > 12 && links.some((href) => normalizeUrl(href).startsWith(target));
  }
  return false;
}

/** Title variants worth searching for: as posted, and without parenthesised
 * or trailing location and requisition details. */
function titleVariants(title: string): string[] {
  const variants = new Set<string>();
  const add = (value: string) => {
    // One-word titles ("Engineer", "Designer") are too generic to match on.
    const normalized = words(value);
    if (normalized.split(" ").length >= 2) variants.add(normalized);
  };
  add(title);
  add(title.replace(/\([^)]*\)|\[[^\]]*\]/g, " "));
  add(title.split(/\s[-–|]\s/)[0] ?? title);
  return [...variants];
}

export type SpecificMatch =
  | { kind: "match"; id: string; by: "job_reference" | "title" }
  | { kind: "tie"; ids: string[] }
  | { kind: "none" };

/** A candidate the email names by job link, job ID or title. The longest
 * matching title wins; equal ones tie. */
export function matchSpecific(email: EmailContent, candidates: JobCandidate[]): SpecificMatch {
  if (candidates.length === 0) return { kind: "none" };
  const haystack = `${email.subject}\n${email.text}\n${email.links.join("\n")}`.toLowerCase();
  const referenced = candidates.filter((candidate) => referencesJob(candidate, haystack, email.links));
  if (referenced.length === 1) return { kind: "match", id: referenced[0]!.id, by: "job_reference" };

  const pool = referenced.length > 1 ? referenced : candidates;
  const text = ` ${words(`${email.subject} ${email.text}`)} `;
  let best = 0;
  let titled: JobCandidate[] = [];
  for (const candidate of pool) {
    const length = Math.max(0, ...titleVariants(candidate.title)
      .filter((variant) => text.includes(` ${variant} `))
      .map((variant) => variant.length));
    if (length === 0) continue;
    if (length > best) {
      best = length;
      titled = [candidate];
    } else if (length === best) {
      titled.push(candidate);
    }
  }
  if (titled.length === 1) return { kind: "match", id: titled[0]!.id, by: "title" };
  if (titled.length > 1) return { kind: "tie", ids: titled.map((candidate) => candidate.id) };
  if (referenced.length > 1) return { kind: "tie", ids: referenced.map((candidate) => candidate.id) };
  return { kind: "none" };
}

export function matchCandidates(email: EmailContent, candidates: JobCandidate[]): CandidateMatch {
  if (candidates.length === 0) return { kind: "none" };
  const specific = matchSpecific(email, candidates);
  if (specific.kind === "match") return specific;
  // Two applications for the same title (different teams or locations) stay
  // ambiguous rather than being guessed.
  if (specific.kind === "tie") return { kind: "ambiguous", ids: specific.ids };
  if (candidates.length === 1) return { kind: "match", id: candidates[0]!.id, by: "only_candidate" };
  return { kind: "ambiguous", ids: candidates.map((candidate) => candidate.id) };
}

/** Candidate company names to look up in the catalog when the user tracks
 * nothing at the sender's company: the sender's name minus hiring words, the
 * sender's domain, and "applying to X" phrases. */
export function companyNameHints(email: EmailContent): string[] {
  const hints = new Set<string>();
  const stripped = email.from.name
    .replace(/\b(recruiting|recruitment|recruiter|careers|career|talent( acquisition)?|hiring( team)?|jobs|hr|people|team|via \w+|no ?reply|notifications?)\b/gi, " ")
    .replace(/[^\p{L}\p{N}&.' ]+/gu, " ")
    .trim();
  if (stripped) hints.add(compact(stripped));
  const host = email.from.address.split("@")[1] ?? "";
  const label = host.split(".").filter(Boolean).slice(-2, -1)[0];
  if (label) hints.add(compact(label));
  const phrase = `${email.subject}\n${email.text.slice(0, 3000)}`.match(
    /\b(?:applying to|application (?:to|with|at)|interest in|position at|role at|opportunity at|career at|team at)\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})/
  );
  if (phrase?.[1]) hints.add(compact(phrase[1]));
  return [...hints].filter((hint) => hint.length >= 2);
}
