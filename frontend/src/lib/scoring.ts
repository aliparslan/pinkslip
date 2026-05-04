export const JOB_SCORE_RAW_MAX = 95;

export function normalizeJobScore(rawScore: number | null | undefined): number {
  const score = rawScore ?? 0;
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / JOB_SCORE_RAW_MAX) * 100)));
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
