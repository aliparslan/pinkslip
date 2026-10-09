import type {
  ApplicationField,
  ApplicationFieldType,
  ApplicationForm,
  ApplicationFormAts,
} from "../../shared/application-form";
import { answerKey, sectionFor } from "./answers";

const USER_AGENT = "Pinkslip/1.0 (+https://pinkslip.work)";
const FORM_CACHE_MS = 12 * 60 * 60 * 1000;
/** Bump when normalizing or key rules change, so cached forms are rebuilt. */
const FORM_CACHE_VERSION = 2;

function cleanLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .slice(0, 500);
}

function field(
  id: string,
  label: string,
  type: ApplicationFieldType,
  required: boolean,
  options: ApplicationField["options"],
  voluntary: boolean,
): ApplicationField {
  const text = cleanLabel(label);
  const key = answerKey(id, text, type, voluntary);
  return { id, label: text, type, required, options, section: sectionFor(key, voluntary), key };
}

// ─── Greenhouse ──────────────────────────────────────────────────────────────

interface GreenhouseQuestion {
  label: string;
  required: boolean;
  fields: Array<{
    name: string;
    type: string;
    values?: Array<{ label: string; value: string | number }>;
  }>;
}

interface GreenhouseDemographicQuestion {
  id: number;
  label: string;
  required: boolean;
  type: string;
  answer_options: Array<{ id: number; label: string }>;
}

export interface GreenhouseJobPayload {
  questions?: GreenhouseQuestion[] | null;
  location_questions?: GreenhouseQuestion[] | null;
  compliance?: Array<{ questions: GreenhouseQuestion[] }> | null;
  demographic_questions?: { questions?: GreenhouseDemographicQuestion[] } | null;
}

const GREENHOUSE_TYPES: Record<string, ApplicationFieldType> = {
  input_text: "text",
  textarea: "textarea",
  input_file: "file",
  multi_value_single_select: "select",
  multi_value_multi_select: "multiselect",
};

function greenhouseField(question: GreenhouseQuestion, voluntary: boolean): ApplicationField | null {
  // Resume and cover letter offer a file or pasted text; the file comes first.
  const input = question.fields.find((candidate) => GREENHOUSE_TYPES[candidate.type]);
  if (!input) return null;
  let type = GREENHOUSE_TYPES[input.type];
  if (input.name === "email") type = "email";
  if (input.name === "phone") type = "phone";
  if (input.name === "location") type = "location";
  const options = (input.values ?? []).map((value) => ({ label: cleanLabel(value.label), value: String(value.value) }));
  return field(input.name, question.label, type, question.required, options, voluntary);
}

export function normalizeGreenhouseForm(payload: GreenhouseJobPayload): ApplicationForm {
  const fields: ApplicationField[] = [];
  for (const question of [...(payload.questions ?? []), ...(payload.location_questions ?? [])]) {
    const normalized = greenhouseField(question, false);
    if (normalized) fields.push(normalized);
  }
  for (const group of payload.compliance ?? []) {
    for (const question of group.questions ?? []) {
      const normalized = greenhouseField(question, true);
      if (normalized) fields.push(normalized);
    }
  }
  for (const question of payload.demographic_questions?.questions ?? []) {
    const type = question.type === "multi_value_multi_select" ? "multiselect" : "select";
    const options = question.answer_options.map((option) => ({ label: cleanLabel(option.label), value: String(option.id) }));
    fields.push(field(String(question.id), question.label, type, question.required, options, true));
  }
  return { ats: "greenhouse", fields };
}

// ─── Ashby ───────────────────────────────────────────────────────────────────

interface AshbyFieldEntry {
  isRequired: boolean;
  descriptionHtml?: string | null;
  field: {
    path: string;
    title: string;
    type: string;
    selectableValues?: Array<{ label: string; value: string }> | null;
  };
}

interface AshbySection {
  fieldEntries: AshbyFieldEntry[];
}

export interface AshbyJobPosting {
  applicationForm?: { sections: AshbySection[] } | null;
  surveyForms?: Array<{ sections: AshbySection[] }> | null;
}

const ASHBY_TYPES: Record<string, ApplicationFieldType> = {
  String: "text",
  Email: "email",
  Phone: "phone",
  File: "file",
  LongText: "textarea",
  Boolean: "boolean",
  ValueSelect: "select",
  MultiValueSelect: "multiselect",
  Location: "location",
  Date: "date",
  Number: "number",
  Url: "url",
  SocialLink: "url",
};

const YES_NO_OPTIONS = [
  { label: "Yes", value: "true" },
  { label: "No", value: "false" },
];

