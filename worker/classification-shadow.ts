import type { JobListing } from "./adapters/types";
import type { Env } from "./types";
import { classifyTitleScope } from "./job-scope";
import { classifyJob, hasPotentiallyEligibleSeniority, JOB_CLASSIFIER_VERSION, requiresAdvancedDegree, requiresSecurityClearance, titleRequiresAdvancedDegree } from "./job-features";
import { isUsJobLocation } from "./us-jobs";
import { isFreshPostedAt } from "../shared/job-policy";
import { hasTable } from "./db-schema";
import { classifyWithJev, JEV_MODEL, JEV_QUESTION_VERSION, type JevFetch } from "./jev";

export const CLASSIFICATION_GATE_VERSION = `${JOB_CLASSIFIER_VERSION}/scope-v13`;
const MAX_DESCRIPTION_CHARS = 12_000;
const MAX_SHADOW_CALLS_PER_DAY = 100;
export const MAX_AUDIT_LISTINGS_PER_CHECKPOINT = 25;

/** First catalog rejection, not a final personalized match decision. */
export function catalogDecisionReason(job: JobListing, customTitles: readonly string[] = []): string {
  const scope = classifyTitleScope(job.title, job.department, customTitles);
  if (!scope.admitted) return scope.reason;
  if (!isUsJobLocation(job.location)) return "rejected_location";
  if (!isFreshPostedAt(job.postedAt)) return "rejected_freshness";
  if (!hasPotentiallyEligibleSeniority(job.title)) return "rejected_seniority";
  if (titleRequiresAdvancedDegree(job.title) || requiresAdvancedDegree(job.description)) return "rejected_doctorate";
  if (/\b(?:ts\s*\/\s*sci|top secret|(?:active|current)\s+(?:secret|security)\s+clearance|secret\s+clearance)\b/i.test(job.title)
    || requiresSecurityClearance(job.description)) return "rejected_clearance";
  return job.description?.trim() ? "catalog_candidate" : "needs_description";
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function listingFingerprint(job: JobListing): Promise<string> {
  // Full source content invalidates the cache even when inference text is capped.
  return digest(JSON.stringify([job.title.trim(), job.location.trim(), job.department,
    job.postedAt, job.description, job.salary, job.url]));
}

interface CachedDecision { external_id: string; content_hash: string; gate_version: string; reason: string }

export async function recordSourceDecisions(
  db: D1Database, companyId: string, jobs: JobListing[], customTitles: readonly string[], shadow: boolean,
): Promise<void> {
  if (!jobs.length) return;
  const prior = await db.prepare("SELECT external_id, content_hash, gate_version, reason FROM source_job_decisions WHERE company_id = ?")
    .bind(companyId).all<CachedDecision>();
  const known = new Map((prior.results ?? []).map((row) => [row.external_id, row]));
  // Large boards can carry megabytes of rejected descriptions. Awaiting writes
  // for their entire inventory holds six polling snapshots in memory at once.
  // Fill unseen rows gradually, then rotate through cached rows for source edits.
  const selected: JobListing[] = [];
  const selectedIds = new Set<string>();
  for (const job of jobs) {
    if (!known.has(job.externalId) && !selectedIds.has(job.externalId)) {
      selected.push(job);
      selectedIds.add(job.externalId);
      if (selected.length === MAX_AUDIT_LISTINGS_PER_CHECKPOINT) break;
    }
  }
  const offset = (Math.floor(Date.now() / 900_000) * MAX_AUDIT_LISTINGS_PER_CHECKPOINT) % jobs.length;
  for (let index = 0; index < jobs.length && selected.length < MAX_AUDIT_LISTINGS_PER_CHECKPOINT; index++) {
    const job = jobs[(offset + index) % jobs.length];
    if (selectedIds.has(job.externalId)) continue;
    selected.push(job);
    selectedIds.add(job.externalId);
  }
  const cached = shadow ? await db.prepare("SELECT cache_key FROM job_classification_shadow WHERE company_id = ?")
    .bind(companyId).all<{ cache_key: string }>() : { results: [] };
  const knownShadow = new Set((cached.results ?? []).map((row) => row.cache_key));
  const sampled = new Map<string, number>();
  let samples = 0;
  const now = new Date().toISOString();
  const gateVersion = customTitles.length
    ? `${CLASSIFICATION_GATE_VERSION}/${await digest(JSON.stringify([...customTitles].sort()))}`
    : CLASSIFICATION_GATE_VERSION;
  // Sequential bounded batches keep hashing and D1 writes within Worker limits.
  for (let offset = 0; offset < selected.length; offset += 25) {
    const statements: D1PreparedStatement[] = [];
    for (const job of selected.slice(offset, offset + 25)) {
      const hash = await listingFingerprint(job);
      const old = known.get(job.externalId);
      const unchanged = old?.content_hash === hash && old.gate_version === gateVersion;
      // Reuse expensive scope/requirement parsing. Freshness can change while
      // source text remains identical, so candidates still age out correctly.
      const reason = unchanged
        ? (old.reason === "catalog_candidate" || old.reason === "needs_description") && !isFreshPostedAt(job.postedAt)
          ? "rejected_freshness" : old.reason
        : catalogDecisionReason(job, customTitles);
      if (!unchanged || old.reason !== reason) {
        statements.push(db.prepare(`INSERT INTO source_job_decisions
          (company_id, external_id, content_hash, gate_version, reason, title, location, job_url, evaluated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(company_id, external_id) DO UPDATE SET content_hash=excluded.content_hash,
            gate_version=excluded.gate_version, reason=excluded.reason, title=excluded.title,
            location=excluded.location, job_url=excluded.job_url, evaluated_at=excluded.evaluated_at`)
          .bind(companyId, job.externalId, hash, gateVersion, reason, job.title, job.location, job.url, now));
      }
      if (!shadow || !job.description?.trim() || samples >= 8 || (sampled.get(reason) ?? 0) >= 2) continue;
      const cacheKey = await digest(`${companyId}/${job.externalId}/${hash}/${gateVersion}/${JEV_MODEL}/${JEV_QUESTION_VERSION}`);
      if (knownShadow.has(cacheKey)) continue;
      // Stratify across rejection reasons; deliberately include non-US and
      // out-of-scope rows. This is a diagnostic sample, not an accuracy estimate.
      const input = {
        title: job.title.slice(0, 500), location: job.location.slice(0, 500), department: job.department?.slice(0, 500) ?? null,
        description: job.description.slice(0, MAX_DESCRIPTION_CHARS),
      };
      statements.push(db.prepare(`INSERT OR IGNORE INTO job_classification_shadow
        (cache_key, company_id, external_id, reason, input_json, baseline_json, truncated, queued_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(cacheKey, companyId, job.externalId, reason, JSON.stringify(input), JSON.stringify(classifyJob(job)), job.description.length > MAX_DESCRIPTION_CHARS ? 1 : 0, now));
      sampled.set(reason, (sampled.get(reason) ?? 0) + 1);
      samples++;
    }
    if (statements.length) await db.batch(statements);
  }
}

export async function sourceDecisionRecorder(db: D1Database, enabled: boolean, shadow: boolean) {
  const available = enabled && await hasTable(db, "source_job_decisions") && await hasTable(db, "job_classification_shadow");
  return async (companyId: string, jobs: JobListing[], customTitles: readonly string[]) => {
    if (available) await recordSourceDecisions(db, companyId, jobs, customTitles, shadow)
      .catch(() => console.error("Source classification audit failed"));
  };
}

export function shadowDailyLimit(value?: string): number {
  const parsed = Number(value ?? MAX_SHADOW_CALLS_PER_DAY);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, MAX_SHADOW_CALLS_PER_DAY) : 0;
}

/** Reserve before calling the provider; timeouts and crashes still consume quota. */
export async function reserveShadowCall(db: D1Database, day: string, limit: number): Promise<boolean> {
  if (limit <= 0) return false;
  return Boolean(await db.prepare(`INSERT INTO classification_daily_budget(day, calls) VALUES (?, 1)
    ON CONFLICT(day) DO UPDATE SET calls = calls + 1 WHERE calls < ? RETURNING calls`)
    .bind(day, limit).first());
}

export async function runClassificationShadow(env: Env, fetcher: JevFetch = fetch): Promise<number> {
  if (env.JOB_CLASSIFICATION_SHADOW !== "true" || !env.OPENROUTER_API_KEY
    || !await hasTable(env.DB, "job_classification_shadow")) return 0;
  const db = env.DB;
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const limit = shadowDailyLimit(env.JEV_DAILY_CALL_LIMIT);
  if (limit === 0) return 0;
  const budget = await db.prepare("SELECT calls FROM classification_daily_budget WHERE day=?")
    .bind(day).first<{ calls: number }>();
  if ((budget?.calls ?? 0) >= limit) return 0;
  // Leases survive isolate loss. Two total attempts per fingerprint, never an
  // unbounded retry loop. Unknown failed-request cost stays null for reconciliation.
  await db.prepare(`UPDATE job_classification_shadow
    SET status = CASE WHEN attempts < 2 THEN 'pending' ELSE 'failed' END,
      input_json = CASE WHEN attempts < 2 THEN input_json ELSE NULL END,
      completed_at = CASE WHEN attempts < 2 THEN NULL ELSE ? END,
      error_code = 'lease_expired', started_at = NULL
    WHERE status = 'running' AND started_at < ?`)
    .bind(now.toISOString(), new Date(now.getTime() - 10 * 60_000).toISOString()).run();
  const rows = await db.prepare(`SELECT cache_key FROM job_classification_shadow
    WHERE status = 'pending' AND attempts < 2 ORDER BY queued_at, cache_key LIMIT 10`)
    .all<{ cache_key: string }>();
  let completed = 0;
  // Two concurrent calls, ten per invocation. Alerts have already been sent.
  const work = async (cacheKey: string) => {
    const row = await db.prepare(`UPDATE job_classification_shadow
      SET status='running', started_at=?, attempts=attempts+1
      WHERE cache_key=? AND status='pending' AND attempts < 2 RETURNING input_json`)
      .bind(now.toISOString(), cacheKey).first<{ input_json: string }>();
    if (!row) return;
    if (!await reserveShadowCall(db, day, limit)) {
      await db.prepare("UPDATE job_classification_shadow SET status='pending', attempts=attempts-1, started_at=NULL WHERE cache_key=?")
        .bind(cacheKey).run();
      return;
    }
    try {
      const result = await classifyWithJev(JSON.parse(row.input_json), env.OPENROUTER_API_KEY!, fetcher);
      await db.batch([
        db.prepare(`UPDATE job_classification_shadow SET status='complete', input_json=NULL,
          completed_at=?, answers_json=?, model=?, request_id=?, input_tokens=?, output_tokens=?, cost_usd=?, latency_ms=?, error_code=NULL
          WHERE cache_key=?`).bind(new Date().toISOString(), JSON.stringify(result.answers), result.model, result.requestId,
            result.inputTokens, result.outputTokens, result.costUsd, result.latencyMs, cacheKey),
        db.prepare("UPDATE classification_daily_budget SET reported_cost_usd=reported_cost_usd+? WHERE day=?")
          .bind(result.costUsd ?? 0, day),
      ]);
      completed++;
    } catch (error) {
      const code = error instanceof Error && /^jev_(?:http_\d{3}|invalid_answers|invalid_model)$/.test(error.message)
        ? error.message : "jev_request_failed";
      // Preserve the failed row for explicit review; no automatic paid retry.
      await db.prepare("UPDATE job_classification_shadow SET status='failed', input_json=NULL, completed_at=?, error_code=? WHERE cache_key=?")
        .bind(new Date().toISOString(), code, cacheKey).run();
    }
  };
  const pending = rows.results ?? [];
  for (let offset = 0; offset < pending.length; offset += 2) {
    await Promise.all(pending.slice(offset, offset + 2).map((row) => work(row.cache_key)));
  }
  return completed;
}
