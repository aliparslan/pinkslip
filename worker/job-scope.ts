import { ROLE_OPTIONS } from "../shared/search-profile";
import type { JobListing } from "./adapters/types";
import {
  hasPotentiallyEligibleSeniority,
  requiresAdvancedDegree,
  requiresSecurityClearance,
  titleRequiresAdvancedDegree,
} from "./job-features";
import { isUsJobLocation } from "./us-jobs";
import { isFreshPostedAt } from "../shared/job-policy";

// ─── Scope model ─────────────────────────────────────────────────────────────
//
// This gate used to be an allowlist of ~40 title phrases, which admitted 25.5%
// of an 8,771-posting corpus and failed structurally rather than randomly:
// "New Graduate Engineer, Software" was rejected because the discipline follows
// the head noun, while "UX Researcher" and "Finance Expert - Equity Research"
// were admitted. Growing the allowlist could never fix the first class of miss.
//
// The gate is now subtractive. Anything carrying a technical head noun is in
// scope unless an explicit rejection applies first. Order matters: rejections
// are evaluated before admissions so that "Director, Software Engineering" and
// "Mechanical Engineer" cannot be rescued by a later rule.

export type ScopeReason =
  | "admitted_technical_head_noun"
  | "admitted_custom_title"
  | "admitted_compact_with_department"
  | "rejected_management"
  | "rejected_non_technical_function"
  | "rejected_other_engineering_discipline"
  | "rejected_no_technical_signal";

export interface TitleScopeDecision {
  admitted: boolean;
  reason: ScopeReason;
}

const MANAGEMENT_PATTERN =
  /\b(?:chief|director|head of|manager|president|vice president|vp|svp|evp|avp)\b/i;

/**
 * Functions that are not engineering work even when the title borrows
 * engineering vocabulary. "Research" lives here in its non-technical forms
 * only — a bare `research` keyword previously admitted equity research, UX
 * research, and research operations alongside AI research.
 */
const NON_TECHNICAL_FUNCTION_PATTERNS = [
  "account executive",
  "administrative assistant",
  "administrative business partner",
  "backend technician",
  "chief of staff",
  "clinical research",
  "commercial counsel",
  "customer and partner solutions engineer",
  "customer and product solutions engineer",
  "content strategist",
  "controller",
  "customer engineer",
  "customer experience",
  "customer solutions",
  "customer success",
  "customer support",
  "document research",
  "developer relations engineer",
  "engineering analyst",
  "equity research",
  "executive assistant",
  "financial analyst",
  "general counsel",
  "human resources",
  "legal counsel",
  "market research",
  "marketing insights",
  "operations coordinator",
  "paralegal",
  "people operations",
  "partner engineer",
  "product deployment engineer",
  "product solutions engineer",
  "recruiter",
  "recruiting",
  "research operations",
  "research analyst",
  "research and development analyst",
  "research strategist",
  "quantitative growth research",
  "sales specialist",
  "ads solutions engineer",
  "technical solutions engineer",
  "sales development",
  "sales engineer",
  "sales representative",
  "social media",
  "support engineer",
  "talent acquisition",
  "technical writer",
  "technical strategist",
  "trading support",
  "tutor",
  "user experience research",
  "user research",
  "ux research",
  // Product-engineering titles that are field/hardware work rather than
  // software, and carry no discipline word of their own to catch them.
  "local product engineer",
  "mechanical product engineer",
  "softgoods",
  "supply chain capacity engineer",
  "visiting scholar",
] as const;

const NON_TECHNICAL_FUNCTION_WORDS =
  /\b(?:economist|paralegal|recruiter|tutor|copywriter|salesperson)\b/i;

// Shorthand internship titles need discipline-only admission ("iOS Intern",
// "ML Intern"), but a technical noun elsewhere in the title must not turn a
// business or design internship into an engineering role.
const NON_TECHNICAL_INTERNSHIP_FUNCTION = new RegExp([
  String.raw`\b(?:sales|marketing|finance|accounting|legal|recruiting|human resources|customer success|customer support|business development)\b`,
  String.raw`\b(?:web|ui|ux|graphic|product)\s+design\b`,
  String.raw`\bdesign(?:er)?\s+(?:interns?|internships?|co-?ops?|apprentices?|apprenticeships?)\b`,
  String.raw`\bproduct(?:\s+(?:management|manager|design))?\s+(?:interns?|internships?|co-?ops?|apprentices?|apprenticeships?)\b`,
  String.raw`\b(?:product|program|project)\s+management\b`,
].join("|"), "i");

