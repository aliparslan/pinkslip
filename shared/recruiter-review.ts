/* The admin review of recruiter sourcing: people found through search
 * results, and the owner's labels on them. See
 * docs/recruiter-contacts-sourcing.md. */

export const WORKS_THERE_ANSWERS = ["yes", "no", "unsure"] as const;
export type WorksThere = (typeof WORKS_THERE_ANSWERS)[number];

export const ACTUAL_ROLES = ["early_career", "other_recruiter", "not_recruiter"] as const;
export type ActualRole = (typeof ACTUAL_ROLES)[number];

export type RecruiterKind = "early_career" | "technical" | "recruiter" | "coordinator" | "intern" | "other";

/* Recruiter types (owner, 2026-10-24; docs/recruiter-types-2026-10-19.md):
 * three short questions, pre-filled from the title so labelling is mostly a
 * confirm, plus a mark for agency or contract. They decide who's listed on
 * People and who comes first; People shows the recruiter's own title. */
export const RECRUITER_LEVELS = ["interns", "new_grads", "experienced", "leadership"] as const;
export type RecruiterLevel = (typeof RECRUITER_LEVELS)[number];
export const RECRUITER_FIELDS = ["engineering", "product_design", "business", "research", "everything"] as const;
export type RecruiterField = (typeof RECRUITER_FIELDS)[number];
export const RECRUITER_JOBS = ["recruiter", "sourcer", "coordinator", "programs", "leads", "not_recruiting"] as const;
export type RecruiterJob = (typeof RECRUITER_JOBS)[number];

export interface RecruiterTypes {
  /** Who they hire. Several allowed. */
  hires: RecruiterLevel[];
  /** What they hire for. Several allowed. */
  hires_for: RecruiterField[];
  /** What they do in recruiting. */
  job: RecruiterJob;
  /** Hired through an outside firm or on a fixed term: never listed. */
  agency: boolean;
}

/** The types a title suggests, for the owner to confirm. */
export function recruiterTypesFromTitle(title: string): RecruiterTypes {
  const text = title.toLowerCase();
  const hires: RecruiterLevel[] = [];
  const early = /universit|campus|college|early.?(career|talent)|new.?grad|graduate|emerging talent|student|entry.?level/.test(text);
  if (/\bintern(s|ship)?\b|co-?op/.test(text) || early) hires.push("interns");
  if (early) hires.push("new_grads");
  if (/executive|leadership/.test(text)) hires.push("leadership");
  if (/experienced|lateral|senior hiring/.test(text) || hires.length === 0) hires.push("experienced");

  const hiresFor: RecruiterField[] = [];
  if (/technical|tech\b|engineer|software|developer|\bit\b|infrastructure|security|data\b|machine learning|\bml\b/.test(text)) hiresFor.push("engineering");
  if (/product|design/.test(text)) hiresFor.push("product_design");
  if (/business|sales|go.?to.?market|\bgtm\b|finance|marketing|operations|corporate|g&a|legal/.test(text)) hiresFor.push("business");
  if (/research|scien|\bphd\b/.test(text)) hiresFor.push("research");
  if (hiresFor.length === 0) hiresFor.push("everything");

  const recruiting = /recruit|talent|sourc|staffing|hiring/.test(text);
  const job: RecruiterJob = /sourc/.test(text)
    ? "sourcer"
    : /coordinat|schedul/.test(text)
      ? "coordinator"
      : /program|relations|events|employer brand/.test(text) && recruiting
        ? "programs"
        : /head of|\bvp\b|vice president|director|\blead\b|manager/.test(text) && recruiting
          ? "leads"
          : recruiting
            ? "recruiter"
            : "not_recruiting";
  const agency = /agency|contract(or)?\b|\brpo\b|staffing|consultant|freelance|on behalf of/.test(text);
  return { hires, hires_for: hiresFor, job, agency };
}

function listOf<T extends string>(json: string | null, allowed: readonly T[]): T[] | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as unknown;
    if (!Array.isArray(value)) return null;
    const kept = value.filter((item): item is T => (allowed as readonly unknown[]).includes(item));
    return kept.length > 0 ? kept : null;
  } catch {
    return null;
  }
}

