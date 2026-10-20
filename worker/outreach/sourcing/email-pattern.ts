import { MAIL_TEMPLATES } from "../../../shared/recruiter-review";

/* Work addresses from names: clean a display name into the parts addresses
 * are built from, learn a company's template from known name and address
 * pairs, and apply it to everyone else. See docs/recruiter-contacts-sourcing.md. */

export interface PersonName {
  /** The name as shown, without credentials, pronouns or emoji. */
  display: string;
  /** Lowercase ASCII letters only. A nickname comes second. */
  firsts: string[];
  /** The final last-name word first, then the whole multi-word or
   * hyphenated last name, then its other parts. Empty when only an initial
   * is shown ("Jordan T."). */
  lasts: string[];
  /** The last initial when that's all that is shown. */
  lastInitial?: string;
}

const HONORIFICS = new Set(["dr", "mr", "mrs", "ms", "mx", "prof"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);
const CREDENTIALS = new Set([
  "mba", "phr", "sphr", "shrm", "cp", "scp", "pmp", "cpa", "ms", "ma", "msc", "bs", "ba", "phd", "jd",
  "cir", "csp", "cdr", "aire", "ccdp", "cssbb", "ghr", "mshr", "med",
]);

function ascii(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

/** Null when there's no usable name. "Jordan T." keeps the initial, which
 * is enough for {first} and {first}{l} addresses. */
export function cleanPersonName(raw: string): PersonName | null {
  let text = raw.normalize("NFKC");
  const asides: string[] = [];
  // "Katherine (Kate) Doe", "Emily (Mincin) Pfluger"; pronouns go the same way.
  text = text.replace(/[("“”]([^()"“”]{1,30})[)"“”]/g, (_, inner: string) => {
    if (/^\p{L}{2,}$/u.test(inner.trim())) asides.push(inner.trim());
    return " ";
  });
  // Credentials and taglines follow a comma or a bar: "Jane Doe, SHRM-CP".
  text = text.split(/[,|]| - | – /)[0] ?? "";
  const tokens = text
    .replace(/[^\p{L}\p{M}\s.'’-]/gu, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[.'’-]+|['’-]+$/g, ""))
    .filter((token) => token.length > 0);
  const words = tokens.filter((token, index) => {
    const bare = ascii(token);
    if (!bare) return false;
    if (index === 0 && HONORIFICS.has(bare)) return false;
    if (SUFFIXES.has(bare) || CREDENTIALS.has(bare)) return false;
    return true;
  });
  if (words.length < 2) return null;
  const [firstWord, ...rest] = words;
  // Middle initials ("Jane A. Doe") don't appear in addresses.
  const lastWords = rest.filter((word, index) => index === rest.length - 1 || ascii(word).length > 1);
  const lastWord = lastWords.at(-1) ?? "";
  if (ascii(firstWord ?? "").length < 2) return null;
  if (ascii(lastWord).length === 1 && lastWords.length === 1) {
    return { display: words.join(" "), firsts: [ascii(firstWord ?? "")], lasts: [], lastInitial: ascii(lastWord) };
  }
  if (ascii(lastWord).length < 2) return null;
  // An aside sharing the first name's initial is a nickname (Kate for
  // Katherine); any other is a maiden or former last name.
  const first = ascii(firstWord ?? "");
  const nicknames = asides.map(ascii).filter((aside) => aside[0] === first[0]);
  const formerLasts = asides.map(ascii).filter((aside) => aside[0] !== first[0]);
  const firsts = unique([first, ...nicknames]);
  // "Jane Marie Doe" and "Maria Garcia Lopez" read the same, so the final
  // word leads and the other readings follow for evidence to settle.
  const lasts = unique([
    ascii(lastWord),
    ascii(lastWords.join("")),
    ...lastWords.flatMap((word) => word.split(/[-’']/)).map(ascii),
    ...formerLasts,
  ].filter((part) => part.length >= 2));
  return { display: words.join(" "), firsts, lasts };
}

/** "Samantha A." with the profile link /in/samantha-arbetter (or
 * /in/samanthaarbetter) is Samantha Arbetter: the link's next word starts
 * with the shown initial. */
export function completeNameFromSlug(name: PersonName, slug: string): PersonName {
  if (!name.lastInitial) return name;
  const first = name.firsts[0] ?? "";
  const words = slug.toLowerCase().split(/[-_]/).map((word) => ascii(word));
  let last: string | undefined;
  if (words[0] === first && words[1]?.startsWith(name.lastInitial)) last = words[1];
  else if (words.length === 1 && words[0]?.startsWith(first + name.lastInitial)) last = words[0].slice(first.length);
  last = last?.replace(/\d+$/, "");
  if (!last || last.length < 2 || /\d/.test(last)) return name;
  const { lastInitial: _initial, ...rest } = name;
  return { ...rest, display: `${name.display.replace(/\s+\p{L}\.?$/u, "")} ${last[0]!.toUpperCase()}${last.slice(1)}`, lasts: [last] };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** Templates use {first}, {last}, {f} and {l}, with ".", "_" or "-" between.
 * These are the common ones, most common first (shared with Admin's format
 * sheet). */
export const COMMON_TEMPLATES = MAIL_TEMPLATES;

/** Null when the template needs a last name that isn't known. */
export function applyTemplate(template: string, name: PersonName): string | null {
  const first = name.firsts[0] ?? "";
  const last = name.lasts[0] ?? "";
  if (template.includes("{last}") && !last) return null;
  if (template.includes("{l}") && !last && !name.lastInitial) return null;
  return template
    .replaceAll("{first}", first)
    .replaceAll("{last}", last)
    .replaceAll("{f}", first.slice(0, 1))
    .replaceAll("{l}", last.slice(0, 1) || (name.lastInitial ?? ""));
}

const SEPARATORS = [".", "_", "-"];

/** Every template that turns this name into this address's local part. Built
 * by reading the local part piece by piece, so an unusual format is learned
 * the same way as a common one. Trailing digits (jdoe2) are ignored. */
export function deriveTemplates(name: PersonName, localPart: string): string[] {
  const local = localPart.toLowerCase().replace(/\d+$/, "");
  const found = new Set<string>();
  for (const first of name.firsts) {
    for (const last of name.lasts) {
      const pieces: Array<[string, string]> = [
        ["{first}", first], ["{last}", last], ["{f}", first.slice(0, 1)], ["{l}", last.slice(0, 1)],
      ];
      // At least one part is spelled out in full: "at" isn't Avery Testerson's.
      const walk = (position: number, template: string, used: Set<string>, spelled: boolean) => {
        if (position === local.length) {
          if (spelled) found.add(template);
          return;
        }
        for (const separator of SEPARATORS) {
          if (local.startsWith(separator, position) && template && !SEPARATORS.includes(template.at(-1) ?? "")) {
            walk(position + 1, template + separator, used, spelled);
          }
        }
        for (const [token, value] of pieces) {
          // A name part appears once; {first} and {f} are the same part.
          const part = token === "{f}" ? "{first}" : token === "{l}" ? "{last}" : token;
          if (!value || used.has(part) || !local.startsWith(value, position)) continue;
          walk(position + value.length, template + token, new Set([...used, part]), spelled || token === part);
        }
      };
      walk(0, "", new Set(), false);
    }
  }
  // Prefer full names over initials when both read the same address.
  return [...found].sort((a, b) => b.length - a.length);
}

const ROLE_LOCALS = /^(?:careers?|jobs?|recruit(?:ing|ment|ers?)?|talent|hr|people|press|media|pr|info|hello|hi|contact|support|help|security|privacy|legal|accommodations?|accessibility|ada|university|campus|early-?careers?|students?|interns?|internships?|grads?|newgrads?|no-?reply|do-?not-?reply|notifications?|team|sales|marketing|billing|abuse|postmaster|webmaster|admin|partners?|investors?|ir)$/;

export function isRoleAddress(localPart: string): boolean {
  return ROLE_LOCALS.test(localPart.toLowerCase().replace(/[._-]?(?:team|us)$/, ""));
}

/** Local parts of addresses at this domain (or its subdomains) in some text. */
export function addressesAt(text: string, domain: string): string[] {
  const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`([a-z0-9][a-z0-9._%+-]{0,63})@(?:[a-z0-9-]+\\.)*${escaped}\\b`, "gi");
  return unique([...text.matchAll(pattern)].map((match) => (match[1] ?? "").toLowerCase()));
}

export interface PatternEvidence {
  template: string;
  name: string;
  localPart: string;
}

/** Pairs each personal address in the text with a name in the same text
 * that reads as it, e.g. "Jane Doe … jane.doe@acme.com" → {first}.{last}. */
export function patternEvidence(text: string, domain: string): PatternEvidence[] {
  const locals = addressesAt(text, domain).filter((local) => !isRoleAddress(local));
  if (locals.length === 0) return [];
  // Every two- and three-word window of capitalised words, so "Speaker
  // Rowan Placeholder" also offers "Rowan Placeholder".
  const names = unique([...text.matchAll(/\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’.-]*)+/gu)].flatMap((match) => {
    const words = match[0].split(/\s+/);
    const windows: string[] = [];
    for (let size = 2; size <= 3; size++) {
      for (let start = 0; start + size <= words.length; start++) windows.push(words.slice(start, start + size).join(" "));
    }
    return windows;
  }));
  const evidence: PatternEvidence[] = [];
  for (const local of locals) {
    for (const raw of names) {
      const name = cleanPersonName(raw);
      if (!name) continue;
      const [template] = deriveTemplates(name, local);
      if (template) {
        evidence.push({ template, name: name.display, localPart: local });
        break;
      }
    }
  }
  return evidence;
}

export interface FormatClaim {
  template: string;
  /** The share the page claims for this format, e.g. 31.1 for "(31.1%)". */
  share: number | null;
  source: string;
}

const FORMAT_WORDS: Array<[RegExp, string]> = [
  [/first[\s_-]?initial|firstinitial/gi, "f"],
  [/last[\s_-]?initial|lastinitial/gi, "l"],
  [/first[\s_-]?name/gi, "first"],
  [/last[\s_-]?name|surname/gi, "last"],
];
const PART = "(?:first|last|f|l)";
const BRACKETED = `[\\[{]${PART}[\\]}]`;
const FORMAT_PATTERNS = [
  // "first@acme.com", "FLast@acme.com", "First.Last@"
  /(?<![a-z0-9.])((?:[[{]?(?:first|last|f|l)[\]}]?[._-]?){1,3})@/gi,
  // "[first].[last]", "{f}{last}"
  new RegExp(`((?:${BRACKETED}[._-]?){1,3})`, "gi"),
  // "the first.last email format"
  /(?<![a-z0-9.@])((?:first|last)(?:[._-]?(?:first|last|f|l)){0,2}|[fl][._-]?(?:first|last))(?=\s+(?:email\s+)?(?:format|pattern|convention))/gi,
];
const PLACEHOLDER: PersonName = { display: "First Last", firsts: ["first"], lasts: ["last"] };
// Format pages illustrate with stock names: "ex. jane.doe@acme.com".
const STOCK_NAMES: PersonName[] = [
  { display: "Jane Doe", firsts: ["jane"], lasts: ["doe"] },
  { display: "John Doe", firsts: ["john"], lasts: ["doe"] },
  { display: "John Smith", firsts: ["john"], lasts: ["smith"] },
  { display: "Jane Smith", firsts: ["jane"], lasts: ["smith"] },
];
const STOCK_EXAMPLE = /(?<![a-z0-9.])((?:jane|john|j)[._-]?(?:doe|smith|d|s)?|(?:doe|smith)[._-]?(?:jane|john|j)?)@/gi;

/** Sites whose answer was the same for every company tried ("{first}, 98%"
 * for Stripe and Datadog alike), so their claims are noise. */
export const IGNORED_FORMAT_SOURCES = new Set(["mailmo.io"]);

/** The format an "Acme email format" page's snippet leads with, as a
 * template: "The most common format is FLast@acme.com (58%)" → {f}{last}. */
export function formatClaim(text: string, source: string): FormatClaim | null {
  if (IGNORED_FORMAT_SOURCES.has(source)) return null;
  let normalized = text;
  for (const [pattern, replacement] of FORMAT_WORDS) normalized = normalized.replace(pattern, replacement);
  const candidates: Array<{ index: number; raw: string; names: PersonName[] }> = [];
  for (const pattern of FORMAT_PATTERNS) {
    for (const match of normalized.matchAll(pattern)) {
      if (match[1]) candidates.push({ index: match.index ?? 0, raw: match[1], names: [PLACEHOLDER] });
    }
  }
  for (const match of normalized.matchAll(STOCK_EXAMPLE)) {
    if (match[1]) candidates.push({ index: match.index ?? 0, raw: match[1], names: STOCK_NAMES });
  }
  candidates.sort((a, b) => a.index - b.index);
  for (const candidate of candidates) {
    const local = candidate.raw.replace(/[[\]{}]/g, "").replace(/[._-]$/, "").toLowerCase();
    const template = candidate.names.map((name) => deriveTemplates(name, local)[0]).find(Boolean);
    if (!template) continue;
    const after = normalized.slice(candidate.index + candidate.raw.length, candidate.index + candidate.raw.length + 40);
    const share = /\(?\s*(\d{1,3}(?:\.\d+)?)\s*%/.exec(after)?.[1];
    return { template, share: share ? Number(share) : null, source };
  }
  return null;
}

/** Mail domains named in some text ("ex. jdoe@makenotion.com"), most
 * mentioned first. Only domains that look like the company's count. */
export function mailDomainsInText(text: string, companyLabels: string[]): string[] {
  const labels = companyLabels.map((label) => label.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((label) => label.length >= 3);
  const counts = new Map<string, number>();
  for (const match of text.matchAll(/@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\b/gi)) {
    const domain = (match[1] ?? "").toLowerCase();
    const compact = domain.replace(/[^a-z0-9]/g, "");
    if (!labels.some((label) => compact.includes(label))) continue;
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([domain]) => domain);
}

/** The template most of the evidence agrees on, with how many agree. */
export function likelyTemplate(evidence: Array<{ template: string }>): { template: string; votes: number; total: number } | null {
  if (evidence.length === 0) return null;
  const votes = new Map<string, number>();
  for (const item of evidence) votes.set(item.template, (votes.get(item.template) ?? 0) + 1);
  const [template, count] = [...votes].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  return { template, votes: count, total: evidence.length };
}