// Uber's applicant system publishes general science roles under compact titles
// such as "Scientist II, Tech". "Tech" is an organization label, not a
// software discipline, so do not let the generic scientist head noun admit it.
const GENERIC_TECH_SCIENTIST =
  /\bscientist\s+(?:[ivx]+|\d+)\s*,\s*tech\b/i;

/**
 * Engineering disciplines outside software. SpaceX and Anduril alone publish
 * thousands of these, so admitting them would drown the feed. Software roles
 * that merely sit close to hardware — embedded, firmware — are deliberately
 * absent from this list and stay in scope.
 *
 * Silicon design (ASIC, RFIC, RTL, physical design, design verification) is
 * engineering but not software engineering, and a chip company publishes a lot
 * of it. Environmental/safety, facilities, and IT-operations titles end in
 * "Engineer" too and are excluded for the same reason.
 */
const OTHER_ENGINEERING_DISCIPLINE =
  /\b(?:process development|mechanical|electrical|civil|structural|propulsion|manufacturing|industrialization|chemical|biomedical|optical|industrial|aerospace|materials|avionics|thermal|hydraulic|welding|composites|hardware|rf|rfic|asic|soc|rtl|vlsi|fpga|semiconductor|silicon|cmos|analog|pcb|environmental|telecommunications|geotechnical|metallurgical|nuclear|petroleum|acoustic)\b/i;

const SOFTWARE_ADJACENT_OVERRIDE =
  /\b(?:embedded|firmware|software|data|machine learning|ml|ai|security|infrastructure|platform|systems software|test automation)\b/i;

const EXPLICIT_SOFTWARE_ROLE_HEAD =
  /\b(?:software(?: dev(?:elopment)?)? engineer|software developer|sde|swe)\b/i;
const EXPLICIT_LONGFORM_SOFTWARE_ROLE_HEAD =
  /\b(?:software(?: dev(?:elopment)?)? engineer|software developer)\b/i;
const EXPLICIT_DATA_ML_ROLE_HEAD =
  /\b(?:(?:data|analytics|machine learning|ml|ai|ai\s*\/\s*ml)\s+engineer|systems development engineer)\b/i;
const EXPLICIT_SECURITY_ROLE_HEAD =
  /\b(?:cybersecurity|security|application security|product security)\s+engineer\b/i;
const INVERTED_SOFTWARE_ROLE_HEAD =
  /\bengineer(?:ing)?\s*,\s*software\b/i;
const SOFTWARE_DEFINED_NETWORK_CONTROLLER =
  /\bsoftware[- ]defined network controller\b/i;
const DATA_CENTER_CONTEXT = /\b(?:data cent(?:er|re)|datacenter)\b/i;
const MANUFACTURING_EXECUTION_SYSTEM =
  /\bmanufacturing execution systems?\b/i;

/**
 * Titles that end in "Engineer" but describe facilities, IT support, hardware
 * validation, or presales value engineering rather than building software.
 * Kept separate from the discipline list because these are job *functions*
 * rather than branches of engineering.
 */
const NON_SOFTWARE_ENGINEERING_FUNCTION = [
  "health & safety",
  "health and safety",
  "safety engineer",
  // Matched as bare phrases, not "… engineer", so they are caught before the
  // software override sees "data" in "data center" and clears the title.
  "data center",
  "data centre",
  "datacenter",
  "signal integrity",
  "calibration engineer",
  "camera architect",
  "camera system engineer",
  "dft engineer",
  "power integrity",
  "audio visual",
  "facilities engineer",
  "value engineer",
  "field engineer",
  "controls engineer",
  "equipment engineer",
  "equipment reliability",
  "hardware test engineer",
  "test technician",
  "layout designer",
  "design verification",
  "physical design engineer",
  "it operations engineer",
  "it network",
  "network operations engineer",
  "network implementation engineer",
  "optical network engineer",
  "power engineer",
  "yield engineer",
  "help desk",
  "desktop support",
  "systems administrator",
  "system administrator",
  "building, site & sustainability",
] as const;

