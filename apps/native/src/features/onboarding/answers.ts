import { allRoles, hasNoRolePreference, NO_ROLE_PREFERENCE, roleChips, rolesFromChips, type Profile } from "@pinkslip/core/profile-fields";
import {
  CAREER_STAGE_OPTIONS, LOCATION_OPTIONS, ONBOARDING_VERSION, type CareerStage, type LocationId, type RoleId, type WorkMode,
} from "@pinkslip/domain/search-profile";
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

/** The search to save once the questions are done: the saved one with each
 * answer in, marked done. */
export function answeredSearch(saved: Profile, draft: Profile, now: Date): Profile {
  const answers = QUESTIONS.reduce<Partial<Profile>>((all, question) => ({ ...all, ...answer(question, draft) }), {});
  return { ...saved, ...answers, onboarding_version: ONBOARDING_VERSION, onboarding_completed_at: now.toISOString() };
}

/** The search widened to everything (every stage and role, anywhere, any way
 * of working). It's saved while the hook plays, so the jobs fetched for the
 * feed behind the questions hold every kind they can narrow to. */
export function everything(profile: Profile): Profile {
  return {
    ...profile, target_levels: CAREER_STAGE_OPTIONS.map((option) => option.id), roles: [...allRoles], primary_role: allRoles[0]!,
    location_ids: [], relocation_willing: false, work_modes: ["remote", "hybrid", "onsite"],
  };
}

/** What the feed behind the questions reads of a job. */
export interface PreviewJob {
  match_fact?: string | null;
  specialties?: readonly string[];
  location: string;
}

/** The career stages a job's level line puts it in, by the server's stage
 * rules (`buildStageExperienceFilter`); null when the job doesn't say. */
export function jobStages(matchFact: string | null | undefined): CareerStage[] | null {
  if (matchFact === "Internship") return ["internship"];
  if (matchFact === "New-grad role") return ["new_grad"];
  if (matchFact === "Early-career role") return ["early_career"];
  const years = /(\d+)\+ years/.exec(matchFact ?? "");
  if (!years) return null;
  const asked = Number(years[1]);
  const stages: CareerStage[] = [];
  if (asked <= 3) stages.push("early_career");
  if (asked >= 3 && asked <= 5) stages.push("mid_career");
  return stages;
}

const aliases = new Map<string, readonly string[]>(LOCATION_OPTIONS.map((option) => [option.id, option.aliases]));
const inPlaces = (text: string, ids: readonly string[]) => ids.some((id) => aliases.get(id)?.some((alias) => text.includes(alias)));

/** Whether a job fits the answers so far, for the feed behind the questions,
 * so it changes the moment a chip does (the Onboarding Motion Lab). A
 * question left empty doesn't narrow it, and where only counts once it's
 * asked. The server has the last word once the answers are saved. */
export function fitsAnswers(job: PreviewJob, draft: Profile, whereAsked: boolean): boolean {
  if (draft.target_levels.length > 0) {
    const stages = jobStages(job.match_fact);
    if (stages ? !stages.some((stage) => draft.target_levels.includes(stage)) : !draft.include_unspecified_experience) return false;
  }
  if (draft.roles.length > 0 && !hasNoRolePreference(draft)) {
    const roles = job.specialties?.length ? job.specialties : ["software_engineering"];
    if (!roles.some((role) => draft.roles.includes(role as RoleId))) return false;
  }
  if (!whereAsked) return true;
  const text = job.location.toLowerCase();
  const remote = text.includes("remote");
  if (draft.location_ids.length === 0) return wantsRemote(draft) || !remote || inPlaces(text, [...aliases.keys()]);
  return inPlaces(text, draft.location_ids) || (wantsRemote(draft) && remote);
}
