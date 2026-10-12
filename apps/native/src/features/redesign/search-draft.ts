import { locationLabels } from "@pinkslip/core/feed-criteria";
import { hasNoLocationPreference, NO_ROLE_PREFERENCE, roleChips, type Profile } from "@pinkslip/core/profile-fields";
import { CAREER_STAGE_OPTIONS, ROLE_OPTIONS, type WorkMode } from "@pinkslip/domain/search-profile";
import { useSyncExternalStore } from "react";

/**
 * The search being edited in the Edit search sheet. The sheet and its pickers
 * are separate screens, so they share the draft here; Save writes it to the
 * saved search, Cancel drops it.
 */
let draft: Profile | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export function startDraft(profile: Profile) {
  draft = profile;
  emit();
}

export function changeDraft(patch: Partial<Profile>) {
  if (!draft) return;
  draft = { ...draft, ...patch };
  emit();
}

export function endDraft() {
  draft = null;
  emit();
}

export function useDraft(): Profile | null {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => draft);
}

/** "New grad, Early career": the stage names without their year ranges. */
export const stageName = (id: string) => CAREER_STAGE_OPTIONS.find((option) => option.id === id)?.label.replace(/ \(.*\)$/, "") ?? id;

/** At most two names, then "+N". */
function few(names: string[]): string {
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

export function stageSummary(profile: Profile): string {
  return few(CAREER_STAGE_OPTIONS.filter((option) => profile.target_levels.includes(option.id)).map((option) => stageName(option.id)));
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

export const wantsRemote = (profile: Profile) => profile.work_modes.includes("remote");

/** Remote on or off. A search always keeps at least one way of working, so
 * turning Remote off leaves on-site and hybrid. */
export function withRemote(profile: Profile, remote: boolean): Partial<Profile> {
  const others = profile.work_modes.filter((mode) => mode !== "remote");
  const work_modes: WorkMode[] = remote ? ["remote", ...others] : others.length > 0 ? others : ["onsite", "hybrid"];
  return { work_modes };
}

export const needsSponsorship = (profile: Profile) => profile.work_authorization === "sponsorship";
