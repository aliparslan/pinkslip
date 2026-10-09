import type { ApplicationAnswerValue } from "../../shared/application-form";
import {
  COMMON_QUESTIONS,
  commonQuestion,
  describeCommonAnswer,
  isCommonQuestionKey,
  validCommonAnswer,
  type SavedApplicationAnswer,
} from "../../shared/application-answers";
import { ApplyError } from "./prepare";

const MAX_KEY_LENGTH = 260;
const MAX_LABEL_LENGTH = 500;
const MAX_LISTED = 500;

type AnswerRow = { answer_key: string; label: string; value_json: string; updated_at: string };

function toAnswer(row: AnswerRow): SavedApplicationAnswer | null {
  try {
    const value = JSON.parse(row.value_json) as unknown;
    const valid = typeof value === "string"
      || (Array.isArray(value) && value.every((item) => typeof item === "string"));
    return valid ? { key: row.answer_key, label: row.label, value: value as ApplicationAnswerValue, updated_at: row.updated_at } : null;
  } catch {
    return null;
  }
}

/** Every remembered answer, newest first. */
export async function listAnswers(db: D1Database, userId: string): Promise<SavedApplicationAnswer[]> {
  const rows = await db.prepare(
    `SELECT answer_key, label, value_json, updated_at FROM application_answers
     WHERE user_id = ? ORDER BY updated_at DESC, answer_key LIMIT ${MAX_LISTED}`
  ).bind(userId).all<AnswerRow>();
  return (rows.results ?? []).flatMap((row) => toAnswer(row) ?? []);
}

function validKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_KEY_LENGTH && key.trim() === key && !/[\u0000-\u001f]/.test(key);
}

/** Same caps as answers saved from a form. */
function validValue(value: unknown): ApplicationAnswerValue | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text && text.length <= 10_000 ? text : null;
  }
  if (Array.isArray(value) && value.length > 0 && value.length <= 50) {
    const items = value.map((item) => (typeof item === "string" ? item.trim() : ""));
    return items.every((item) => item && item.length <= 500) ? items : null;
  }
  return null;
}

/** A label for a row created here rather than from a form: the question
 * itself for "q:" keys, otherwise the key in words. */
function fallbackLabel(key: string): string {
  if (isCommonQuestionKey(key)) return commonQuestion(key).label;
  if (key.startsWith("q:")) return key.slice(2);
  return key.replace(/^field:/, "").replace(/_/g, " ");
}

/** Sets one answer. An existing row keeps its question wording unless a new
 * label is given. */
export async function saveAnswer(
  db: D1Database,
  userId: string,
  key: string,
  input: { value?: unknown; label?: unknown },
  now = new Date(),
): Promise<SavedApplicationAnswer> {
  if (!validKey(key)) throw new ApplyError("Unknown question", 400, "invalid_request");
  const value = isCommonQuestionKey(key) ? validCommonAnswer(key, input.value) : validValue(input.value);
  if (value === null) throw new ApplyError("Invalid answer", 400, "invalid_answer");
  if (input.label !== undefined && typeof input.label !== "string") {
    throw new ApplyError("Invalid question", 400, "invalid_request");
  }
  const label = typeof input.label === "string" && input.label.trim()
    ? input.label.trim().slice(0, MAX_LABEL_LENGTH)
    : null;
  await db.prepare(
    `INSERT INTO application_answers (user_id, answer_key, label, value_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, answer_key) DO UPDATE SET
       label = COALESCE(?, application_answers.label),
       value_json = excluded.value_json,
       updated_at = excluded.updated_at`
  ).bind(userId, key, label ?? fallbackLabel(key), JSON.stringify(value), now.toISOString(), label).run();
  const row = await db.prepare(
    "SELECT answer_key, label, value_json, updated_at FROM application_answers WHERE user_id = ? AND answer_key = ?"
  ).bind(userId, key).first<AnswerRow>();
  return toAnswer(row!)!;
}

export async function deleteAnswer(db: D1Database, userId: string, key: string): Promise<boolean> {
  if (!validKey(key)) throw new ApplyError("Unknown question", 400, "invalid_request");
  const result = await db.prepare(
    "DELETE FROM application_answers WHERE user_id = ? AND answer_key = ?"
  ).bind(userId, key).run();
  return (result.meta?.changes ?? 0) > 0;
}

/** The up-front answers as plain facts for Jev, in a fixed order. They come
 * from the whole bank, so learned answers never push them out. */
export function commonAnswerFacts(saved: Map<string, ApplicationAnswerValue>): Array<{ label: string; value: string }> {
  return COMMON_QUESTIONS.flatMap((question) => {
    const value = saved.get(question.key);
    return value === undefined ? [] : [{ label: question.fact, value: describeCommonAnswer(question.key, value) }];
  });
}