function hasExplicitSoftwareAdjacentRole(title: string): boolean {
  return EXPLICIT_LONGFORM_SOFTWARE_ROLE_HEAD.test(title)
    || EXPLICIT_DATA_ML_ROLE_HEAD.test(title)
    || EXPLICIT_SECURITY_ROLE_HEAD.test(title)
    || INVERTED_SOFTWARE_ROLE_HEAD.test(title)
    || (/\b(?:sde|swe)\b/i.test(title) && /\bsoftware\b/i.test(title))
    || /\b(?:embedded|firmware)\b/i.test(title);
}

const TECHNICAL_HEAD_NOUN =
  /\b(?:engineer|engineering|developer|scientist|researcher|architect|programmer|sde|swe|sdet)\b/i;
const INTERNSHIP_ROLE_WORDING =
  /\b(?:interns?|internships?|co-?ops?|apprentices?|apprenticeships?)\b/i;
const TECHNICAL_INTERNSHIP_DISCIPLINE =
  /\b(?:software|engineering|data science|machine learning|artificial intelligence|ai|ml|security|cyber ?security|infrastructure|platform|devops|site reliability|sre|cloud|research|quantitative|quant|algorithmic trading|mobile|ios|android|web|ui|frontend|front end|backend|back end|full[ -]?stack)\b/i;

const EXPLICIT_TECHNICAL_INTERNSHIP_ROLE_HEAD =
  /\b(?:(?:software|data|analytics|backend|back end|frontend|front end|full[ -]?stack|platform|infrastructure|cloud|security|cyber ?security|machine learning|ml|ai|mobile|ios|android|web)\s+(?:development\s+)?engineer(?:ing)?|(?:software|web|frontend|front end|backend|back end|full[ -]?stack|mobile|ios|android)\s+developer|(?:data|applied|research|machine learning|ml|ai)\s+scientist)\b/i;

const TECHNICAL_CUSTOMER_SUPPORT_CONTEXT =
  /\bcustomer support (?:systems?|platform|tools|infrastructure)\b/i;

function hasExplicitTechnicalInternshipRole(title: string): boolean {
  return INTERNSHIP_ROLE_WORDING.test(title)
    && (hasExplicitSoftwareAdjacentRole(title)
      || EXPLICIT_TECHNICAL_INTERNSHIP_ROLE_HEAD.test(title));
}

/**
 * Technical IC titles that carry no head noun at all. "Member of Technical
 * Staff" is the standard level-less IC title at the frontier labs (OpenAI,
 * Anthropic, xAI, Mistral, Cursor, Cockroach Labs) and matches none of the
 * nouns above, so it needs an explicit admission. The configured role keywords
 * are folded in for the same reason.
 */
const TITLE_KEYWORD_ADMISSIONS = [
  ...ROLE_OPTIONS.flatMap((role) => role.keywords),
  "member of technical staff",
  "technical staff",
  // Trading firms hire software people into desk-side titles that carry no
  // engineering head noun. Jane Street, HRT, Optiver, IMC, Jump and SIG all
  // run new-grad pipelines that a CS graduate is a direct candidate for, so
  // these are in scope even though the word "engineer" never appears.
  "quantitative",
  "quant",
  "algorithmic trading",
  "trading",
  "trader",
] as const;

const COMPACT_TITLE =
  /^(?:associate |junior |senior |staff |principal )?(?:engineer|developer|scientist)(?: [ivx]+|\s*\d+)?$/i;

const COMPACT_DEPARTMENT_SIGNAL =
  /\b(?:software|data|machine learning|artificial intelligence|security|infrastructure|platform)\b/;

