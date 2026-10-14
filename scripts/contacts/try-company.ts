/**
 * Tries recruiter sourcing on one company and prints what it finds. Nothing
 * is saved; the admin app's Recruiters review is where results are kept and
 * labelled. See docs/recruiter-contacts-sourcing.md.
 *
 *   bun scripts/contacts/try-company.ts Stripe stripe.com
 *
 * Reads SERPER_API_KEY from the environment or the repository's .dev.vars.
 * One run uses four Serper credits. Emails are pattern guesses: nothing is
 * checked yet, so treat every address as unconfirmed.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyTemplate } from "../../worker/outreach/sourcing/email-pattern";
import { websiteDomain } from "../../worker/outreach/sourcing/mail-domain";
import {
  FALLBACK_TEMPLATES,
  serperSearch,
  sourceCompany,
  type Search,
  type SourcedPerson,
} from "../../worker/outreach/sourcing/source-company";

function fail(message: string): never {
  console.error(message);
  return process.exit(1) as never;
}

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
  return fail("Set SERPER_API_KEY in the environment or in .dev.vars.");
}

// Raw responses are kept a day outside the repository, so re-running after a
// rule change costs no credits.
const CACHE_DIR = join(tmpdir(), "pinkslip-sourcing-cache");
const CACHE_MS = 24 * 60 * 60 * 1000;
let creditsUsed = 0;
let cachedSearches = 0;

function cached(search: Search): Search {
  return async (query, page) => {
    const key = JSON.stringify({ q: query, num: 10, page, gl: "us", hl: "en" });
    const file = join(CACHE_DIR, `${createHash("sha256").update(key).digest("hex").slice(0, 24)}.json`);
    try {
      if (Date.now() - statSync(file).mtimeMs < CACHE_MS) {
        cachedSearches++;
        return (JSON.parse(readFileSync(file, "utf8")) as { organic?: [] }).organic ?? [];
      }
    } catch {
      // Not cached yet.
    }
    const organic = await search(query, page);
    creditsUsed++;
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify({ organic }));
    return organic;
  };
}

const [company = fail("Usage: bun scripts/contacts/try-company.ts <Company name> [website]"), website] = process.argv.slice(2);
const site = websiteDomain(website ?? `${company.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`)
  ?? fail(`Couldn't read a domain from ${website}`);

const result = await sourceCompany(company, site, cached(serperSearch(serperKey())));
const { mail, pattern, claims, provider } = result;
const kept = result.people.filter((row) => row.reason === null);
const leftOut = result.people.filter((row) => row.reason !== null);

const guesses = (row: SourcedPerson): string[] => {
  if (row.emailGuess) return [row.emailGuess];
  if (pattern || !row.person.name) return [];
  return FALLBACK_TEMPLATES.flatMap((template) => {
    const local = applyTemplate(template, row.person.name!);
    return local ? [`${local}@${mail.domain}`] : [];
  });
};
const clip = (text: string, length: number) => text.length > length ? `${text.slice(0, length - 1)}…` : text;

console.log(`\n${company} · ${site}`);
console.log(`Mail: ${mail.exchanges.length
  ? `${mail.domain}${mail.source === "format pages" ? " (learned from format pages)" : ""}, ${provider} (${mail.exchanges[0]})`
  : `${mail.domain} has no MX records, so it takes no mail`}`);
console.log(`${creditsUsed} credits${cachedSearches ? `, ${cachedSearches} searches from cache` : ""}\n`);

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
    const shown = guesses(row);
    console.log(`    ${shown.length ? `${shown.join("  or  ")}${row.emailConfidence ? ` (${row.emailConfidence})` : ""}` : "no guess: the format needs a last name"}`);
  }
  console.log("");
}

console.log(`Left out (${leftOut.length})`);
for (const row of leftOut) {
  console.log(`  ${row.person.rawName || row.person.slug}: ${row.reason} · ${clip(row.person.headline || row.person.snippet, 70)}`);
}

console.log("\nEmail pattern");
if (pattern) {
  console.log(`  ${pattern.template}@${mail.domain}: ${pattern.votes} of ${pattern.total} sources agree`);
  for (const claim of claims) console.log(`    ${claim.source}: ${claim.template}${claim.share === null ? "" : ` (${claim.share}%)`}`);
} else {
  console.log(`  No format found for ${mail.domain}, so the guesses above are the three most common formats.`);
}
if (result.roleAddresses.length) console.log(`  Shared inboxes seen: ${result.roleAddresses.map((local) => `${local}@${mail.domain}`).join(", ")}`);
console.log("\nNothing was checked or saved. Addresses are unconfirmed guesses.\n");
