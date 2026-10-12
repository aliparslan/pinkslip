import type { Job } from "@pinkslip/core/api";
import { formatCompactSalaryText, formatRowLocation, formatRowSalary, jobLocationParts } from "@pinkslip/core/job-format";
import { compactJobAge } from "@pinkslip/core/job-timing";
import { companySourceLabel, isCompanySourceType } from "@pinkslip/domain/company-sources";
import { LOCATION_OPTIONS, ROLE_OPTIONS, type SearchProfile } from "@pinkslip/domain/search-profile";

/** What the redesigned screens read from a job (a feed row or the full posting). */
export type FactsJob = Pick<Job, "title" | "location" | "salary" | "posted_at" | "first_seen_at"> &
  Partial<Pick<Job, "match_fact" | "sponsorship_available" | "source_type" | "specialties" | "applied_at">>;

type Stage = "internship" | "new_grad" | "early_career" | "mid_career";

/** The career stage and stated years behind the API's match fact
 * ("Internship", "New-grad role", "Asks for 3+ years", "Early-career role"). */
function stageOf(job: FactsJob): { stage: Stage | null; years: number | null } {
  const fact = job.match_fact ?? "";
  if (fact === "Internship") return { stage: "internship", years: null };
  if (fact === "New-grad role") return { stage: "new_grad", years: null };
  if (fact === "Early-career role") return { stage: "early_career", years: null };
  const asks = /^Asks for (\d+)\+ years$/.exec(fact);
  if (asks) {
    const years = Number(asks[1]);
    return { stage: years <= 3 ? "early_career" : "mid_career", years };
  }
  return { stage: null, years: null };
}

const levelNames: Record<Stage, string> = {
  internship: "Internship",
  new_grad: "New grad",
  early_career: "Early career",
  mid_career: "Mid-career",
};

// Words in a title that already say the level, so the row needn't repeat it.
const titleLevels: Record<Stage, RegExp> = {
  internship: /\b(intern|internship|co-?op|apprentice)/i,
  new_grad: /\b(new grad|graduate|entry[- ]level|university|campus)/i,
  early_career: /\b(early career|junior|associate)\b/i,
  mid_career: /$^/,
};

/** The level for the ticket: "New grad", "Internship", "Early career". */
export function jobLevel(job: FactsJob): string | null {
  const { stage } = stageOf(job);
  return stage ? levelNames[stage] : null;
}

/** The stated experience for the ticket ("3+ years"), only when the posting says. */
export function jobExperience(job: FactsJob): string | null {
  const { years } = stageOf(job);
  return years === null ? null : `${years}+ years`;
}

/** The level as a row says it: short, and left out when the title already
 * says it ("Software Engineer, New Grad" needs no "New grad"). */
export function rowLevel(job: FactsJob): string | null {
  const { stage, years } = stageOf(job);
  if (!stage || titleLevels[stage].test(job.title)) return null;
  if (years !== null) return `${years}+ yrs`;
  return stage === "early_career" ? "1–3 yrs" : levelNames[stage];
}

/** Line two of a row after the company: level, place, pay. */
export function rowFacts(job: FactsJob): string {
  return [rowLevel(job), formatRowLocation(job.location), formatRowSalary(job.salary)].filter(Boolean).join(" · ");
}

/** The age in the row's trailing slot: "2h", "3d". */
export function rowAge(job: FactsJob): string | undefined {
  return compactJobAge(job) ?? undefined;
}

export interface TicketFactValue {
  label: string;
  value: string;
  /** The value matches the saved search (the place you searched for). */
  matched?: boolean;
  /** A quieter second line: the other places when there are several. */
  detail?: string;
}

/** Whether one of the posting's places is one the profile searches: remote
 * when it wants remote work, or one of its metros. */
export function placeMatches(place: string, profile: SearchProfile | undefined): boolean {
  if (!profile) return false;
  const lower = place.toLowerCase();
  if (lower.includes("remote")) return profile.work_modes.includes("remote");
  return LOCATION_OPTIONS.some((option) => profile.location_ids.includes(option.id) && option.aliases.some((alias) => lower.includes(alias)));
}

const NOT_LISTED = "Not listed";

/** Every place, the ones the saved search covers first. */
export function orderedPlaces(job: FactsJob, profile: SearchProfile | undefined): { place: string; matched: boolean }[] {
  const places = jobLocationParts(job.location).map((place) => ({ place, matched: placeMatches(place, profile) }));
  return [...places.filter((entry) => entry.matched), ...places.filter((entry) => !entry.matched)];
}