/** A recruiter's types as stored: the owner's answers where given, the
 * title's suggestion for the rest. Confirmed once the owner has answered
 * their job. */
export function recruiterTypes(row: {
  current_title: string | null;
  headline: string;
  hires: string | null;
  hires_for: string | null;
  job: RecruiterJob | null;
  agency: number | null;
  /** The single answer older labels gave, for what the new ones leave out. */
  actual_role?: ActualRole | null;
}): { types: RecruiterTypes; confirmed: boolean } {
  const suggested = recruiterTypesFromTitle(row.current_title?.trim() || row.headline);
  const older = row.actual_role ? typesFromActualRole(row.actual_role) : {};
  return {
    types: {
      hires: listOf<RecruiterLevel>(row.hires, RECRUITER_LEVELS) ?? older.hires ?? suggested.hires,
      hires_for: listOf<RecruiterField>(row.hires_for, RECRUITER_FIELDS) ?? suggested.hires_for,
      job: row.job ?? older.job ?? suggested.job,
      agency: row.agency === null ? suggested.agency : row.agency === 1,
    },
    confirmed: row.job !== null,
  };
}

/** Whether two sets of types say the same (lists in any order). */
export function sameTypes(a: RecruiterTypes, b: RecruiterTypes): boolean {
  const same = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((item) => y.includes(item));
  return same(a.hires, b.hires) && same(a.hires_for, b.hires_for) && a.job === b.job && a.agency === b.agency;
}

/** Listed on People: in recruiting, and not through an agency or on contract. */
export function listable(types: RecruiterTypes): boolean {
  return types.job !== "not_recruiting" && !types.agency;
}

/** What an older Admin build's single answer says in the new terms. */
export function typesFromActualRole(role: ActualRole): Partial<RecruiterTypes> {
  if (role === "early_career") return { job: "recruiter", hires: ["interns", "new_grads"] };
  if (role === "other_recruiter") return { job: "recruiter" };
  return { job: "not_recruiting" };
}

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
  /** The owner's answers, or the title's suggestion where there's none yet. */
  types: RecruiterTypes;
  /** Whether the owner confirmed the types (otherwise they're the suggestion). */
  types_confirmed: boolean;
  reviewed_at: string | null;
}

/** What Admin sets on a person: any label, or null to clear it. */
export interface RecruiterLabels {
  works_there?: WorksThere | null;
  /** Older Admin builds' single answer; it fills the types it implies. */
  actual_role?: ActualRole | null;
  hires?: RecruiterLevel[] | null;
  hires_for?: RecruiterField[] | null;
  job?: RecruiterJob | null;
  agency?: boolean | null;
}

/** A person with labels applied, as the server stores them, for a screen
 * that moves on before the server answers. A cleared type goes back to the
 * title's suggestion. */
export function withRecruiterLabels(row: RecruiterCandidate, labels: RecruiterLabels): RecruiterCandidate {
  const suggested = recruiterTypesFromTitle(row.current_title?.trim() || row.headline);
  const implied: Partial<RecruiterTypes> = labels.actual_role ? typesFromActualRole(labels.actual_role) : {};
  const pick =<K extends keyof RecruiterTypes>(key: K): RecruiterTypes[K] => {
    const value = labels[key] as RecruiterTypes[K] | null | undefined;
    return value === undefined ? implied[key] ?? row.types[key] : value === null ? suggested[key] : value;
  };
  const job = labels.job !== undefined ? labels.job : implied.job;
  return {
    ...row,
    works_there: labels.works_there === undefined ? row.works_there : labels.works_there,
    actual_role: labels.actual_role === undefined ? row.actual_role : labels.actual_role,
    types: { hires: pick("hires"), hires_for: pick("hires_for"), job: pick("job"), agency: pick("agency") },
    types_confirmed: job === undefined ? row.types_confirmed : job !== null,
  };
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
  /** People who saved, applied to or opened its jobs in the last 30 days
   * (the confirm queue's order). */
  wanted: number;
  /** Recruiters already on its People. */
  listed: number;
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
  /** Kept people who work there, with their types confirmed as the title
   * suggested them. Missing from servers before 2026-10-24. */
  titles?: { right: number; labelled: number };
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
