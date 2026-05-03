import type { JobListing } from "./adapters/types";

export interface ScoringPrefs {
  locations: string[];
  min_yoe: number;
  max_yoe: number;
  role_keywords: string[];
  negative_keywords: string[];
}

// ─── Title Match (0–35) ──────────────────────────────────────────────────────

const HIGH_TITLE_KEYWORDS = [
  "software engineer",
  "fullstack",
  "full stack",
  "full-stack",
  "backend",
  "back end",
  "back-end",
  "frontend",
  "front end",
  "front-end",
  "forward deployed engineer",
];

const MEDIUM_TITLE_KEYWORDS = ["engineer", "developer", "swe"];

/**
 * Negative keywords that immediately zero out the title score.
 * We match them against the lowercased title with word-boundary awareness.
 */
const BUILTIN_NEGATIVE_KEYWORDS = [
  "staff",
  "principal",
  "director",
  "intern",
  "manager",
  "senior staff",
  "vp",
  "head of",
];

interface TitleResult {
  score: number;
  /** True when a negative keyword matched — the entire job should be capped low. */
  disqualified: boolean;
}

function scoreTitleMatch(title: string, prefs: ScoringPrefs): TitleResult {
  const lower = title.toLowerCase();

  // Collect all negative keywords: built-in + prefs.negative_keywords
  const negatives = Array.from(
    new Set([...BUILTIN_NEGATIVE_KEYWORDS, ...prefs.negative_keywords.map((k) => k.toLowerCase())])
  );

  // Check negative keywords first — any match disqualifies the job
  for (const kw of negatives) {
    if (containsKeyword(lower, kw)) return { score: 0, disqualified: true };
  }

  // Combine prefs.role_keywords (high priority) with built-in high keywords
  const highKeywords = Array.from(
    new Set([...HIGH_TITLE_KEYWORDS, ...prefs.role_keywords.map((k) => k.toLowerCase())])
  );

  for (const kw of highKeywords) {
    if (containsKeyword(lower, kw)) return { score: 30, disqualified: false };
  }

  for (const kw of MEDIUM_TITLE_KEYWORDS) {
    if (containsKeyword(lower, kw)) return { score: 20, disqualified: false };
  }

  return { score: 0, disqualified: false };
}

// ─── YOE Fit (0–25) ──────────────────────────────────────────────────────────

// Patterns like "2+ years", "3-5 years", "up to 5 years"
const YOE_PATTERN = /(\d+)\s*(?:\+|–|-|to)?\s*\d*\s*(?:years?|yrs?)/i;

function scoreYoeFit(title: string): number {
  const lower = title.toLowerCase();

  // Check for "junior" or "new grad" in title → 25
  if (containsKeyword(lower, "junior") || containsKeyword(lower, "new grad")) return 25;

  // Check for "senior" or "sr" (abbreviation) in title → 5
  // Use word boundary to avoid matching "senior staff" (already caught by negatives, but be safe)
  if (/\bsenior\b/.test(lower) || /\bsr\.?\b/.test(lower)) return 5;

  // Try to extract explicit YOE from the title
  const match = lower.match(YOE_PATTERN);
  if (match) {
    const years = parseInt(match[1], 10);
    if (years <= 3) return 25;
    if (years <= 5) return 10;
    return 0;
  }

  // No mention → default 15
  return 15;
}

// ─── Location Match (0–20) ───────────────────────────────────────────────────

function scoreLocationMatch(location: string, prefs: ScoringPrefs): number {
  const loc = location.trim().toLowerCase();

  if (!loc) return 10; // Empty/unspecified

  if (loc === "remote" || loc.includes("remote")) return 20;

  if (loc === "multiple" || loc === "various" || loc.includes("multiple") || loc.includes("various"))
    return 10;

  // Check preferred cities (case-insensitive substring match)
  for (const preferred of prefs.locations) {
    const prefLower = preferred.toLowerCase();
    if (prefLower === "remote") continue; // handled above
    if (loc.includes(prefLower) || prefLower.includes(loc)) return 20;
  }

  return 0; // Non-preferred city
}

// ─── Department Match (0–10) ─────────────────────────────────────────────────

const ENG_DEPARTMENTS = [
  "engineering",
  "product",
  "tech",
  "technology",
  "development",
  "platform",
  "infrastructure",
];

function scoreDepartmentMatch(department: string | null): number {
  if (department === null || department.trim() === "") return 5;

  const lower = department.toLowerCase();
  for (const dep of ENG_DEPARTMENTS) {
    if (lower.includes(dep)) return 10;
  }

  return 0;
}

// ─── Recency Bonus (0–10) ────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function scoreRecency(postedAt: string | null): number {
  if (postedAt === null) return 3;

  const posted = new Date(postedAt);
  if (isNaN(posted.getTime())) return 0; // unparseable date

  const ageDays = (Date.now() - posted.getTime()) / ONE_DAY_MS;

  if (ageDays < 1) return 10;
  if (ageDays < 2) return 7;
  if (ageDays < 7) return 3;
  return 0;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Check whether `text` contains `keyword` as a distinct phrase.
 * Uses word boundaries for single words; for multi-word keywords uses plain substring.
 */
function containsKeyword(text: string, keyword: string): boolean {
  if (keyword.includes(" ")) {
    return text.includes(keyword);
  }
  // Word-boundary check for single tokens
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function scoreJob(job: JobListing, prefs: ScoringPrefs): number {
  const titleResult = scoreTitleMatch(job.title, prefs);
  const yoeScore = scoreYoeFit(job.title);                        // 0–25
  const locationScore = scoreLocationMatch(job.location, prefs);  // 0–20
  const deptScore = scoreDepartmentMatch(job.department);         // 0–10
  const recencyScore = scoreRecency(job.postedAt);                // 0–10

  // If the title matched a negative/disqualifying keyword, hard-cap the total.
  // This ensures seniority mismatches (intern, staff, VP, etc.) and non-role titles
  // never score high enough to surface in results.
  if (titleResult.disqualified) {
    return Math.min(15, yoeScore + locationScore + deptScore + recencyScore);
  }

  // If title had no match at all (score=0, not disqualified), it's likely a
  // non-engineering role — cap at 29 so it stays below the "relevant" threshold.
  if (titleResult.score === 0) {
    return Math.min(29, yoeScore + locationScore + deptScore + recencyScore);
  }

  return titleResult.score + yoeScore + locationScore + deptScore + recencyScore;
}
