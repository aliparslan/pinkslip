import type { JobFeatures } from "./job-features";
import { MAX_YEARS_EXPERIENCE } from "../shared/search-profile";

// Lines up the rules' catalog decision with Jev's answers for the same posting,
// so an admin can review only the jobs where the two disagree. Nothing here
// affects what users are shown.

export type CatalogDecision = "include" | "exclude" | "unsure";

export interface DecisionCall {
  decision: CatalogDecision;
  /** Short reason code, e.g. "location" or "management". Null when included. */
  reason: string | null;
}

export interface FieldComparison {
  field: string;
  label: string;
  rules: string;
  jev: string;
  /** Jev's probability for its own answer, 0–1. */
  confidence: number | null;
  /** Only set when both sides gave a definite, comparable answer. */
  mismatch: boolean;
}

export type ComparisonKind =
  | "agree"
  /** The rules let it into the catalog; Jev would have kept it out. */
  | "rules_only"
  /** Jev would have let it in; the rules kept it out. */
  | "jev_only"
  | "jev_unsure"
  /** Rejected for staleness or missing text, which Jev can't judge. */
  | "not_comparable";

export interface Comparison {
  kind: ComparisonKind;
  rules: DecisionCall;
  jev: DecisionCall;
  fields: FieldComparison[];
}

export type JevAnswers = Record<string, { choice: string; probabilities?: Record<string, number> }>;

/** Rules reasons that say nothing about the posting's content. */
const NOT_CONTENT_REASONS = new Set(["rejected_freshness", "needs_description"]);

/** catalogDecisionReason checks scope first, so these rejections skip the location check. */
const SCOPE_REASONS = new Set([
  "rejected_management",
  "rejected_no_technical_signal",
  "rejected_non_technical_function",
  "rejected_other_engineering_discipline",
]);

export function rulesDecision(reason: string): DecisionCall | null {
  if (NOT_CONTENT_REASONS.has(reason)) return null;
  if (reason === "catalog_candidate") return { decision: "include", reason: null };
  return { decision: "exclude", reason: reason.replace(/^rejected_/, "") };
}

function exactYears(choice: string | undefined): number | null {
  if (choice === "over_forty") return 41;
  if (choice === undefined || !/^\d+$/.test(choice)) return null;
  return Number(choice);
}

/** What the catalog would decide if Jev's answers were the only input. */
export function jevDecision(answers: JevAnswers): DecisionCall {
  const choice = (name: string) => answers[name]?.choice;
  const years = exactYears(choice("min_years_exact"));
  const withinYears = years !== null && years <= MAX_YEARS_EXPERIENCE;

  if (choice("us_eligibility") === "no") return { decision: "exclude", reason: "location" };
  if (choice("job_family") === "nontechnical") return { decision: "exclude", reason: "non_technical_function" };
  if (choice("job_family") === "hardware") return { decision: "exclude", reason: "other_engineering_discipline" };
  if (choice("seniority") === "management") return { decision: "exclude", reason: "management" };
  if (choice("clearance_gate") === "required") return { decision: "exclude", reason: "clearance" };
  if (years !== null && !withinYears) return { decision: "exclude", reason: "seniority" };
  if (choice("seniority") === "experienced" && !withinYears) return { decision: "exclude", reason: "seniority" };

  for (const name of ["us_eligibility", "job_family", "seniority", "clearance_gate"]) {
    if (choice(name) === "unclear" || choice(name) === "unknown") return { decision: "unsure", reason: name };
  }
  return { decision: "include", reason: null };
}

function confidenceOf(answers: JevAnswers, name: string): number | null {
  const answer = answers[name];
  const probability = answer?.probabilities?.[answer.choice];
  return typeof probability === "number" ? probability : null;
}

const FAMILY: Record<string, string> = {
  engineering: "software",
  data_ai: "data_ai",
  security: "security",
};

