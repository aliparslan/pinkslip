import type { ApplicationAnswerValue } from "./application-form";
import type { WorkAuthorization } from "./search-profile";

/** One row of the user's answers bank, as the answers screen lists it. */
export interface SavedApplicationAnswer {
  /** A standard key such as "relocation", or "q:<question text>". */
  key: string;
  label: string;
  value: ApplicationAnswerValue;
  updated_at: string;
}

/**
 * Questions the user can answer up front, before any form asks. They live in
 * the answers bank like any other answer. The keys forms already share
 * (relocation, start date, graduation, pronouns) fill fields directly; every
 * one of them also reaches Jev as an applicant fact, so a question no rule
 * matches, such as days in the office, is still answered.
 *
 * Sponsorship isn't here: it's the work authorization in job preferences.
 */
export const COMMON_QUESTIONS = [
  { key: "office_days", label: "Days in an office", fact: "Days a week the applicant will work from an office" },
  { key: "relocation", label: "Open to relocation", fact: "Willing to relocate for the job" },
  { key: "start_date", label: "Earliest start", fact: "Earliest start date" },
  { key: "graduation", label: "Graduation", fact: "Graduation date" },
  { key: "salary", label: "Salary expectation", fact: "Salary expectation" },
  { key: "pronouns", label: "Pronouns", fact: "Pronouns" },
] as const;

export type CommonQuestionKey = (typeof COMMON_QUESTIONS)[number]["key"];

/** Office days: 0 is fully remote only, 1–4 hybrid up to that many, 5 fully onsite. */
export const OFFICE_DAYS_MAX = 5;
export const PRONOUN_OPTIONS = ["He/him", "She/her", "They/them"] as const;

const COMMON_KEYS = new Set<string>(COMMON_QUESTIONS.map((question) => question.key));
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function isCommonQuestionKey(key: string): key is CommonQuestionKey {
  return COMMON_KEYS.has(key);
}

export function commonQuestion(key: CommonQuestionKey) {
  return COMMON_QUESTIONS.find((question) => question.key === key)!;
}

/** The value to store for a common question, or null when it doesn't fit. */
export function validCommonAnswer(key: CommonQuestionKey, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  switch (key) {
    case "office_days":
      return /^[0-5]$/.test(text) ? text : null;
    case "relocation":
      return text === "yes" || text === "no" ? text : null;
    case "start_date":
      // A date from the picker, or what a form was told ("Immediately").
      return ISO_DATE.test(text) || text.length <= 60 ? text : null;
    case "graduation":
      return text.length <= 40 ? text : null;
    case "salary":
      return text.length <= 120 ? text : null;
    case "pronouns":
      return text.length <= 40 ? text : null;
  }
}

/** "2027-06-01" → "June 1, 2027". Anything else stays as written. */
export function formatAnswerDate(value: string): string {
  if (!ISO_DATE.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** How Jev reads a common answer. */
export function describeCommonAnswer(key: CommonQuestionKey, value: ApplicationAnswerValue): string {
  const text = Array.isArray(value) ? value.join(", ") : value;
  switch (key) {
    case "office_days": {
      const days = Number(text);
      if (days === 0) return "None; fully remote roles only";
      if (days >= OFFICE_DAYS_MAX) return "Any, including fully onsite (5 days a week)";
      return Number.isInteger(days) && days > 0 ? `Up to ${days} (hybrid); not more` : text;
    }
    case "relocation":
      return text === "yes" ? "Yes" : text === "no" ? "No" : text;
    case "start_date":
      return formatAnswerDate(text);
    default:
      return text;
  }
}

/**
 * Saved answers that a newly chosen work authorization makes stale. A saved
 * answer outranks job preferences when a form is filled, so an old
 * sponsorship answer would otherwise keep winning.
 */
export function staleAuthorizationKeys(
  choice: WorkAuthorization,
  answers: Pick<SavedApplicationAnswer, "key" | "value">[],
): string[] {
  return answers
    .filter((answer) => answer.key === "sponsorship"
      || (answer.key === "work_authorization" && choice === "authorized" && answer.value !== "yes"))
    .map((answer) => answer.key);
}

/** The sponsorship answer forms get: a saved answer first, then job preferences. */
export function effectiveAuthorization(
  preference: WorkAuthorization,
  answers: Pick<SavedApplicationAnswer, "key" | "value">[],
): WorkAuthorization {
  const saved = answers.find((answer) => answer.key === "sponsorship")?.value;
  if (saved === "yes") return "sponsorship";
  if (saved === "no") return "authorized";
  return preference;
}
