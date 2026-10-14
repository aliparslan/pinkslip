/**
 * Tries recruiter sourcing on one company and prints what it finds. Nothing
 * is saved. See docs/recruiter-contacts-sourcing.md.
 *
 *   bun scripts/contacts/try-company.ts Stripe stripe.com
 *
 * Reads SERPER_API_KEY from the environment or the repository's .dev.vars.
 * One run uses about five Serper credits. Emails are pattern guesses: nothing
 * is checked yet, so treat every address as unconfirmed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyTemplate,
  COMMON_TEMPLATES,
  addressesAt,
  isRoleAddress,
  likelyTemplate,
  patternEvidence,
} from "../../worker/outreach/sourcing/email-pattern";
import {
  addressQuery,
  classifyRecruiter,
  earlyCareerQuery,
  matchCompany,
  parseLinkedInResult,
  recruiterQuery,
  RECRUITER_KIND_RANK,
  type LinkedInPerson,
  type SearchResult,
} from "../../worker/outreach/sourcing/linkedin-search";
import { lookupMx, mailProvider, websiteDomain } from "../../worker/outreach/sourcing/mail-domain";

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

async function search(key: string, q: string, num: number): Promise<SearchResult[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q, num, gl: "us", hl: "en" }),
  });
  if (!response.ok) throw new Error(`Serper ${response.status}: ${await response.text()}`);
  const body = await response.json() as SerperResponse;
  creditsUsed += body.credits ?? 1;
  return body.organic ?? [];
}

function fail(message: string): never {
  console.error(message);
  return process.exit(1) as never;
}

const [company = fail("Usage: bun scripts/contacts/try-company.ts <Company name> [website]"), website] = process.argv.slice(2);
const domain = websiteDomain(website ?? `${company.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`)
  ?? fail(`Couldn't read a domain from ${website}`);

const key = serperKey();
const [exchanges, earlyResults, recruiterResults, addressResults] = await Promise.all([
  lookupMx(domain).catch(() => [] as string[]),
  search(key, earlyCareerQuery(company), 20),
  search(key, recruiterQuery(company), 20),
  search(key, addressQuery(domain), 10),
]);

const people = new Map<string, LinkedInPerson>();
for (const result of [...earlyResults, ...recruiterResults]) {
  const person = parseLinkedInResult(result);
  if (person && !people.has(person.slug)) people.set(person.slug, person);
}

const addressText = addressResults.map((result) => `${result.title} ${result.snippet ?? ""}`).join("\n");
const peopleText = [...people.values()].map((person) => `${person.rawName} ${person.snippet}`).join("\n");
const evidence = [...patternEvidence(addressText, domain), ...patternEvidence(peopleText, domain)];
const pattern = likelyTemplate(evidence);
const roleAddresses = addressesAt(addressText, domain).filter(isRoleAddress);

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
  const reason = !person.name ? "no usable last name"
    : rank >= 9 ? (kind === "intern" ? "recruiting intern" : "not a recruiter")
    : match === "former" ? "left the company"
    : match === "none" ? "company not confirmed"
    : null;
  return { person, kind, weak, match, rank, reason };
});

const kept = rows.filter((row) => row.reason === null)
  .sort((a, b) => a.rank - b.rank || Number(a.weak) - Number(b.weak) || (a.match === "current" ? -1 : 1));
const leftOut = rows.filter((row) => row.reason !== null);

const guesses = (row: Row): string[] => {
  if (!row.person.name) return [];
  const templates = pattern ? [pattern.template] : COMMON_TEMPLATES.slice(0, 3);
  return templates.map((template) => `${applyTemplate(template, row.person.name!)}@${domain}`);
};

const clip = (text: string, length: number) => text.length > length ? `${text.slice(0, length - 1)}…` : text;

console.log(`\n${company} · ${domain}`);
console.log(`Mail: ${exchanges.length ? `${mailProvider(exchanges)} (${exchanges[0]})` : "no MX records, so this domain takes no mail"}`);
console.log(`Search results: ${earlyResults.length} early-career, ${recruiterResults.length} recruiter, ${addressResults.length} address · ${creditsUsed} credits\n`);

const early = kept.filter((row) => row.kind === "early_career");
const others = kept.filter((row) => row.kind !== "early_career");
for (const [label, group] of [["Early-career recruiters", early], ["Other recruiters", others]] as const) {
  console.log(`${label} (${group.length})`);
  for (const row of group) {
    const flags = [row.kind.replace("_", "-"), row.weak ? "from snippet" : null, row.match === "headline" ? "company from headline" : null]
      .filter(Boolean).join(", ");
    console.log(`  ${row.person.name!.display}  [${flags}]`);
    console.log(`    ${clip(row.weak ? row.person.snippet : row.person.headline, 90)}`);
    console.log(`    ${row.person.profileUrl}`);
    console.log(`    ${guesses(row).join("  or  ")}`);
  }
  console.log("");
}

console.log(`Left out (${leftOut.length})`);
for (const row of leftOut) {
  console.log(`  ${row.person.rawName || row.person.slug}: ${row.reason} · ${clip(row.person.headline || row.person.snippet, 70)}`);
}

console.log("\nEmail pattern");
if (pattern) {
  console.log(`  ${pattern.template}@${domain}, from ${pattern.votes} of ${pattern.total} addresses found in search results:`);
  for (const item of evidence) console.log(`    ${item.name} → ${item.localPart}@${domain} (${item.template})`);
} else {
  console.log(`  No personal addresses at ${domain} in search results, so the guesses above are the three most common formats.`);
}
if (roleAddresses.length) console.log(`  Shared inboxes seen: ${roleAddresses.map((local) => `${local}@${domain}`).join(", ")}`);
console.log("\nNothing was checked or saved. Addresses are unconfirmed guesses.\n");
