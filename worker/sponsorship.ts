/**
 * What a posting says about visa sponsorship: true when it says the employer
 * sponsors, false when it says it won't (or that the applicant must not need
 * it), null when it says nothing or hedges.
 *
 * False removes the job from the feed of someone who needs sponsorship, so a
 * wrong false costs a person a job they could have had. Anything conditional
 * ("for some roles", "transfers only", "may be available") therefore stays
 * null. Scored against hand labels with `scripts/benchmarks/job_facts.ts`
 * (docs/job-facts-eval-2026-11-10.md).
 */

/**
 * Off until the owner turns it on: the wider reading below replaces the five
 * original patterns. Turning it on changes stored facts, so bump
 * JOB_CLASSIFIER_VERSION and MATCHER_VERSION in the same commit.
 */
export const WIDER_SPONSORSHIP_PATTERNS = false;

/** The five patterns in use since the fact was added. */
export function legacySponsorshipStatement(description: string | null): boolean | null {
  const text = description?.toLowerCase() ?? "";
  if (/\b(?:visa|immigration)\s+sponsorship\s+(?:is\s+)?available\b/.test(text) || /\bwe (?:do|can) sponsor\b/.test(text)) return true;
  if (
    /\b(?:unable|not able) to sponsor\b/.test(text)
    || /\b(?:do not|don't|cannot|can't|will not|won't) sponsor\b/.test(text)
    || /\bno (?:visa|immigration) sponsorship\b/.test(text)
  ) return false;
  return null;
}

/** Sentences, lowercased, with markup gone and "U.S." kept from ending one. */
function sentences(description: string): string[] {
  return description
    .normalize("NFKC")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&(?:apos|#39|#x0*27|rsquo|#8217);/gi, "'")
    .replace(/<\s*(?:\/?(?:li|p|div|h[1-6]|ul|ol|tr|td)\b[^>]*|br\s*\/?)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\bu\.s\.a?\.?/g, "us")
    .replace(/\be\.g\.?/g, "eg")
    .replace(/\bi\.e\.?/g, "ie")
    .split(/\n|(?<=[.!?;])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Words between a verb and "sponsorship": "any type of employment-based immigration". */
const BETWEEN = String.raw`(?:[\w.,/&-]+ ){0,6}?`;

const WONT: readonly RegExp[] = [
  new RegExp(String.raw`\b(?:unable|(?:not|n't) able|not in a position) to (?:[\w-]+ ){0,2}?(?:sponsor\b|(?:provide|offer|support|pursue) ${BETWEEN}sponsorship\b)`),
  new RegExp(String.raw`\b(?:do(?:es)? not|don't|doesn't|cannot|can't|can not|will not|won't|is not|isn't|are not|aren't|not) (?:currently |presently |be )?(?:sponsor(?:ing)?\b|(?:provid(?:e|ing)|offer(?:ing)?|pursu(?:e|ing)|support(?:ing)?) ${BETWEEN}sponsorship\b)`),
  /\bsponsorship\b[^.;!?]{0,120}?\b(?:is|are) (?:not |un)(?:available|offered|provided|supported|possible)\b/,
  new RegExp(String.raw`\bnot (?:be )?(?:eligible|available) for ${BETWEEN}sponsorship\b`),
  /\bno (?:[\w/-]+ ){0,3}?sponsorship\b/,
  // The applicant's side: "authorized to work without (the need for) sponsorship".
  new RegExp(String.raw`\bwithout (?:the need for |a need for |any need for |needing |requiring )?${BETWEEN}(?:(?:employer|company)-)?sponsor(?:ship|ed)\b`),
  new RegExp(String.raw`\b(?:not|never|n't) (?:now or in the future |currently |ever )?(?:require|need)s? ${BETWEEN}sponsorship\b`),
  new RegExp(String.raw`\b(?:unable to|cannot|can't|will not|won't|do not|does not|not) (?:be )?consider(?:ed|ing)?\b[^.;!?]{0,80}?\b(?:require|need)s? ${BETWEEN}sponsorship\b`),
];

/** A "won't" that only covers part of the ground, so it decides nothing:
 * "can't sponsor for every role", "for roles outside engineering", "we take
 * transfers but can't sponsor new visas". */
const PARTIAL = /\bsponsor[^.;!?]{0,60}?\b(?:every|all) (?:roles?|candidates?|positions?|cases?)\b|\bguarantee|\b(?:support|sponsor|accept|consider|open to|take over|welcome)\b[^.;!?]{0,80}?\btransfers?\b|\b(?:roles?|positions?) (?:outside|other than)\b|\b(?:remote|some|certain|select|most|many) (?:roles?|positions?|locations?|cases)\b|\bcase[- ]by[- ]case\b/;

/** Transfers are welcome, said without the word "sponsor": a later "no new
 * visas" then only covers part of the ground. */
const TAKES_TRANSFERS = /\b(?:open to|accept|consider|support|welcome)\b[^.;!?]{0,120}?\b(?:h-?1b|visa)\b[^.;!?]{0,80}?\btransfers?\b/;

/** "May sponsor", "if you need us to sponsor": neither a yes nor a no. */
const HEDGED = /\b(?:may|might|could)\b[^.;!?]{0,60}?\bsponsor|\b(?:need|require)(?:s|d|ing)? (?:[\w.&'-]+ ){1,3}?to sponsor\b/;

/** What makes a sentence about work visas and not a sponsored perk or product. */
const VISA_WORDS = String.raw`(?:visas?|h-?1b|opt\b|o-?1\b|international (?:candidates|talent|hires|applicants|employees)|work authori[sz]ation|employment authori[sz]ation|green cards?|work permits?)`;

const WILL: readonly RegExp[] = [
  new RegExp(String.raw`\b(?:visas?|immigration|h-?1b)\b[^.;!?]{0,40}?\bsponsorship (?:is |are )?(?:available|offered|provided|supported)\b`),
  new RegExp(String.raw`\bsponsor(?:s|ing)? (?:[\w,/()&-]+ ){0,7}?${VISA_WORDS}`),
  /\b(?:offers?|provides?|includ(?:e|es|ing)) (?:[\w,/&-]+ ){0,4}?(?:visa|immigration|h-?1b) (?:and [\w-]+ )?sponsorship\b/,
  /\b(?:relocation|immigration)(?: support| assistance)?(?: and|,| &| \/) visa sponsorship\b|\bvisa sponsorship(?: and|,| &| \/) relocation\b/,
  /\bsponsorship\s*:\s*(?:yes|available|offered|we (?:provide|offer|support|sponsor)\b)/,
  // A benefits line: "Visa sponsorship and green card support for qualified candidates".
  /^(?:[\w-]+ ){0,2}?visa sponsorship (?:and|&|for|with|\+) /,
];

/** An export licence can be "sponsored" too; that says nothing about visas. */
const EXPORT_LICENCE = /\bexport (?:control(?:led|s)?|licen[cs](?:e|es|ing)|laws?|administration|regulations?)\b/;
const ABOUT_VISAS = /\b(?:visas?|immigration|h-?1b|employment authori[sz]ation|work authori[sz]ation)\b/;

export function sponsorshipStatement(description: string | null): boolean | null {
  if (!description) return null;
  let will = false;
  let wont = false;
  let unsure = false;
  for (const sentence of sentences(description)) {
    if (TAKES_TRANSFERS.test(sentence)) unsure = true;
    if (!sentence.includes("sponsor")) continue;
    if (EXPORT_LICENCE.test(sentence) && !ABOUT_VISAS.test(sentence)) continue;
    if (WONT.some((pattern) => pattern.test(sentence))) {
      if (PARTIAL.test(sentence)) unsure = true;
      else wont = true;
    } else if (HEDGED.test(sentence)) {
      unsure = true;
    } else if (WILL.some((pattern) => pattern.test(sentence))) {
      will = true;
    }
  }
  if (wont) return will || unsure ? null : false;
  return will ? true : null;
}
