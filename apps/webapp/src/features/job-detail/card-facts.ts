import { formatRowLocation, formatRowSalary } from "@pinkslip/core/job-format";
import type { PublicJob } from "@pinkslip/domain/public-jobs";

/** The line under a job card's title, and its share text: the pay and the
 * place, as a job row shows them ("$150–180K · New York"). */
export function cardFacts(job: Pick<PublicJob, "salary" | "location">): string {
  return [formatRowSalary(job.salary), formatRowLocation(job.location)].filter(Boolean).join(" · ");
}

/** About two lines of a card's title at its size. */
const TITLE_LIMIT = 58;

/** The title, cut at a word with an ellipsis when it would run past two lines. */
export function cardTitle(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= TITLE_LIMIT) return clean;
  const cut = clean.slice(0, TITLE_LIMIT);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), TITLE_LIMIT - 12)).replace(/[\s,–-]+$/, "")}…`;
}