function ashbyFields(sections: AshbySection[], voluntary: boolean): ApplicationField[] {
  return sections.flatMap((section) => section.fieldEntries.map((entry) => {
    const type = ASHBY_TYPES[entry.field.type] ?? "text";
    const options = type === "boolean"
      ? YES_NO_OPTIONS
      : (entry.field.selectableValues ?? []).map((value) => ({ label: cleanLabel(value.label), value: value.value }));
    // Some questions live entirely in the description and leave the title blank.
    const label = entry.field.title.trim() || stripHtml(entry.descriptionHtml ?? "");
    return field(entry.field.path, label, type, entry.isRequired, options, voluntary);
  }));
}

export function normalizeAshbyForm(posting: AshbyJobPosting): ApplicationForm {
  return {
    ats: "ashby",
    fields: [
      ...ashbyFields(posting.applicationForm?.sections ?? [], false),
      ...(posting.surveyForms ?? []).flatMap((survey) => ashbyFields(survey.sections, true)),
    ],
  };
}

const ASHBY_QUERY = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
  jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
    applicationForm { sections { fieldEntries { field isRequired descriptionHtml } } }
    surveyForms { sections { fieldEntries { field isRequired descriptionHtml } } }
  }
}`;

// ─── Fetching ────────────────────────────────────────────────────────────────

export interface FormSource {
  ats: string;
  slug: string;
  externalId: string;
}

export function supportedFormAts(ats: string): ApplicationFormAts | null {
  return ats === "greenhouse" || ats === "ashby" ? ats : null;
}

/** The ATS's own hosted form. Greenhouse's job page redirects to the company's
 * careers site for some employers (Roblox), which frames the form where
 * autofill can't reach it; the embed URL is the bare form for every board. */
export function applicationUrl(source: FormSource): string | null {
  const slug = encodeURIComponent(source.slug);
  const id = encodeURIComponent(source.externalId);
  if (source.ats === "greenhouse") return `https://job-boards.greenhouse.io/embed/job_app?for=${slug}&token=${id}`;
  if (source.ats === "ashby") return `https://jobs.ashbyhq.com/${slug}/${id}/application`;
  return null;
}

export async function fetchApplicationForm(
  source: FormSource,
  fetcher: typeof fetch = fetch,
): Promise<ApplicationForm | null> {
  const ats = supportedFormAts(source.ats);
  if (ats === "greenhouse") {
    const response = await fetcher(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.slug)}/jobs/${encodeURIComponent(source.externalId)}?questions=true`,
      { headers: { "user-agent": USER_AGENT } },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Greenhouse form request failed: ${response.status}`);
    return normalizeGreenhouseForm(await response.json() as GreenhouseJobPayload);
  }
  if (ats === "ashby") {
    const response = await fetcher("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": USER_AGENT },
      body: JSON.stringify({
        operationName: "ApiJobPosting",
        variables: { organizationHostedJobsPageName: source.slug, jobPostingId: source.externalId },
        query: ASHBY_QUERY,
      }),
    });
    if (!response.ok) throw new Error(`Ashby form request failed: ${response.status}`);
    const payload = await response.json() as { data?: { jobPosting?: AshbyJobPosting | null }; errors?: unknown };
    const posting = payload.data?.jobPosting;
    if (!posting) {
      if (payload.errors) throw new Error("Ashby form request returned errors");
      return null;
    }
    return normalizeAshbyForm(posting);
  }
  return null;
}

/** The job's application form, from a cache that lasts 12 hours. A stale copy
 * still serves when the ATS is unreachable. */
export async function applicationFormForJob(
  db: D1Database,
  jobId: string,
  source: FormSource,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<ApplicationForm | null> {
  if (!supportedFormAts(source.ats)) return null;
  const cached = await db.prepare(
    "SELECT form_json, fetched_at, version FROM application_forms WHERE job_id = ?"
  ).bind(jobId).first<{ form_json: string; fetched_at: string; version: number }>();
  if (
    cached
    && cached.version === FORM_CACHE_VERSION
    && now.getTime() - Date.parse(cached.fetched_at) < FORM_CACHE_MS
  ) {
    return JSON.parse(cached.form_json) as ApplicationForm;
  }
  try {
    const form = await fetchApplicationForm(source, fetcher);
    if (!form) return null;
    await db.prepare(
      `INSERT INTO application_forms (job_id, ats, form_json, version, fetched_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(job_id) DO UPDATE SET
         ats = excluded.ats, form_json = excluded.form_json,
         version = excluded.version, fetched_at = excluded.fetched_at`
    ).bind(jobId, form.ats, JSON.stringify(form), FORM_CACHE_VERSION, now.toISOString()).run();
    return form;
  } catch (error) {
    if (cached?.version === FORM_CACHE_VERSION) return JSON.parse(cached.form_json) as ApplicationForm;
    throw error;
  }
}
