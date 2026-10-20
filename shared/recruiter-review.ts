/* The admin review of recruiter sourcing: people found through search
 * results, and the owner's labels on them. See
 * docs/recruiter-contacts-sourcing.md. */

export const WORKS_THERE_ANSWERS = ["yes", "no", "unsure"] as const;
export type WorksThere = (typeof WORKS_THERE_ANSWERS)[number];

export const ACTUAL_ROLES = ["early_career", "other_recruiter", "not_recruiter"] as const;
export type ActualRole = (typeof ACTUAL_ROLES)[number];

export type RecruiterKind = "early_career" | "technical" | "recruiter" | "coordinator" | "intern" | "other";

export interface RecruiterCandidate {
  id: string;
  company_id: string;
  company: string;
  profile_url: string;
  name: string;
  headline: string;
  current_title: string | null;
  current_employer: string | null;
  location: string | null;
  kind: RecruiterKind;
  kind_from_snippet: boolean;
  /** What says they work there: "current employer", "experience line",
   * "headline only" or "none". */
  employer_evidence: string;
  /** Null when kept. */
  left_out_reason: string | null;
  email_guess: string | null;
  email_confidence: string | null;
  works_there: WorksThere | null;
  actual_role: ActualRole | null;
  reviewed_at: string | null;
}

export interface RecruiterCompany {
  company_id: string;
  company: string;
  /** The catalog website's domain ("weaveos.com"), so "works there" means this company. */
  site: string;
  mail_domain: string;
  mail_domain_source: "website" | "format pages";
  pattern: string | null;
  pattern_votes: number;
  pattern_sources: number;
  /** Where the format came from: you (a Hunter check), GitHub's commits, or the format pages. */
  pattern_source: "owner" | "github" | "pages" | null;
  /** The company's own LinkedIn page, found by its website. */
  linkedin_slug: string | null;
  linkedin_name: string | null;
  /** Another company on LinkedIn has the same name. */
  name_shared: boolean;
  github_org: string | null;
  github_pattern: string | null;
  github_votes: number;
  github_total: number;
  error: string | null;
  ran_at: string;
}

/** A catalog company in Admin's "Choose companies" (Paper R3). */
export interface RecruiterCompanyChoice {
  id: string;
  name: string;
  site: string;
  open_jobs: number;
  searched_at: string | null;
  kept: number;
  /** The format as written ("first.last"), and where it came from. */
  pattern: string | null;
  pattern_source: "owner" | "github" | "pages" | null;
}

/** The address formats Admin offers (Paper R4), most common first. */
export const MAIL_TEMPLATES = [
  "{first}.{last}",
  "{first}",
  "{f}{last}",
  "{first}{last}",
  "{f}.{last}",
  "{first}_{last}",
  "{first}{l}",
  "{last}.{first}",
  "{last}{f}",
] as const;

/** "{first}.{last}" → "first.last", as the screens write it. */
export function templateLabel(template: string): string {
  return template.replace(/[{}]/g, "");
}

/** Measured against the owner's labels. Each is "right of labelled". */
export interface RecruiterReviewScore {
  /** Kept people labelled as working there now. */
  works_there: { yes: number; labelled: number };
  /** Kept people whose kind matched the labelled role. */
  role: { right: number; labelled: number };
  /** Kept early-career people labelled early-career. */
  early_career: { right: number; labelled: number };
  /** Left-out people labelled as recruiters working there now. */
  wrongly_left_out: number;
  left_out_labelled: number;
}

export interface RecruiterReview {
  available: boolean;
  /** Whether SERPER_API_KEY is set, so runs can start. */
  can_run?: boolean;
  companies?: RecruiterCompany[];
  candidates?: RecruiterCandidate[];
  score?: RecruiterReviewScore;
}

export interface RecruiterRun {
  company: string;
  kept: number;
  left_out: number;
  error: string | null;
}

/** A kept kind that counts as right for each labelled role. */
export function kindMatchesRole(kind: RecruiterKind, role: ActualRole): boolean {
  if (role === "early_career") return kind === "early_career";
  if (role === "other_recruiter") return kind === "technical" || kind === "recruiter" || kind === "coordinator";
  return kind === "intern" || kind === "other";
}
