export type ApplicationFormAts = "greenhouse" | "ashby";

export type ApplicationFieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "url"
  | "file"
  | "select"
  | "multiselect"
  | "boolean"
  | "date"
  | "number"
  | "location";

/** "about" is contact and background, "questions" is everything the employer
 * added, "voluntary" is EEO and demographic surveys. */
export type ApplicationFieldSection = "about" | "questions" | "voluntary";

export interface ApplicationFieldOption {
  label: string;
  value: string;
}

export interface ApplicationField {
  /** The ATS's own name for the input; autofill targets it. */
  id: string;
  label: string;
  type: ApplicationFieldType;
  required: boolean;
  options: ApplicationFieldOption[];
  section: ApplicationFieldSection;
  /** Where the answer lives: a standard key such as "sponsorship", or
   * "q:<question text>" for anything specific to an employer. */
  key: string;
}

export interface ApplicationForm {
  ats: ApplicationFormAts;
  fields: ApplicationField[];
}

export type ApplicationAnswerValue = string | string[];
/** "profile" is the work authorization set in job preferences. */
export type ApplicationAnswerSource = "resume" | "saved" | "profile" | "default";

export interface PreparedApplicationField extends ApplicationField {
  /** For selects, the chosen option label(s). */
  answer: ApplicationAnswerValue | null;
  source: ApplicationAnswerSource | null;
}

export interface PreparedApplication {
  job_id: string;
  supported: boolean;
  ats: ApplicationFormAts | null;
  /** The ATS-hosted form, where autofill knows the fields. */
  apply_url: string | null;
  fields: PreparedApplicationField[];
  missing_required: number;
}

export function isAnswered(value: ApplicationAnswerValue | null | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim() !== "";
}

// ─── Reading and filling any form ────────────────────────────────────────────

export type FormControlKind =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "date"
  | "select"
  | "combobox"
  | "radio"
  | "checkbox"
  | "checkboxes"
  | "buttons"
  | "file";

/** One question as a person sees it on the page, from the in-page reader. */
export interface FormControl {
  /** Stamped on the element as data-pinkslip-ref so a later step can find it. */
  ref: string;
  kind: FormControlKind;
  label: string;
  required: boolean;
  options: string[];
  /** Options load as you type (an address or school search). */
  searchable: boolean;
  value: string | string[] | null;
}

export interface FillStep {
  ref: string;
  kind: FormControlKind;
  value: string | string[];
  /** Type the value, then pick the matching suggestion. */
  pick?: boolean;
}

/** What the server worked out for a page: how to fill it, and what it couldn't. */
export interface ApplyPlan {
  steps: FillStep[];
  /** Questions with no confident answer; the user answers these once. */
  needs: Array<Pick<FormControl, "ref" | "label" | "kind" | "options" | "required">>;
  /** Answers Jev inferred, kept visible so a wrong guess can be caught. */
  inferred: Array<{ ref: string; label: string; answer: string; confidence: number }>;
}
