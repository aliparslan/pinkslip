/* Work addresses from names: clean a display name into the parts addresses
 * are built from, learn a company's template from known name and address
 * pairs, and apply it to everyone else. See docs/recruiter-contacts-sourcing.md. */

export interface PersonName {
  /** The name as shown, without credentials, pronouns or emoji. */
  display: string;
  /** Lowercase ASCII letters only. A nickname comes second. */
  firsts: string[];
  /** The final last-name word first, then the whole multi-word or
   * hyphenated last name, then its other parts. */
  lasts: string[];
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

/** Null when there's no usable first and last name, e.g. "Jane D." */
export function cleanPersonName(raw: string): PersonName | null {
  let text = raw.normalize("NFKC");
  const nicknames: string[] = [];
  // "Katherine (Kate) Doe" or "Katherine "Kate" Doe"; pronouns go the same way.
  text = text.replace(/[("“”]([^()"“”]{1,30})[)"“”]/g, (_, inner: string) => {
    if (/^\p{L}{2,}$/u.test(inner.trim())) nicknames.push(inner.trim());
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
  if (ascii(lastWord).length < 2 || ascii(firstWord ?? "").length < 1) return null;
  const firsts = unique([ascii(firstWord ?? ""), ...nicknames.map(ascii)]);
  // "Jane Marie Doe" and "Maria Garcia Lopez" read the same, so the final
  // word leads and the other readings follow for evidence to settle.
  const lasts = unique([
    ascii(lastWord),
    ascii(lastWords.join("")),
    ...lastWords.flatMap((word) => word.split(/[-’']/)).map(ascii),
  ].filter((part) => part.length >= 2));
  return { display: words.join(" "), firsts, lasts };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** Templates use {first}, {last}, {f} and {l}, with ".", "_" or "-" between. */
export const COMMON_TEMPLATES = [
  "{first}.{last}",
  "{first}",
  "{f}{last}",
  "{first}{last}",
  "{f}.{last}",
  "{first}_{last}",
  "{first}{l}",
  "{last}.{first}",
  "{last}{f}",
] as const;

export function applyTemplate(template: string, name: PersonName): string {
  const first = name.firsts[0] ?? "";
  const last = name.lasts[0] ?? "";
  return template
    .replaceAll("{first}", first)
    .replaceAll("{last}", last)
    .replaceAll("{f}", first.slice(0, 1))
    .replaceAll("{l}", last.slice(0, 1));
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

/** The template most of the evidence agrees on, with how many agree. */
export function likelyTemplate(evidence: PatternEvidence[]): { template: string; votes: number; total: number } | null {
  if (evidence.length === 0) return null;
  const votes = new Map<string, number>();
  for (const item of evidence) votes.set(item.template, (votes.get(item.template) ?? 0) + 1);
  const [template, count] = [...votes].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  return { template, votes: count, total: evidence.length };
}
