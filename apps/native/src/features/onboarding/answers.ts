import { NO_ROLE_PREFERENCE, roleChips, rolesFromChips, type Profile } from "@pinkslip/core/profile-fields";
import { ONBOARDING_VERSION, type CareerStage, type LocationId, type WorkMode } from "@pinkslip/domain/search-profile";
import { wantsRemote, withRemote } from "../redesign/search-draft";

/** The three questions, in order: Your search's career stage, roles and where. */
export type Question = "stage" | "roles" | "where";
export const QUESTIONS: readonly Question[] = ["stage", "roles", "where"];

/** The saved search with the questions unanswered, so none starts ticked
 * with the defaults: no stage or role picked, and anywhere in the US
 * without Remote, the one answer that's fine to keep. */
export function unanswered(profile: Profile): Profile {
  const onSite = profile.work_modes.filter((mode) => mode !== "remote");
  const work_modes: WorkMode[] = onSite.length > 0 ? onSite : ["onsite", "hybrid"];
  return { ...profile, target_levels: [], roles: [], location_ids: [], relocation_willing: false, work_modes };
}

/** Adds or takes away one value. Unlike Your search, a question can be
 * emptied again; Continue just waits. */
function flip<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** A career stage chip, on or off. */
export function pickStage(draft: Profile, id: CareerStage): Partial<Profile> {
  return { target_levels: flip(draft.target_levels, id) };
}

/** A role chip: Any role is every role and stands alone; a role turns Any off. */
export function pickRole(draft: Profile, id: string): Partial<Profile> {
  if (id === NO_ROLE_PREFERENCE) return rolesFromChips(draft, [NO_ROLE_PREFERENCE]) ?? {};
  const next = flip(roleChips(draft).filter((chip) => chip !== NO_ROLE_PREFERENCE), id);
  if (next.length === 0) return { roles: [] };
  return rolesFromChips(draft, next) ?? {};
}

/** Anywhere in the US, or a city: a city turns Anywhere off, and taking the
 * last one away leaves Anywhere. */
export function pickPlace(draft: Profile, id: LocationId | "anywhere"): Partial<Profile> {
  if (id === "anywhere") return { location_ids: [], relocation_willing: false };
  return { location_ids: flip(draft.location_ids, id), relocation_willing: false };
}

/** Remote, on or off, alongside the places. */
export function flipRemote(draft: Profile): Partial<Profile> {
  return withRemote(draft, !wantsRemote(draft));
}

/** Continue waits for a stage and a role; where is answered as it stands. */
export function canContinue(question: Question, draft: Profile): boolean {
  if (question === "stage") return draft.target_levels.length > 0;
  if (question === "roles") return roleChips(draft).length > 0;
  return true;
}

/** What one answer changes in the search, and nothing else. */
export function answer(question: Question, draft: Profile): Partial<Profile> {
  if (question === "stage") return { target_levels: draft.target_levels };
  if (question === "roles") return { roles: draft.roles, primary_role: draft.primary_role };
  return { location_ids: draft.location_ids, relocation_willing: draft.relocation_willing, work_modes: draft.work_modes };
}

/** The search to save after answering `question`: the saved one with that
 * answer in, and marked done after the last. */
export function withAnswer(saved: Profile, question: Question, draft: Profile, now: Date): Profile {
  const next = { ...saved, ...answer(question, draft) };
  if (question !== QUESTIONS[QUESTIONS.length - 1]) return next;
  return { ...next, onboarding_version: ONBOARDING_VERSION, onboarding_completed_at: now.toISOString() };
}