/** The ticket's grid, the same for every job: Level | Pay, Location, Visa
 * sponsorship | Experience. Missing facts say "Not listed" so the grid holds.
 * With several places, the one you searched for leads and the rest follow on
 * a quieter line. */
export function ticketRows(job: FactsJob, profile?: SearchProfile): TicketFactValue[][] {
  const places = orderedPlaces(job, profile);
  const visa = job.sponsorship_available === true ? "Yes" : job.sponsorship_available === false ? "No" : NOT_LISTED;
  const location: TicketFactValue = places.length > 1
    ? { label: "Locations", value: places[0].place, matched: places[0].matched, detail: otherPlaces(places.slice(1).map((entry) => entry.place)) }
    : { label: "Location", value: places[0]?.place ?? NOT_LISTED, matched: places[0]?.matched };
  return [
    [{ label: "Level", value: jobLevel(job) ?? NOT_LISTED }, { label: "Pay", value: formatCompactSalaryText(job.salary) ?? NOT_LISTED }],
    [location],
    [{ label: "Visa sponsorship", value: visa }, { label: "Experience", value: jobExperience(job) ?? NOT_LISTED }],
  ];
}

/** "Seattle, Austin and 3 more": two names, then a count. */
function otherPlaces(places: string[]): string {
  if (places.length <= 2) return places.join(" and ");
  return `${places.slice(0, 2).join(", ")} and ${places.length - 2} more`;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The stub under the perforation: "Posted Oct 9 · via Greenhouse". Greenhouse
 * reports its last update, not the posting date, so it says "Updated". */
export function ticketStub(job: FactsJob): string {
  const date = job.posted_at
    ? `${job.source_type === "greenhouse" ? "Updated" : "Posted"} ${shortDate(job.posted_at)}`
    : `Found ${shortDate(job.first_seen_at)}`;
  const source = job.source_type && job.source_type !== "custom" && isCompanySourceType(job.source_type)
    ? `via ${companySourceLabel(job.source_type)}` : null;
  return [date, source].filter(Boolean).join(" · ");
}

/** "Applied Oct 10", or just "Applied" when the date isn't known. */
export function appliedLabel(job: FactsJob): string {
  return job.applied_at ? `Applied ${shortDate(job.applied_at)}` : "Applied";
}

const stageWords: Record<Stage, string> = {
  internship: "internship",
  new_grad: "new grad",
  early_career: "early career",
  mid_career: "mid-career",
};

/** Why the job fits the saved search, in the profile's own terms:
 * "new grad, remote, SWE". Empty when nothing can be said for sure. */
export function fitsYourSearch(job: FactsJob, profile: SearchProfile | undefined): string[] {
  if (!profile) return [];
  const reasons: string[] = [];
  const { stage } = stageOf(job);
  if (stage && (profile.target_levels as readonly string[]).includes(stage)) reasons.push(stageWords[stage]);
  const place = (job.location ?? "").toLowerCase();
  if (profile.work_modes.includes("remote") && place.includes("remote")) reasons.push("remote");
  const metro = LOCATION_OPTIONS.find((option) => profile.location_ids.includes(option.id) && option.aliases.some((alias) => place.includes(alias)));
  if (metro) reasons.push(metro.label.split(/,| \//)[0]);
  const roles = ROLE_OPTIONS.filter((role) => profile.roles.includes(role.id) && job.specialties?.includes(role.id));
  for (const role of roles.slice(0, 2)) reasons.push(role.label);
  if (profile.work_authorization === "sponsorship" && job.sponsorship_available === true) reasons.push("sponsors visas");
  return reasons;
}

export interface FeedSection<T> {
  title: string;
  jobs: T[];
}

const DAY = 24 * 60 * 60 * 1000;

/** "New today", "Earlier this week", then "Older", by the posting's date in
 * local time. Empty sections are left out. */
export function feedSections<T extends FactsJob>(jobs: T[], now = new Date()): FeedSection<T>[] {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sections: FeedSection<T>[] = [
    { title: "New today", jobs: [] },
    { title: "Earlier this week", jobs: [] },
    { title: "Older", jobs: [] },
  ];
  for (const job of jobs) {
    const at = new Date(job.posted_at ?? job.first_seen_at).getTime();
    const index = at >= midnight ? 0 : at >= midnight - 6 * DAY ? 1 : 2;
    sections[index].jobs.push(job);
  }
  return sections.filter((section) => section.jobs.length > 0);
}
