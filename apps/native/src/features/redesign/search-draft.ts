import { locationLabels } from "@pinkslip/core/feed-criteria";
import { hasNoLocationPreference, NO_ROLE_PREFERENCE, roleChips, type Profile } from "@pinkslip/core/profile-fields";
import { CAREER_STAGE_OPTIONS, ROLE_OPTIONS, type CareerStage, type WorkMode } from "@pinkslip/domain/search-profile";

/**
 * Your search as the Your search sheet shows it (Paper "Filters A"): each box
 * of the ticket summarised in a few words, and the small rules for changing
 * it.
 */

/** "New grad, Early career": the stage names without their year ranges. */
export const stageName = (id: string) => CAREER_STAGE_OPTIONS.find((option) => option.id === id)?.label.replace(/ \(.*\)$/, "") ?? id;

/** The stages in the order they're offered: Internships last, since most
 * people here are past them (owner, 2026-10-15, audit Q10). */
export const STAGES_IN_ORDER: readonly CareerStage[] = ["new_grad", "early_career", "mid_career", "internship"];

/** The stage names for half a ticket: "New grad, Early". */
const stageShort: Record<CareerStage, string> = {
  internship: "Interns",
  new_grad: "New grad",
  early_career: "Early",
  mid_career: "Mid",
};

/** At most two names, then "+N". */
function few(names: string[]): string {
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

/** The career stages for a menu row: every stage is "Any", one is its
 * short name, more show the first and a count ("New grad +1"), so the value
 * never wraps (owner, 2026-10-15). */
export function stageSummary(profile: Profile): string {
  const names = STAGES_IN_ORDER.filter((id) => profile.target_levels.includes(id)).map((id) => stageShort[id]);
  if (names.length === CAREER_STAGE_OPTIONS.length) return "Any";
  return names.length <= 1 ? names.join("") : `${names[0]} +${names.length - 1}`;
}

export function rolesSummary(profile: Profile): string {
  const chips = roleChips(profile);
  if (chips.includes(NO_ROLE_PREFERENCE)) return "Any";
  return few(ROLE_OPTIONS.filter((option) => chips.includes(option.id)).map((option) => option.label));
}

export function experienceSummary(profile: Profile): string {
  const years = profile.max_required_years;
  if (years === null) return "Up to my experience";
  return years === 0 ? "None" : `Up to ${years} ${years === 1 ? "year" : "years"}`;
}

export function citiesSummary(profile: Profile): string {
  if (hasNoLocationPreference(profile)) return "Anywhere";
  return few(profile.location_ids.map((id) => locationLabels[id]));
}

/** Remote and the cities together: "Remote (US), NYC, SF Bay Area". */
export function whereSummary(profile: Profile): string {
  const remote = wantsRemote(profile);
  const onlyRemote = remote && profile.work_modes.length === 1;
  if (onlyRemote) return "Remote (US)";
  if (hasNoLocationPreference(profile)) return "Anywhere in the US";
  const cities = profile.location_ids.map((id) => locationLabels[id]);
  return few(remote ? ["Remote (US)", ...cities] : cities);
}

export const wantsRemote = (profile: Profile) => profile.work_modes.includes("remote");

/** Remote on or off. A search always keeps at least one way of working, so
 * turning Remote off leaves on-site and hybrid. */
export function withRemote(profile: Profile, remote: boolean): Partial<Profile> {
  const others = profile.work_modes.filter((mode) => mode !== "remote");
  const work_modes: WorkMode[] = remote ? ["remote", ...others] : others.length > 0 ? others : ["onsite", "hybrid"];
  return { work_modes };
}

export const needsSponsorship = (profile: Profile) => profile.work_authorization === "sponsorship";

/** Adds or removes one value, never leaving the list empty (null: refused). */
export function toggled<T>(list: readonly T[], value: T): T[] | null {
  const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  return next.length > 0 ? next : null;
}

const sameSet = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((item) => b.includes(item));

/** The menu rows whose choices differ from the saved search, in menu order.
 * Order alone isn't a change: tapping a city off and on again saves nothing. */
export function changedRows(saved: Profile, draft: Profile): string[] {
  const rows: [string, boolean][] = [
    ["Career stage", !sameSet(saved.target_levels, draft.target_levels)],
    ["Roles", !sameSet(roleChips(saved), roleChips(draft))],
    ["Where", !sameSet(saved.location_ids, draft.location_ids) || saved.relocation_willing !== draft.relocation_willing
      || !sameSet(saved.work_modes, draft.work_modes)],
    ["Visa sponsorship", needsSponsorship(saved) !== needsSponsorship(draft)],
    ["Experience asked", saved.max_required_years !== draft.max_required_years
      || saved.include_unspecified_experience !== draft.include_unspecified_experience],
  ];
  return rows.filter(([, differs]) => differs).map(([title]) => title);
}

/** "Roles and Where changed." for Save your changes. */
export function changedSentence(rows: string[]): string {
  if (rows.length <= 1) return `${rows[0] ?? "Your search"} changed.`;
  return `${rows.slice(0, -1).join(", ")} and ${rows[rows.length - 1]} changed.`;
}
