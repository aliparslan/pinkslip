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
  mail_domain: string;
  mail_domain_source: "website" | "format pages";
  pattern: string | null;
  pattern_votes: number;
  pattern_sources: number;
  error: string | null;
  ran_at: string;
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
