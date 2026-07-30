import type { JobListing } from "./adapters/types";
import { isUsJobLocation } from "./us-jobs";
import {
  profileExperienceRange,
  type SearchProfileV1,
} from "../shared/search-profile";
import { parseExperienceRequirement } from "./job-features";
import {
  normalizeScorePercent,
  SCORE_COMPONENT_MAX,
} from "../shared/scoring";

export { SCORE_COMPONENT_MAX, SCORE_RAW_MAX } from "../shared/scoring";

export interface ScoringPrefs {
  locations: string[];
  min_yoe: number;
  max_yoe: number;
  role_keywords: string[];
  negative_keywords: string[];
  department_keywords?: string[];
  search_profile?: SearchProfileV1;
}

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

const EARLY_CAREER_MARKERS = [
  "new grad",
  "new graduate",
  "early career",
  "entry level",
  "graduate",
  "university graduate",
  "campus",
];

const SOFTWARE_DOMAIN_MARKERS = [
  "software",
  "developer",
  "frontend",
  "front end",
  "front-end",
  "backend",
  "back end",
  "back-end",
  "fullstack",
  "full stack",
  "full-stack",
  "platform",
  "web",
  "mobile",
  "ios",
  "android",
  "data",
  "ml",
  "machine learning",
  "ai",
  "security",
  "devops",
  "cloud",
  "site reliability",
  "infrastructure",
];

const BUILTIN_NEGATIVE_KEYWORDS = [
  "senior",
  "sr",
  "sr.",
  "staff",
  "principal",
  "director",
  "vice president",
  "intern",
  "internship",
  "manager",
  "senior staff",
  "vp",
  "svp",
  "avp",
  "vpe",
  "head of",
  "chief",
  "distinguished",
  "fellow",
  "lead",
];

interface TitleResult {
  score: number;
  disqualified: boolean;
}

