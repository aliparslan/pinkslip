import { formatResumeDate } from "@pinkslip/core/resume-fields";

/** An end date that means "still here". */
export const PRESENT = /^(present|current)$/i;

/** "Jun – Aug 2025", "Sep 2023 – now". */
export function dateRange(start: string, end: string): string {
  const from = formatResumeDate(start);
  const current = PRESENT.test(end.trim());
  const to = current ? "now" : formatResumeDate(end);
  if (!from) return to === "now" ? "" : to;
  if (!to) return from;
  const [fromMonth, fromYear] = from.split(" ");
  const [, toYear] = to.split(" ");
  return fromYear && fromYear === toYear ? `${fromMonth} – ${to}` : `${from} – ${to}`;
}

/** "The University of Texas at Austin" is "UT Austin"; other names stay. */
export function shortSchool(name: string): string {
  const trimmed = name.trim();
  const match = /^the university of (.+?) at (.+)$/i.exec(trimmed);
  if (match) return `U${match[1]!.split(" ").map((word) => word[0]).join("").toUpperCase()} ${match[2]}`;
  return trimmed;
}


/** "Added Oct 29": when your resume's PDF was kept on this phone (Paper
 * "Resume file · Nov 4"), with the year when it isn't this one. */
export function addedLine(savedAt: string, now = new Date()): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "Added";
  const sameYear = date.getFullYear() === now.getFullYear();
  return `Added ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })}`;
}
