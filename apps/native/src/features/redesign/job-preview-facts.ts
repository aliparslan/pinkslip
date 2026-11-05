import type { DescriptionBlock, DescriptionRun } from "@pinkslip/core/job-description";
import type { ResumeProfile } from "@pinkslip/domain/resume-profile";

/**
 * The long-press preview's role lines (Paper "Job preview on long press ·
 * Nov 4", B, approved): the job in its own words, one line from what you'd
 * do and one from what it asks, when the description has those sections,
 * and how the years asked compare with the resume's.
 */

const DOES = /what you('|’)?ll do|what you will do|what you('|’)?ll be doing|what you('|’)?ll work on|responsibilit|in this role|day.to.day|your impact|the role/i;
const ASKS = /qualif|requirement|looking for|you (have|bring|need)|about you|who you are|must.have|what it takes|skills/i;
/** A line in a preview is a glance, not the paragraph. */
const MAX = 110;

const text = (runs: DescriptionRun[]) => runs.map((run) => run.text).join("").replace(/\s+/g, " ").trim();

function short(line: string): string {
  const clean = line.replace(/^[•\-–]\s*/, "").replace(/[;:,]$/, "").trim();
  if (clean.length <= MAX) return clean;
  const cut = clean.slice(0, MAX);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

/** The first thing under the first heading that matches: a list's first
 * item, or a paragraph's first sentence. */
function firstUnder(blocks: readonly DescriptionBlock[], heading: RegExp): string | null {
  const at = blocks.findIndex((block) => block.kind === "heading" && heading.test(text(block.runs)));
  if (at < 0) return null;
  const next = blocks.slice(at + 1).find((block) => block.kind !== "heading");
  if (!next || blocks.slice(at + 1, blocks.indexOf(next)).some((block) => block.kind === "heading")) return null;
  const first = next.kind === "list" ? text(next.items[0] ?? []) : text(next.runs).split(/(?<=[.!?])\s/)[0] ?? "";
  return first ? short(first) : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Aug 2025" or "2023" as a time, parsed by hand: Hermes reads few date formats. */
function monthOf(value: string): number | null {
  const year = Number(value.match(/\b(19|20)\d{2}\b/)?.[0]);
  if (!year) return null;
  const month = MONTHS.indexOf(value.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/)?.[1] ?? "");
  return Date.UTC(year, Math.max(0, month), 1);
}

/** "You have about 1" when the job asks for more years than the resume's
 * first role to now; null when it doesn't, or either is unknown. */
export function yearsGap(asked: number | null, profile: ResumeProfile | null | undefined, now = new Date()): string | null {
  if (asked === null || !profile) return null;
  const starts = profile.experience.map((entry) => monthOf(entry.startDate)).filter((at): at is number => at !== null);
  if (starts.length === 0) return null;
  const years = Math.floor((now.getTime() - Math.min(...starts)) / (365.25 * 24 * 60 * 60_000));
  if (years >= asked) return null;
  return years < 1 ? "you have under 1" : `you have about ${years}`;
}

export function roleLines(blocks: readonly DescriptionBlock[], gap: string | null, asked: number | null): { does: string | null; asks: string | null } {
  const does = firstUnder(blocks, DOES);
  const wants = firstUnder(blocks, ASKS);
  // The years gap rides on what it asks, or says the years itself.
  const asks = wants ? [wants, gap].filter(Boolean).join(" · ")
    : gap && asked !== null ? `Asks for ${asked}+ years · ${gap}` : null;
  return { does, asks };
}
