/**
 * Scores the visa-sponsorship fact against hand labels, offline. Nothing is
 * written to a database.
 *
 *   bun scripts/benchmarks/job_facts.ts <private dataset directory> [--wider] [--misses]
 *
 * Without --wider it scores what classifyJob stores today; with it, the wider
 * reading in worker/sponsorship.ts, whatever its switch says.
 *
 * The directory holds `mention.json` and `random.json` (postings with their
 * text, as stored) and `visa-labels.json` ({ id: { visa, split, sample, group } }).
 * Keep it outside Git, as with the representative benchmark: the postings are
 * other people's text.
 *
 * Labels: `no` (won't sponsor), `yes` (sponsors), `maybe` (conditional),
 * `us_person` (a U.S. person, citizen or clearance is required), `none`.
 * Only `no` and `yes` should produce a fact; everything else should stay
 * unknown, so a `no` on a `maybe` posting counts as a wrong `no`.
 */
import fs from "node:fs";
import { classifyJob } from "../../worker/job-features";
import { sponsorshipStatement } from "../../worker/sponsorship";

type Label = "no" | "yes" | "maybe" | "us_person" | "none";
interface Posting { id: string; title: string; company: string; location: string | null; department: string | null; salary: string | null; url: string | null; description: string | null; sponsorship_available: number | null; requires_security_clearance: number | null }
interface LabelRow { visa: Label; split: "dev" | "held_out"; sample: "mention" | "random"; group: string }

const root = process.argv[2];
if (!root) throw new Error("Usage: bun scripts/benchmarks/job_facts.ts <private dataset directory> [--misses]");
const showMisses = process.argv.includes("--misses");
const wider = process.argv.includes("--wider");
const read = <T>(name: string): T => JSON.parse(fs.readFileSync(`${root}/${name}`, "utf8"));
const postings = [...read<Posting[]>("mention.json"), ...read<Posting[]>("random.json")];
const labels = read<Record<string, LabelRow>>("visa-labels.json");

const said = (value: boolean | null) => value === null ? "unknown" : value ? "yes" : "no";
const rows = postings.map((posting) => {
  const label = labels[posting.id];
  if (!label) throw new Error(`No label for ${posting.id}`);
  const features = classifyJob({
    externalId: posting.id,
    title: posting.title,
    url: posting.url ?? "https://example.com/offline",
    location: posting.location ?? "",
    department: posting.department,
    postedAt: null,
    description: posting.description,
    salary: posting.salary,
  });
  const stored = posting.sponsorship_available === null ? null : posting.sponsorship_available === 1;
  const stated = wider ? sponsorshipStatement(posting.description) : features.sponsorship_available;
  return { posting, label, now: said(stated), today: said(features.sponsorship_available), stored: said(stored), clearance: features.requires_security_clearance };
});

type Row = (typeof rows)[number];
/** One row per distinct wording, so a sentence a company pastes into thirty postings counts once. */
const distinct = (list: Row[]) => [...new Map(list.map((row) => [`${row.label.group}:${row.now}`, row])).values()];

function score(list: Row[], fact: "no" | "yes") {
  const labelled = list.filter((row) => row.label.visa === fact);
  const predicted = list.filter((row) => row.now === fact);
  const right = predicted.filter((row) => row.label.visa === fact);
  const pct = (a: number, b: number) => b === 0 ? "n/a" : `${Math.round((a / b) * 100)}%`;
  return `${fact}: found ${right.length} of ${labelled.length} (${pct(right.length, labelled.length)}); said ${predicted.length}, right ${right.length} (${pct(right.length, predicted.length)})`;
}

function report(title: string, list: Row[]) {
  console.log(`\n${title}: ${list.length} postings, ${distinct(list).length} distinct wordings`);
  console.log(`  postings   ${score(list, "no")}  |  ${score(list, "yes")}`);
  console.log(`  wordings   ${score(distinct(list), "no")}  |  ${score(distinct(list), "yes")}`);
}

const drift = rows.filter((row) => row.today !== row.stored).length;
console.log(`Scoring ${wider ? "the wider reading" : "what is stored today"}. Classifier here against the stored fact: ${rows.length - drift} of ${rows.length} agree.`);
const mention = rows.filter((row) => row.label.sample === "mention");
const random = rows.filter((row) => row.label.sample === "random");
report("Postings that mention it, dev companies", mention.filter((row) => row.label.split === "dev"));
report("Postings that mention it, held-out companies", mention.filter((row) => row.label.split === "held_out"));
report("Postings that mention it, all", mention);
report("Random open postings", random);

const usPerson = rows.filter((row) => row.label.visa === "us_person");
console.log(`\nU.S. person, citizen or clearance required: ${usPerson.length} labelled; the clearance flag is on for ${usPerson.filter((row) => row.clearance).length}; it is on for ${rows.filter((row) => row.clearance && row.label.visa !== "us_person").length} others.`);

if (showMisses) {
  const wrong = distinct(rows.filter((row) => (row.label.visa === "no" || row.label.visa === "yes" ? row.now !== row.label.visa : row.now !== "unknown")));
  for (const split of ["dev", "held_out"] as const) {
    console.log(`\nWrong, ${split}:`);
    for (const row of wrong.filter((item) => item.label.split === split)) {
      console.log(`  ${row.label.group} ${row.posting.company}: labelled ${row.label.visa}, said ${row.now}`);
    }
  }
}