function containsPhrase(text: string, phrase: string) {
  if (phrase.includes(" ")) return text.includes(phrase);
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/**
 * The reason code is the whole point: a subtractive gate can only be trusted if
 * its rejections are auditable, so every caller can record *which* rule removed
 * a posting rather than discovering the loss much later.
 */
export function classifyTitleScope(
  title: string,
  department?: string | null,
  customTitles: readonly string[] = []
): TitleScopeDecision {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedDepartment = department?.trim().toLowerCase() ?? "";
  if (!normalizedTitle) {
    return { admitted: false, reason: "rejected_no_technical_signal" };
  }

  if (MANAGEMENT_PATTERN.test(normalizedTitle)) {
    return { admitted: false, reason: "rejected_management" };
  }

  if (/\bteam (?:lead|leader)\b/i.test(normalizedTitle)) {
    return { admitted: false, reason: "rejected_management" };
  }

  const explicitSoftwareRole = EXPLICIT_SOFTWARE_ROLE_HEAD.test(normalizedTitle);
  const explicitTechnicalInternshipRole =
    hasExplicitTechnicalInternshipRole(normalizedTitle);
  if (
    NON_TECHNICAL_FUNCTION_PATTERNS.some((pattern) => {
      if (!containsPhrase(normalizedTitle, pattern)) return false;
      // Recruiting is the data product's domain here, not the applicant's role.
      if (pattern === "recruiting" && /\b(?:data|analytics) engineer\b/.test(normalizedTitle)) {
        return false;
      }
      // "Controller" is normally the finance function. In an explicit
      // software-defined-network title it names the system being built.
      if (
        pattern === "controller"
        && explicitSoftwareRole
        && SOFTWARE_DEFINED_NETWORK_CONTROLLER.test(normalizedTitle)
      ) {
        return false;
      }
      // Here "customer support" names the product domain, not the intern's
      // function. Keep the exception tied to both an explicit technical role
      // head and a systems/platform noun so "Customer Support Engineer" stays
      // excluded.
      if (
        pattern === "customer support"
        && explicitTechnicalInternshipRole
        && TECHNICAL_CUSTOMER_SUPPORT_CONTEXT.test(normalizedTitle)
      ) {
        return false;
      }
      return true;
    })
    || NON_TECHNICAL_FUNCTION_WORDS.test(normalizedTitle)
    || (INTERNSHIP_ROLE_WORDING.test(normalizedTitle)
      && !explicitTechnicalInternshipRole
      && NON_TECHNICAL_INTERNSHIP_FUNCTION.test(normalizedTitle))
    || GENERIC_TECH_SCIENTIST.test(normalizedTitle)
  ) {
    return { admitted: false, reason: "rejected_non_technical_function" };
  }

  if (NON_SOFTWARE_ENGINEERING_FUNCTION.some((pattern) => {
    if (!containsPhrase(normalizedTitle, pattern)) return false;
    // A bare data-center engineer is facilities/infrastructure work, while an
    // explicit software/SDE title builds software for that environment.
    const dataCenterPattern = ["data center", "data centre", "datacenter"].includes(pattern);
    return !dataCenterPattern
      || !explicitSoftwareRole
      || !DATA_CENTER_CONTEXT.test(normalizedTitle);
  })) {
    return { admitted: false, reason: "rejected_other_engineering_discipline" };
  }

  // A discipline word only disqualifies when no software signal accompanies it,
  // so "Embedded Software Engineer (Starlink)" survives while "New Graduate
  // Engineer, Mechanical" does not.
  if (
    OTHER_ENGINEERING_DISCIPLINE.test(normalizedTitle)
    && !hasExplicitSoftwareAdjacentRole(normalizedTitle)
    // MES names an enterprise software system, not a manufacturing-engineering
    // discipline. Keep this exception tied to an explicit software role head.
    && !(explicitSoftwareRole && MANUFACTURING_EXECUTION_SYSTEM.test(normalizedTitle))
  ) {
    return { admitted: false, reason: "rejected_other_engineering_discipline" };
  }

  // A title with no discipline of its own inherits the department's. Without
  // this, an inverted gate admits "Engineer II" out of a Manufacturing org.
  // The department can also clear itself: SpaceX files SREs under "Falcon and
  // Dragon Avionics & Software Engineering", where the discipline word and the
  // software signal sit side by side.
  if (
    OTHER_ENGINEERING_DISCIPLINE.test(normalizedDepartment)
    && !SOFTWARE_ADJACENT_OVERRIDE.test(normalizedTitle)
    && !SOFTWARE_ADJACENT_OVERRIDE.test(normalizedDepartment)
  ) {
    return { admitted: false, reason: "rejected_other_engineering_discipline" };
  }

  // Checked after the rejections above so a user's custom title can widen the
  // catalog without reintroducing managers or non-software disciplines.
  if (customTitles.some((custom) => {
    const term = custom.trim().toLowerCase();
    return term.length >= 3 && normalizedTitle.includes(term);
  })) {
    return { admitted: true, reason: "admitted_custom_title" };
  }

  // Compact titles such as "Engineer I" are resolved before the general head
  // noun, because for them the department is the only discipline signal there
  // is — and the reason code should say so.
  if (COMPACT_TITLE.test(title.trim())) {
    return COMPACT_DEPARTMENT_SIGNAL.test(normalizedDepartment)
      ? { admitted: true, reason: "admitted_compact_with_department" }
      : { admitted: false, reason: "rejected_no_technical_signal" };
  }

  if (
    TECHNICAL_HEAD_NOUN.test(normalizedTitle)
    || (/\b(?:flight )?software associate\b/.test(normalizedTitle)
      && /\bsoftware\b/.test(normalizedDepartment))
    || (INTERNSHIP_ROLE_WORDING.test(normalizedTitle)
      && TECHNICAL_INTERNSHIP_DISCIPLINE.test(normalizedTitle))
    || TITLE_KEYWORD_ADMISSIONS.some((keyword) => containsPhrase(normalizedTitle, keyword))
  ) {
    return { admitted: true, reason: "admitted_technical_head_noun" };
  }

  return { admitted: false, reason: "rejected_no_technical_signal" };
}

export function isTargetJobTitle(
  title: string,
  department?: string | null,
  customTitles: readonly string[] = []
): boolean {
  return classifyTitleScope(title, department, customTitles).admitted;
}

export function isTargetJobListing(
  job: Pick<JobListing, "title" | "department">,
  customTitles: readonly string[] = []
): boolean {
  return isTargetJobTitle(job.title, job.department, customTitles);
}

/**
 * The stable part of catalog eligibility. Polling uses this to decide whether
 * a returning source row may reopen after cleanup without treating an old but
 * still-listed evergreen posting as newly eligible.
 */
export function isCurrentJobScopeListing(
  job: Pick<JobListing, "title" | "department" | "location">,
  customTitles: readonly string[] = []
): boolean {
  return isUsJobLocation(job.location)
    && isTargetJobListing(job, customTitles);
}

export function isEligibleJobListing(
  job: Pick<JobListing, "title" | "department" | "location" | "postedAt">,
  customTitles: readonly string[] = []
): boolean {
  return isCurrentJobScopeListing(job, customTitles)
    && isFreshPostedAt(job.postedAt);
}

/**
 * Requirements that are outside Pinkslip's fixed audience regardless of role,
 * location, or years of experience. Description-less list results stay
 * provisionally eligible until hydration supplies enough evidence.
 */
export function hasDisqualifyingJobRequirement(
  job: Pick<JobListing, "title"> & Partial<Pick<JobListing, "description">>
): boolean {
  const clearanceScopedTitle = /\b(?:ts\s*\/\s*sci|top secret|(?:active|current)\s+(?:secret|security)\s+clearance|secret\s+clearance)\b/i
    .test(job.title);
  return titleRequiresAdvancedDegree(job.title)
    || clearanceScopedTitle
    || requiresAdvancedDegree(job.description ?? null)
    || requiresSecurityClearance(job.description ?? null);
}

/**
 * The broadest job worth hydrating or inserting for the fixed Pinkslip
 * audience. Description-derived experience and degree rules run later, but an
 * explicit senior/staff/management title is already deterministically out.
 */
export function isPotentialCatalogJobListing(
  job: Pick<JobListing, "title" | "department" | "location" | "postedAt">
    & Partial<Pick<JobListing, "description">>,
  customTitles: readonly string[] = []
): boolean {
  return hasPotentiallyEligibleSeniority(job.title)
    && !hasDisqualifyingJobRequirement(job)
    && isEligibleJobListing(job, customTitles);
}

/**
 * The ingestion gate runs long before a user is in scope, so a globally
 * unrecognized title could never be rescued by a per-user preference — the
 * posting was discarded before scoring ever saw it, which made `custom_titles`
 * a purely cosmetic setting. Loading the union once per poll cycle is cheap at
 * this scale and makes the setting do what the UI claims.
 */
export async function loadCustomTitles(db: D1Database): Promise<string[]> {
  const rows = await db.prepare(
    "SELECT profile_json FROM user_search_profiles WHERE profile_json IS NOT NULL"
  ).all<{ profile_json: string }>().catch(() => ({ results: [] as { profile_json: string }[] }));

  const titles = new Set<string>();
  for (const row of rows.results ?? []) {
    try {
      const parsed = JSON.parse(row.profile_json) as { custom_titles?: unknown };
      if (!Array.isArray(parsed.custom_titles)) continue;
      for (const title of parsed.custom_titles) {
        if (typeof title !== "string") continue;
        const trimmed = title.trim();
        if (trimmed.length >= 3) titles.add(trimmed.toLowerCase());
      }
    } catch {
      // A malformed profile must not stop ingestion.
    }
  }
  return [...titles];
}

export async function ensureEligibleJobs(db: D1Database): Promise<number> {
  // v8 distinguishes explicit software/data/ML roles that mention hardware
  // from hardware/optical/mechanical titles that merely mention AI, platform,
  // infrastructure, or test automation. It also removes non-employment and
  // business-research titles surfaced by the Meta catalog audit. Widening
  // remains self-healing —
  // complete adapter snapshots reopen any role a future policy accepts again.
  const cleanupVersion = "eligible-jobs-v12-process-development";
  const state = await db.prepare(
    "SELECT value FROM preferences WHERE key = 'eligible_jobs_cleanup_version'"
  ).first<{ value: string }>();
  if (state?.value === cleanupVersion) return 0;

  const openJobs = await db.prepare(
    `SELECT j.id, j.title, j.department, j.location, j.posted_at AS postedAt,
            COALESCE(c.source_type, c.ats_type) AS source_type
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     WHERE j.closed_at IS NULL`
  ).all<{
    id: string;
    title: string;
    department: string | null;
    location: string;
    postedAt: string | null;
    source_type: string;
  }>();

  const normalizedJobs = (openJobs.results ?? []).map((job) => {
    if (job.source_type !== "workday") return job;

    const aggregate = job.location.match(/^(\d+)\s+locations?(?:,\s*united states(?: of america)?)?$/i);
    if (aggregate) return { ...job, location: `${aggregate[1]} US locations` };

    // Older Workday ingestion appended ", United States" to every unknown
    // label. Strip that synthetic suffix before eligibility is evaluated so a
    // value such as "Berlin, United States" cannot survive this migration.
    const suffixed = job.location.match(/^(.+),\s*united states(?: of america)?$/i);
    if (suffixed && !isUsJobLocation(suffixed[1])) {
      return { ...job, location: suffixed[1].trim() };
    }
    return job;
  });

  const changedLocations = normalizedJobs.filter((job, index) =>
    job.location !== openJobs.results?.[index]?.location
  );
  for (let offset = 0; offset < changedLocations.length; offset += 75) {
    await db.batch(changedLocations.slice(offset, offset + 75).map((job) =>
      db.prepare("UPDATE jobs SET location = ? WHERE id = ?").bind(job.location, job.id)
    ));
  }

  const now = new Date().toISOString();
  const customTitles = await loadCustomTitles(db);
  const rejected = normalizedJobs.filter((job) =>
    !isEligibleJobListing(job, customTitles)
  );
  for (let offset = 0; offset < rejected.length; offset += 75) {
    await db.batch(rejected.slice(offset, offset + 75).map((job) =>
      db.prepare("UPDATE jobs SET closed_at = ? WHERE id = ? AND closed_at IS NULL")
        .bind(now, job.id)
    ));
  }

  await db.prepare(
    `INSERT INTO preferences (key, value)
     VALUES ('eligible_jobs_cleanup_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(cleanupVersion).run();
  return rejected.length;
}
