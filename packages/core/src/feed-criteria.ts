import type { CareerStageQuery, JobsListParams } from "@pinkslip/core/api";
import { careerStageQuery, orderedCareerStages } from "@pinkslip/core/career-stage-filter";
import { CAREER_STAGE_OPTIONS, LOCATION_OPTIONS, type CareerStage, type LocationId } from "@pinkslip/domain/search-profile";

/**
 * The feed's filters, shared by the web (typed in the URL so a filtered feed
 * survives reload and can be shared) and the iOS app (its filter sheet). Each filter narrows the saved search profile further; an
 * absent key means "everything the profile allows".
 *
 * - `q`: search text
 * - `loc`: comma-separated metro ids and/or `remote`, or `all` for anywhere;
 *   absent means the profile's own metros, as the current app preselected
 * - `stage`: comma-separated career stages (a subset of the profile's)
 * - `min`, `max`: salary bounds in thousands of dollars
 * - `listing=evergreen`: only long-running listings
 * - `saved=1`: only saved jobs
 */
export interface FeedSearch {
  q?: string;
  loc?: string;
  stage?: string;
  min?: number;
  max?: number;
  listing?: "evergreen";
  saved?: 1;
}

export type FeedLocation = LocationId | "remote";

const locationIds = new Set<string>(["remote", ...LOCATION_OPTIONS.map((option) => option.id)]);
const stageIds = new Set<string>(CAREER_STAGE_OPTIONS.map((option) => option.id));

function list(value: unknown, allowed: Set<string>): string | undefined {
  if (typeof value !== "string") return undefined;
  const items = [...new Set(value.split(",").map((item) => item.trim()).filter((item) => allowed.has(item)))];
  return items.length > 0 ? items.join(",") : undefined;
}

function thousands(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(number) && number > 0 && number < 10_000 ? Math.round(number) : undefined;
}

/** Drops anything malformed rather than failing the page: a hand-edited or
 * outdated link still opens the feed. */
export function validateFeedSearch(search: Record<string, unknown>): FeedSearch {
  const q = typeof search.q === "string" ? search.q.slice(0, 200) : "";
  const result: FeedSearch = {};
  if (q.trim()) result.q = q;
  const loc = search.loc === "all" ? "all" : list(search.loc, locationIds);
  if (loc) result.loc = loc;
  const stage = list(search.stage, stageIds);
  if (stage) result.stage = stage;
  const min = thousands(search.min);
  if (min) result.min = min;
  const max = thousands(search.max);
  if (max) result.max = max;
  if (search.listing === "evergreen") result.listing = "evergreen";
  if (search.saved === 1 || search.saved === "1" || search.saved === true) result.saved = 1;
  return result;
}

export interface LocationProfile {
  location_ids?: readonly string[];
  work_modes?: readonly string[];
}

/** The metros the current app preselected from the profile
 * (`syncFeedPreferences`): only Remote for remote-only searches, otherwise
 * the profile's metros (plus Remote when it's allowed), or anywhere when the
 * profile picked every metro or none. */
export function profileLocations(profile: LocationProfile | undefined): FeedLocation[] {
  const metros = (profile?.location_ids ?? []).filter((id) => locationIds.has(id)) as FeedLocation[];
  const modes = profile?.work_modes ?? [];
  if (modes.length === 1 && modes[0] === "remote") return ["remote"];
  if (metros.length > 0 && metros.length < LOCATION_OPTIONS.length) return modes.includes("remote") ? ["remote", ...metros] : metros;
  return [];
}

/** The locations in effect; empty means anywhere. */
export function locations(search: FeedSearch, defaults: readonly FeedLocation[]): FeedLocation[] {
  if (search.loc === "all") return [];
  return search.loc ? search.loc.split(",") as FeedLocation[] : [...defaults];
}

/** The `loc` value for a chosen set: nothing when it's the profile's own. */
export function locationParam(chosen: readonly FeedLocation[], defaults: readonly FeedLocation[]): string | undefined {
  const same = chosen.length === defaults.length && defaults.every((id) => chosen.includes(id));
  if (same) return undefined;
  return chosen.length === 0 ? "all" : chosen.join(",");
}

/** The stages the filter offers: the profile's, in display order. */
export const availableStages = (profileStages: readonly CareerStage[] | undefined): CareerStage[] =>
  orderedCareerStages(profileStages);

/** The stages currently selected; all of the available ones when unset. */
export function selectedStages(search: FeedSearch, available: readonly CareerStage[]): CareerStage[] {
  const chosen = search.stage?.split(",") ?? [];
  const selected = available.filter((stage) => chosen.includes(stage));
  return selected.length > 0 ? selected : [...available];
}

/** The API query for one set of filters. Page size and offset are added by
 * the feed query. */
export function feedParams(search: FeedSearch, available: readonly CareerStage[], defaults: readonly FeedLocation[]): JobsListParams {
  const params: JobsListParams = {};
  if (search.q?.trim()) params.q = search.q.trim();
  const chosen = locations(search, defaults);
  if (chosen.length > 0) params.locations = chosen.map((id) => (id === "remote" ? "Remote" : id)).join(",");
  const stages = careerStageQuery(selectedStages(search, available), available);
  if (stages) params.stages = stages as CareerStageQuery;
  if (search.min) params.min_salary = String(search.min * 1000);
  if (search.max) params.max_salary = String(search.max * 1000);
  if (search.listing) params.posted = search.listing;
  if (search.saved) params.saved = "true";
  return params;
}

/** How many filter groups narrow the feed (search is separate). */
export function filterCount(search: FeedSearch, available: readonly CareerStage[], defaults: readonly FeedLocation[]): number {
  return [
    locations(search, defaults).length > 0,
    search.min || search.max,
    careerStageQuery(selectedStages(search, available), available),
    search.listing,
    search.saved,
  ].filter(Boolean).length;
}

/** The filters without the view-like `saved` and the search text, which the
 * empty state's "Clear filters" keeps. Location goes to anywhere. */
export function withoutRefinements(search: FeedSearch): FeedSearch {
  const next: FeedSearch = { loc: "all" };
  if (search.q) next.q = search.q;
  if (search.saved) next.saved = 1;
  return next;
}

/** Short metro names for the filter, as in the current app. */
export const locationLabels: Record<FeedLocation, string> = {
  remote: "Remote",
  sf_bay: "SF Bay Area",
  new_york: "NYC",
  chicago: "Chicago",
  boston: "Boston",
  washington_dc: "DC",
  seattle: "Seattle",
  austin: "Austin",
  los_angeles: "LA",
  denver: "Denver",
  atlanta: "Atlanta",
};

export function locationSummary(chosen: readonly FeedLocation[]): string {
  if (chosen.length === 0) return "Anywhere";
  const labels = chosen.map((id) => locationLabels[id]);
  return labels.length <= 2 ? labels.join(", ") : `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}
