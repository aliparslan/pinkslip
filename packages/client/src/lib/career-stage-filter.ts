import {
  CAREER_STAGE_OPTIONS,
  type CareerStage,
} from "../../../../shared/search-profile";

export const ALL_CAREER_STAGES = CAREER_STAGE_OPTIONS.map(
  (option) => option.id,
) as CareerStage[];

export function orderedCareerStages(
  stages: readonly CareerStage[] | undefined,
): CareerStage[] {
  if (!stages) return [...ALL_CAREER_STAGES];
  const selected = new Set(stages);
  const ordered = ALL_CAREER_STAGES.filter((stage) => selected.has(stage));
  return ordered.length > 0 ? ordered : [...ALL_CAREER_STAGES];
}

export function sameCareerStages(
  selected: readonly CareerStage[],
  available: readonly CareerStage[],
): boolean {
  return selected.length === available.length
    && available.every((stage) => selected.includes(stage));
}

/**
 * The feed API only needs a career-stage query for a proper subset of the
 * stages already saved in the user's search profile.
 */
export function careerStageQuery(
  selected: readonly CareerStage[],
  available: readonly CareerStage[],
): string | undefined {
  const constrained = available.filter((stage) => selected.includes(stage));
  if (constrained.length === 0 || sameCareerStages(constrained, available)) {
    return undefined;
  }
  return constrained.join(",");
}

export function reconcileCareerStageSelection(
  selected: readonly CareerStage[],
  available: readonly CareerStage[],
  nextAvailable: readonly CareerStage[] | undefined,
  force = false,
): { available: CareerStage[]; selected: CareerStage[] } {
  const orderedAvailable = orderedCareerStages(nextAvailable);
  const previouslySelectedAll = sameCareerStages(selected, available);
  const constrained = selected.filter((stage) => orderedAvailable.includes(stage));
  return {
    available: orderedAvailable,
    selected: force || previouslySelectedAll || constrained.length === 0
      ? [...orderedAvailable]
      : constrained,
  };
}
