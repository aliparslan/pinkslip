/**
 * Tries recruiter sourcing on one company and prints what it finds. Nothing
 * is saved. See docs/recruiter-contacts-sourcing.md.
 *
 *   bun scripts/contacts/try-company.ts Stripe stripe.com
 *
 * Reads SERPER_API_KEY from the environment or the repository's .dev.vars.
 * One run uses about five Serper credits. Searching for an address
 * ("@acme.com") isn't allowed on Serper's free plan, so the pattern comes from
 * "email format" pages' snippets. Emails are pattern guesses: nothing is
 * checked yet, so treat every address as unconfirmed.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyTemplate,
  COMMON_TEMPLATES,
  addressesAt,
  formatClaim,
  isRoleAddress,
  likelyTemplate,
  mailDomainsInText,
  patternEvidence,
} from "../../worker/outreach/sourcing/email-pattern";
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
  type LinkedInPerson,
  type SearchResult,
} from "../../worker/outreach/sourcing/linkedin-search";
import { chooseMailDomain, mailProvider, websiteDomain } from "../../worker/outreach/sourcing/mail-domain";

function serperKey(): string {
  if (process.env.SERPER_API_KEY) return process.env.SERPER_API_KEY;
  try {
    const vars = readFileSync(join(import.meta.dir, "../../.dev.vars"), "utf8");
    const line = vars.split("\n").find((entry) => entry.startsWith("SERPER_API_KEY="));
    const value = line?.slice("SERPER_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  } catch {
    // No .dev.vars; fall through.
  }
  throw new Error("Set SERPER_API_KEY in the environment or in .dev.vars.");
}

interface SerperResponse {
  organic?: SearchResult[];
  credits?: number;
}

let creditsUsed = 0;

// Raw responses are kept a day outside the repository, so re-running after a
// rule change costs no credits.
const CACHE_DIR = join(tmpdir(), "pinkslip-sourcing-cache");
const CACHE_MS = 24 * 60 * 60 * 1000;
let cachedSearches = 0;

// Serper's free plan refuses more than 10 results a request, so a second
// page is a second request.
async function search(key: string, q: string, page = 1): Promise<SearchResult[]> {
  const request = JSON.stringify({ q, num: 10, page, gl: "us", hl: "en" });
  const file = join(CACHE_DIR, `${createHash("sha256").update(request).digest("hex").slice(0, 24)}.json`);
  try {
    if (Date.now() - statSync(file).mtimeMs < CACHE_MS) {
      cachedSearches++;
      return (JSON.parse(readFileSync(file, "utf8")) as SerperResponse).organic ?? [];
    }
  } catch {
    // Not cached yet.
  }
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: request,
  });
  if (!response.ok) throw new Error(`Serper ${response.status}: ${await response.text()}`);
  const body = await response.json() as SerperResponse;
  creditsUsed += body.credits ?? 1;
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(body));
  return body.organic ?? [];
}

function fail(message: string): never {
  console.error(message);
  return process.exit(1) as never;
}

const [company = fail("Usage: bun scripts/contacts/try-company.ts <Company name> [website]"), website] = process.argv.slice(2);
const site = websiteDomain(website ?? `${company.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`)
  ?? fail(`Couldn't read a domain from ${website}`);

const key = serperKey();
const [earlyFirst, earlySecond, recruiterResults, formatResults] = await Promise.all([
  search(key, earlyCareerQuery(company)),
  search(key, earlyCareerQuery(company), 2),
  search(key, recruiterQuery(company)),
  search(key, formatQuery(company)),
]);
const earlyResults = [...earlyFirst, ...earlySecond];

const people = new Map<string, LinkedInPerson>();
for (const result of [...earlyResults, ...recruiterResults]) {
  const person = parseLinkedInResult(result);
  if (person && !people.has(person.slug)) people.set(person.slug, person);
}

const formatText = formatResults.map((result) => `${result.title} ${result.snippet ?? ""}`).join("\n");
const mail = await chooseMailDomain(site, mailDomainsInText(formatText, [companyKey(company), site.split(".")[0] ?? ""]));
const domain = mail.domain;
const exchanges = mail.exchanges;
const claims = formatResults
  .map((result) => formatClaim(`${result.title} ${result.snippet ?? ""}`, new URL(result.link).hostname.replace(/^www\./, "")))
  .filter((claim) => claim !== null);
const peopleText = [...people.values()].map((person) => `${person.rawName} ${person.snippet}`).join("\n");
const evidence = patternEvidence(peopleText, domain);
const pattern = likelyTemplate([...claims, ...evidence]);
const roleAddresses = addressesAt(`${formatText}\n${peopleText}`, domain).filter(isRoleAddress);

interface Row {
  person: LinkedInPerson;
  kind: string;
  weak: boolean;
  match: string;
  rank: number;
  reason: string | null;
}

const rows: Row[] = [...people.values()].map((person) => {
  const { kind, weak } = classifyRecruiter(person);
  const match = matchCompany(person, company);
  const rank = RECRUITER_KIND_RANK[kind];
  const reason = !person.name ? "no usable name"
    : rank >= 9 ? (kind === "intern" ? "recruiting intern" : "not a recruiter")
    : match === "former" ? `left the company${person.employer ? ` (now at ${person.employer})` : ""}`
    : match === "none" ? (person.employer ? `works at ${person.employer}` : "company not confirmed")
    : !basedInUs(person) ? `based outside the US (${person.location})`
    : null;
  return { person, kind, weak, match, rank, reason };
});

const kept = rows.filter((row) => row.reason === null)
  .sort((a, b) => a.rank - b.rank || Number(a.weak) - Number(b.weak) || (a.match === "current" ? -1 : 1));
const leftOut = rows.filter((row) => row.reason !== null);

const guesses = (row: Row): string[] => {
  if (!row.person.name) return [];
  const templates = pattern ? [pattern.template] : COMMON_TEMPLATES.slice(0, 3);
  return templates.flatMap((template) => {
    const local = applyTemplate(template, row.person.name!);
    return local ? [`${local}@${domain}`] : [];
  });
};

const clip = (text: string, length: number) => text.length > length ? `${text.slice(0, length - 1)}…` : text;

console.log(`\n${company} · ${site}`);
console.log(`Mail: ${exchanges.length ? `${domain}${mail.source === "format pages" ? " (learned from format pages)" : ""}, ${mailProvider(exchanges)} (${exchanges[0]})` : `${domain} has no MX records, so it takes no mail`}`);
console.log(`Search results: ${earlyResults.length} early-career, ${recruiterResults.length} recruiter, ${formatResults.length} email format · ${creditsUsed} credits${cachedSearches ? `, ${cachedSearches} searches from cache` : ""}\n`);

const early = kept.filter((row) => row.kind === "early_career");
const others = kept.filter((row) => row.kind !== "early_career");
for (const [label, group] of [["Early-career recruiters", early], ["Other recruiters", others]] as const) {
  console.log(`${label} (${group.length})`);
  for (const row of group) {
    const flags = [row.kind.replace("_", "-"), row.weak ? "from snippet" : null, row.match === "headline" ? "company from headline" : null]
      .filter(Boolean).join(", ");
    console.log(`  ${row.person.name!.display}  [${flags}]`);
    console.log(`    ${clip(row.weak ? row.person.snippet : row.person.headline, 90)}`);
    if (row.person.role || row.person.location) console.log(`    ${[row.person.role, row.person.location].filter(Boolean).join(" · ")}`);
    console.log(`    ${row.person.profileUrl}`);
    console.log(`    ${guesses(row).join("  or  ") || "no guess: the pattern needs a last name"}`);
  }
  console.log("");
}

console.log(`Left out (${leftOut.length})`);
for (const row of leftOut) {
  console.log(`  ${row.person.rawName || row.person.slug}: ${row.reason} · ${clip(row.person.headline || row.person.snippet, 70)}`);
}

console.log("\nEmail pattern");
if (pattern) {
  console.log(`  ${pattern.template}@${domain}: ${pattern.votes} of ${pattern.total} sources agree`);
  for (const claim of claims) console.log(`    ${claim.source}: ${claim.template}${claim.share === null ? "" : ` (${claim.share}%)`}`);
  for (const item of evidence) console.log(`    ${item.name} → ${item.localPart}@${domain} (${item.template})`);
} else {
  console.log(`  No format found for ${domain}, so the guesses above are the three most common formats.`);
}
if (roleAddresses.length) console.log(`  Shared inboxes seen: ${roleAddresses.map((local) => `${local}@${domain}`).join(", ")}`);
console.log("\nNothing was checked or saved. Addresses are unconfirmed guesses.\n");