function scoreTitleMatch(title: string, prefs: ScoringPrefs): TitleResult {
  const lower = title.toLowerCase();

  // Structured profiles treat seniority separately; legacy preferences keep
  // the original built-in early-career exclusions.
  const negatives = Array.from(
    new Set([
      ...(prefs.search_profile ? [] : BUILTIN_NEGATIVE_KEYWORDS),
      ...prefs.negative_keywords.map((k) => k.toLowerCase()),
    ])
  );

  for (const kw of negatives) {
    if (containsKeyword(lower, kw)) return { score: 0, disqualified: true };
  }

  const isEarlyCareerSoftwareRole =
    EARLY_CAREER_MARKERS.some((kw) => containsKeyword(lower, kw))
    && SOFTWARE_DOMAIN_MARKERS.some((kw) => containsKeyword(lower, kw));

  if (isEarlyCareerSoftwareRole) {
    return { score: SCORE_COMPONENT_MAX.title, disqualified: false };
  }

  if (prefs.search_profile) {
    for (const kw of prefs.role_keywords.map((keyword) => keyword.toLowerCase())) {
      if (containsKeyword(lower, kw)) {
        return { score: SCORE_COMPONENT_MAX.title, disqualified: false };
      }
    }
    return { score: 0, disqualified: false };
  }

  // Legacy profiles combine user terms with the original software defaults.
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

function scoreYoeFit(description: string | null, title: string, prefs: ScoringPrefs): number {
  const lower = title.toLowerCase();

  if (containsKeyword(lower, "junior") || containsKeyword(lower, "new grad")) return 25;
  if (/\bsenior\b/.test(lower) || /\bsr\.?\b/.test(lower)) return 5;

  const requirement = parseExperienceRequirement(title, description);
  if (requirement.min !== null) {
    const years = requirement.min;
    if (years <= prefs.max_yoe) return 25;
    if (years <= prefs.max_yoe + 2) return 10;
    return 0;
  }

  return 15;
}

interface YoeResult {
  score: number;
  disqualified: boolean;
}

function scorePersonalizedYoe(
  description: string | null,
  title: string,
  profile: SearchProfileV1
): YoeResult {
  const lower = title.toLowerCase();
  const levels = new Set(profile.target_levels);
  const internship = /\b(?:intern|internship|co-op)\b/.test(lower);
  const newGrad = /\b(?:new grad|new graduate|early career|entry level|graduate|campus)\b/.test(lower);
  const staffPlus = /\b(?:staff|principal|distinguished|fellow|head of|director|vice president|vp)\b/.test(lower);
  const senior = /\b(?:senior|sr\.?|lead)\b/.test(lower);

  if (internship) {
    return levels.has("internship")
      ? { score: 25, disqualified: false }
      : { score: 0, disqualified: true };
  }
  if (staffPlus) {
    if (levels.has("staff_plus")) return { score: 25, disqualified: false };
    if (levels.has("senior") && profile.stretch_tolerance !== "strict") return { score: 10, disqualified: false };
    return { score: 0, disqualified: true };
  }
  if (senior) {
    if (levels.has("senior") || levels.has("staff_plus")) {
      return { score: 25, disqualified: false };
    }
    if (levels.has("mid_level") && profile.stretch_tolerance !== "strict") return { score: 10, disqualified: false };
    return { score: 0, disqualified: true };
  }
  if (newGrad) {
    if (levels.has("new_grad") || levels.has("early_career")) {
      return { score: 25, disqualified: false };
    }
    if (levels.has("internship")) return { score: 10, disqualified: false };
    return { score: 5, disqualified: false };
  }

  const requirement = parseExperienceRequirement(title, description);
  if (requirement.min !== null) {
    const requiredYears = requirement.min;
    const target = profileExperienceRange(profile);
    if (requiredYears <= target.maxYears) return { score: 25, disqualified: false };
    if (requiredYears <= target.maxYears + 2) return { score: 10, disqualified: false };
    return { score: 0, disqualified: true };
  }

  return { score: 15, disqualified: false };
}

// ─── Location Match (0–20) ───────────────────────────────────────────────────

interface LocationResult {
  score: number;
  disqualified: boolean;
}

function scoreLocationMatch(location: string, prefs: ScoringPrefs): LocationResult {
  const loc = location.trim().toLowerCase();

  if (!isUsJobLocation(location)) return { score: 0, disqualified: true };

  if (loc === "remote" || loc.includes("remote")) {
    if (prefs.search_profile && !prefs.search_profile.work_modes.includes("remote")) {
      return { score: 0, disqualified: true };
    }
    return { score: 20, disqualified: false };
  }

  for (const preferred of prefs.locations) {
    const prefLower = preferred.toLowerCase();
    if (prefLower === "remote") continue;
    if (loc.includes(prefLower)) return { score: 20, disqualified: false };
    if (prefLower.includes(loc) && loc.length >= 3) return { score: 20, disqualified: false };
  }

  if (
    prefs.search_profile
    && (prefs.search_profile.location_ids.length === 0 || prefs.search_profile.relocation_willing)
  ) {
    return { score: 15, disqualified: false };
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

function scoreDepartmentMatch(department: string | null, prefs: ScoringPrefs): number {
  if (department === null || department.trim() === "") return 5;

  const lower = department.toLowerCase();
  const departments = prefs.search_profile
    ? prefs.department_keywords ?? []
    : ENG_DEPARTMENTS;
  for (const dep of departments) {
    if (lower.includes(dep)) return 10;
  }

  return 0;
}

// ─── Recency Bonus (0–10) ────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function scoreRecency(postedAt: string | null): number {
  if (postedAt === null) return 3;

  const posted = new Date(postedAt);
  if (isNaN(posted.getTime())) return 0;

  const ageDays = (Date.now() - posted.getTime()) / ONE_DAY_MS;

  // A smooth 30-day decay gives recency useful ordering power without creating
  // enormous 10/7/3/0 tie buckets. Tenths are deliberate and safe in SQLite's
  // numeric affinity even though the historical column declaration is INTEGER.
  return Math.max(0, Math.min(10, Math.round((10 - ageDays / 3) * 10) / 10));
}

function containsKeyword(text: string, keyword: string): boolean {
  if (keyword.includes(" ")) {
    return text.includes(keyword);
  }
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

export interface ScoreBreakdown {
  score: number;
  title_score: number;
  yoe_score: number;
  location_score: number;
  department_score: number;
  recency_score: number;
}

export function normalizeScore(rawScore: number): number {
  return normalizeScorePercent(rawScore);
}

export function scoreJob(job: JobListing, prefs: ScoringPrefs): ScoreBreakdown {
  const titleResult = scoreTitleMatch(job.title, prefs);
  const yoeResult = prefs.search_profile
    ? scorePersonalizedYoe(job.description, job.title, prefs.search_profile)
    : { score: scoreYoeFit(job.description, job.title, prefs), disqualified: false };
  const locResult = scoreLocationMatch(job.location, prefs);
  const deptScore = scoreDepartmentMatch(job.department, prefs);
  const recencyScore = scoreRecency(job.postedAt);

  let total: number;
  if (titleResult.disqualified || locResult.disqualified || yoeResult.disqualified) {
    total = Math.min(15, yoeResult.score + locResult.score + deptScore + recencyScore);
  } else if (titleResult.score === 0) {
    total = Math.min(29, yoeResult.score + locResult.score + deptScore + recencyScore);
  } else {
    total = titleResult.score + yoeResult.score + locResult.score + deptScore + recencyScore;
  }

  return {
    score: total,
    title_score: titleResult.disqualified ? 0 : titleResult.score,
    yoe_score: yoeResult.score,
    location_score: locResult.score,
    department_score: deptScore,
    recency_score: recencyScore,
  };
}
