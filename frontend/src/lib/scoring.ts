import {
  normalizeScorePercent,
  SCORE_RAW_MAX,
} from "../../../shared/scoring";

export const JOB_SCORE_RAW_MAX = SCORE_RAW_MAX;

export function normalizeJobScore(rawScore: number | null | undefined): number {
  return normalizeScorePercent(rawScore);
}

export function scoreLabelFromPercent(scorePercent: number): string {
  if (scorePercent >= 70) return "Strong match";
  if (scorePercent >= 40) return "Moderate match";
  return "Low match";
}

export function scoreToneFromPercent(scorePercent: number): string {
  if (scorePercent >= 70) return "var(--color-good)";
  if (scorePercent >= 40) return "var(--color-warn)";
  return "var(--color-ink-3)";
}