function seniorityBand(seniority: string): string {
  if (seniority === "manager" || seniority === "executive") return "management";
  if (seniority === "mid_level" || seniority === "senior" || seniority === "staff_plus") return "experienced";
  if (seniority === "unknown") return "unspecified";
  return "early_career";
}

const DEFINITE = (value: string | undefined) =>
  value !== undefined && !["unclear", "unknown", "unspecified"].includes(value);

export function compareClassification(
  sampledReason: string,
  baseline: Partial<JobFeatures>,
  answers: JevAnswers
): Comparison {
  const rules = rulesDecision(sampledReason);
  const jev = jevDecision(answers);
  const choice = (name: string) => answers[name]?.choice;
  const field = (
    name: string,
    label: string,
    rulesValue: string,
    jevValue: string | undefined,
    mismatch: boolean
  ): FieldComparison => ({
    field: name,
    label,
    rules: rulesValue,
    jev: jevValue ?? "—",
    confidence: confidenceOf(answers, name),
    mismatch,
  });

  const fields: FieldComparison[] = [];

  const usChecked = !SCOPE_REASONS.has(sampledReason);
  const rulesUs = sampledReason === "rejected_location" ? "no" : usChecked ? "yes" : "not checked";
  fields.push(field("us_eligibility", "US eligible", rulesUs, choice("us_eligibility"),
    usChecked && DEFINITE(choice("us_eligibility")) && rulesUs !== choice("us_eligibility")));

  const rulesFamily = baseline.role_family ? FAMILY[baseline.role_family] ?? "other" : "unknown";
  const jevFamily = choice("job_family");
  const jevFamilyGroup = jevFamily === "nontechnical" || jevFamily === "hardware" ? "other" : jevFamily;
  fields.push(field("job_family", "Job family", baseline.role_family ?? "unknown", jevFamily,
    rulesFamily !== "unknown" && DEFINITE(jevFamily) && rulesFamily !== jevFamilyGroup));

  const rulesSeniority = baseline.seniority ?? "unknown";
  fields.push(field("seniority", "Seniority", rulesSeniority, choice("seniority"),
    rulesSeniority !== "unknown" && DEFINITE(choice("seniority"))
      && seniorityBand(rulesSeniority) !== choice("seniority")));

  const rulesYears = baseline.min_years ?? null;
  const jevYears = exactYears(choice("min_years_exact"));
  fields.push(field("min_years_exact", "Minimum years", rulesYears === null ? "not stated" : String(rulesYears),
    choice("min_years_exact"), rulesYears !== null && jevYears !== null && rulesYears !== jevYears));

  const rulesClearance = baseline.requires_security_clearance ? "required" : "not_required";
  fields.push(field("clearance_gate", "Clearance", rulesClearance, choice("clearance_gate"),
    DEFINITE(choice("clearance_gate")) && rulesClearance !== choice("clearance_gate")));

  const doctorate = baseline.qualification_requirements?.doctorate_requirement;
  if (doctorate) {
    const rulesDoctorate = doctorate === "none" ? "not_required" : "required";
    fields.push(field("doctorate_gate", "Doctorate", rulesDoctorate, choice("doctorate_gate"),
      DEFINITE(choice("doctorate_gate")) && rulesDoctorate !== choice("doctorate_gate")));
  }

  const rulesMode = baseline.work_mode ?? "unknown";
  fields.push(field("work_mode", "Work mode", rulesMode, choice("work_mode"),
    rulesMode !== "unknown" && DEFINITE(choice("work_mode")) && rulesMode !== choice("work_mode")));

  let kind: ComparisonKind;
  if (!rules) kind = "not_comparable";
  else if (jev.decision === "unsure") kind = "jev_unsure";
  else if (rules.decision === jev.decision) kind = "agree";
  else kind = rules.decision === "include" ? "rules_only" : "jev_only";

  return { kind, rules: rules ?? { decision: "unsure", reason: sampledReason }, jev, fields };
}
