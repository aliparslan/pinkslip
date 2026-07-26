export const SCORE_COMPONENT_MAX = {
  title: 30,
  yoe: 25,
  location: 20,
  department: 10,
  recency: 10,
} as const;

export const SCORE_RAW_MAX =
  SCORE_COMPONENT_MAX.title
  + SCORE_COMPONENT_MAX.yoe
  + SCORE_COMPONENT_MAX.location
  + SCORE_COMPONENT_MAX.department
  + SCORE_COMPONENT_MAX.recency;

/** Convert a 0–100 user threshold to the scorer's raw 0–95 scale. */
export const SCORE_RAW_PER_PERCENT = SCORE_RAW_MAX / 100;

export function normalizeScorePercent(rawScore: number | null | undefined): number {
  const score = rawScore ?? 0;
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / SCORE_RAW_MAX) * 100)));
}
