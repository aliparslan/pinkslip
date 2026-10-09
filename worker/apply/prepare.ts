import { getUserProfile } from "../account";
import { getCompanySourceType } from "../ats";
import type { CompanyRow, Env } from "../types";
import type {
  ApplicationAnswerValue,
  ApplicationForm,
  PreparedApplication,
} from "../../shared/application-form";
import { isAnswered } from "../../shared/application-form";
import {
  DEFAULT_SEARCH_PROFILE,
  normalizeSearchProfile,
  type WorkAuthorization,
} from "../../shared/search-profile";
import { impliedAnswers, prepareFields, questionKey, storageKey, storedAnswer } from "./answers";
import { applicationFormForJob, applicationUrl, type FormSource } from "./forms";

export class ApplyError extends Error {
  constructor(message: string, readonly status: 400 | 404, readonly code: string) {
    super(message);
  }
}

async function formForJob(
  env: Env,
  jobId: string,
  fetcher: typeof fetch,
): Promise<{ form: ApplicationForm; source: FormSource } | null> {
  const job = await env.DB.prepare(
    `SELECT j.id, j.external_id, c.ats_type, c.source_type, c.ats_slug
     FROM jobs j JOIN companies c ON c.id = j.company_id
     WHERE j.id = ?`
  ).bind(jobId).first<Pick<CompanyRow, "ats_type" | "source_type" | "ats_slug"> & {
    id: string;
    external_id: string;
  }>();
  if (!job) throw new ApplyError("Job not found", 404, "not_found");
  const source = { ats: getCompanySourceType(job), slug: job.ats_slug, externalId: job.external_id };
  const form = await applicationFormForJob(env.DB, job.id, source, fetcher);
  return form ? { form, source } : null;
}

export async function savedAnswers(db: D1Database, userId: string): Promise<Map<string, ApplicationAnswerValue>> {
  const rows = await db.prepare(
    "SELECT answer_key, value_json FROM application_answers WHERE user_id = ?"
  ).bind(userId).all<{ answer_key: string; value_json: string }>();
  const answers = new Map<string, ApplicationAnswerValue>();
  for (const row of rows.results ?? []) {
    try {
      answers.set(row.answer_key, JSON.parse(row.value_json) as ApplicationAnswerValue);
    } catch {
      // A corrupt row is the same as no answer.
    }
  }
  return answers;
}

/** The work authorization from job preferences, when the user actually chose
 * it: after onboarding, or any value other than the default. */
export async function preferredWorkAuthorization(db: D1Database, userId: string): Promise<WorkAuthorization | null> {
  const row = await db.prepare(
    "SELECT profile_json, onboarding_completed_at FROM user_search_profiles WHERE user_id = ?"
  ).bind(userId).first<{ profile_json: string; onboarding_completed_at: string | null }>().catch(() => null);
  if (!row) return null;
  try {
    const chosen = normalizeSearchProfile(JSON.parse(row.profile_json)).work_authorization;
    return row.onboarding_completed_at || chosen !== DEFAULT_SEARCH_PROFILE.work_authorization ? chosen : null;
  } catch {
    return null;
  }
}

export async function prepareApplication(
  env: Env,
  userId: string,
  jobId: string,
  fetcher: typeof fetch = fetch,
): Promise<PreparedApplication> {
  const found = await formForJob(env, jobId, fetcher);
  if (!found) return { job_id: jobId, supported: false, ats: null, apply_url: null, fields: [], missing_required: 0 };
  const { form, source } = found;
  const [profile, saved, workAuthorization] = await Promise.all([
    getUserProfile(env.DB, userId),
    savedAnswers(env.DB, userId),
    preferredWorkAuthorization(env.DB, userId),
  ]);
  const fields = prepareFields(form.fields, profile.data, saved, impliedAnswers(workAuthorization));
  return {
    job_id: jobId,
    supported: true,
    ats: form.ats,
    apply_url: applicationUrl(source),
    fields,
    missing_required: fields.filter((field) => field.required && !isAnswered(field.answer)).length,
  };
}

function validValue(value: unknown, multiple: boolean): ApplicationAnswerValue | null | undefined {
  if (value === null) return null;
  if (multiple && Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.map((item) => item.slice(0, 500)).slice(0, 50);
  }
  if (typeof value === "string") return value.slice(0, 10_000);
  return undefined;
}

/** Saves answers by field id into the user's bank. A null or empty answer
 * forgets what was saved for that question. */
export async function saveApplicationAnswers(
  env: Env,
  userId: string,
  jobId: string,
  answers: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<PreparedApplication> {
  const found = await formForJob(env, jobId, fetcher);
  if (!found) throw new ApplyError("This application can't be prepared here.", 400, "unsupported");
  const byId = new Map(found.form.fields.map((field) => [field.id, field]));
  const statements: D1PreparedStatement[] = [];
  for (const [fieldId, raw] of Object.entries(answers)) {
    const field = byId.get(fieldId);
    if (!field || field.type === "file") continue;
    const value = validValue(raw, field.type === "multiselect");
    if (value === undefined) throw new ApplyError(`Invalid answer for "${field.label}"`, 400, "invalid_answer");
    if (!isAnswered(value)) {
      statements.push(env.DB.prepare(
        "DELETE FROM application_answers WHERE user_id = ? AND answer_key IN (?, ?)"
      ).bind(userId, field.key, questionKey(field)));
      continue;
    }
    const stored = storedAnswer(field, value!);
    const key = storageKey(field, stored);
    if (key !== questionKey(field)) {
      // A shared answer replaces any one-off answer this form had.
      statements.push(env.DB.prepare(
        "DELETE FROM application_answers WHERE user_id = ? AND answer_key = ?"
      ).bind(userId, questionKey(field)));
    }
    statements.push(env.DB.prepare(
      `INSERT INTO application_answers (user_id, answer_key, label, value_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, answer_key) DO UPDATE SET
         label = excluded.label, value_json = excluded.value_json, updated_at = excluded.updated_at`
    ).bind(userId, key, field.label, JSON.stringify(stored), now.toISOString()));
  }
  if (statements.length > 0) await env.DB.batch(statements);
  return prepareApplication(env, userId, jobId, fetcher);
}
