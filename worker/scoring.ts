import type { JobListing } from "./adapters/types";

export interface ScoringPrefs {
  locations: string[];
  min_yoe: number;
  max_yoe: number;
  role_keywords: string[];
  negative_keywords: string[];
}

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

// ─── Title Match (0–30) ──────────────────────────────────────────────────────

const HIGH_TITLE_KEYWORDS = [
  "software engineer",
  "software developer",
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
  "ai engineer",
  "member of technical staff",
  "founding engineer",
];

const MEDIUM_TITLE_KEYWORDS = [
  "data engineer",
  "research engineer",
  "security engineer",
  "product engineer",
  "platform engineer",
  "infrastructure engineer",
  "mobile engineer",
  "ios engineer",
  "android engineer",
  "site reliability engineer",
  "devops engineer",
  "cloud engineer",
  "ml engineer",
  "machine learning engineer",
  "developer productivity engineer",
  "web engineer",
  "swe",
];

/**
 * Negative keywords that immediately zero out the title score.
 * We match them against the lowercased title with word-boundary awareness.
 */
const BUILTIN_NEGATIVE_KEYWORDS = [
  "senior",
  "sr.",
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
    if (containsKeyword(lower, kw)) return { score: SCORE_COMPONENT_MAX.title, disqualified: false };
  }

  for (const kw of MEDIUM_TITLE_KEYWORDS) {
    if (containsKeyword(lower, kw)) return { score: 20, disqualified: false };
  }

  return { score: 0, disqualified: false };
}

// ─── YOE Fit (0–25) ──────────────────────────────────────────────────────────

// Patterns like "2+ years", "3-5 years", "up to 5 years"
const YOE_PATTERN = /(\d+)\s*(?:\+|–|-|to)?\s*\d*\s*(?:years?|yrs?)/i;

function scoreYoeFit(description: string | null, title: string, prefs: ScoringPrefs): number {
  const lower = [description ?? "", title].join("\n").toLowerCase();

  if (containsKeyword(lower, "junior") || containsKeyword(lower, "new grad")) return 25;
  if (/\bsenior\b/.test(lower) || /\bsr\.?\b/.test(lower)) return 5;

  const match = lower.match(YOE_PATTERN);
  if (match) {
    const years = parseInt(match[1], 10);
    if (years <= prefs.max_yoe) return 25;
    if (years <= prefs.max_yoe + 2) return 10;
    return 0;
  }

  return 15;
}

// ─── Location Match (0–20) ───────────────────────────────────────────────────

const US_STATES = new Set([
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia",
  "ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
  "nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt",
  "va","wa","wv","wi","wy","dc",
]);

function isUSOrRemote(location: string, prefs: ScoringPrefs): boolean {
  const loc = location.trim().toLowerCase();
  if (!loc) return true;
  if (loc.includes("remote")) return true;
  if (loc.includes("united states") || loc.includes(", us")) return true;
  if (loc === "multiple" || loc === "various" || loc.includes("multiple")) return true;
  // Match ", XX" where XX is a US state abbreviation
  const stateMatch = loc.match(/,\s*([a-z]{2})(?:\s|$|,)/);
  if (stateMatch && US_STATES.has(stateMatch[1])) return true;
  // Check if location matches any preferred location (user's prefs are US cities)
  for (const preferred of prefs.locations) {
    const prefLower = preferred.toLowerCase();
    if (prefLower === "remote") continue;
    if (loc.includes(prefLower)) return true;
    if (prefLower.includes(loc) && loc.length >= 3) return true;
  }
  return false;
}

interface LocationResult {
  score: number;
  disqualified: boolean;
}

function scoreLocationMatch(location: string, prefs: ScoringPrefs): LocationResult {
  const loc = location.trim().toLowerCase();

  if (!isUSOrRemote(location, prefs)) return { score: 0, disqualified: true };

  if (!loc) return { score: 10, disqualified: false };

  if (loc === "remote" || loc.includes("remote")) return { score: 20, disqualified: false };

  if (loc === "multiple" || loc === "various" || loc.includes("multiple") || loc.includes("various"))
    return { score: 10, disqualified: false };

  for (const preferred of prefs.locations) {
    const prefLower = preferred.toLowerCase();
    if (prefLower === "remote") continue;
    if (loc.includes(prefLower)) return { score: 20, disqualified: false };
    if (prefLower.includes(loc) && loc.length >= 3) return { score: 20, disqualified: false };
  }

  return { score: 0, disqualified: false };
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

export interface ScoreBreakdown {
  score: number;
  title_score: number;
  yoe_score: number;
  location_score: number;
  department_score: number;
  recency_score: number;
}

export function normalizeScore(rawScore: number): number {
  if (!Number.isFinite(rawScore) || rawScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((rawScore / SCORE_RAW_MAX) * 100)));
}

export function scoreJob(job: JobListing, prefs: ScoringPrefs): ScoreBreakdown {
  const titleResult = scoreTitleMatch(job.title, prefs);
  const yoeScore = scoreYoeFit(job.description, job.title, prefs);
  const locResult = scoreLocationMatch(job.location, prefs);
  const deptScore = scoreDepartmentMatch(job.department);
  const recencyScore = scoreRecency(job.postedAt);

  let total: number;
  if (titleResult.disqualified || locResult.disqualified) {
    total = Math.min(15, yoeScore + locResult.score + deptScore + recencyScore);
  } else if (titleResult.score === 0) {
    total = Math.min(29, yoeScore + locResult.score + deptScore + recencyScore);
  } else {
    total = titleResult.score + yoeScore + locResult.score + deptScore + recencyScore;
  }

  return {
    score: total,
    title_score: titleResult.disqualified ? 0 : titleResult.score,
    yoe_score: yoeScore,
    location_score: locResult.score,
    department_score: deptScore,
    recency_score: recencyScore,
  };
}
