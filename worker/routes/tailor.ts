import { Hono } from "hono";
import { getAdapter } from "../ats";
import {
  buildCandidateEvidence,
  RESUME_COMPILER_VERSION,
  RESUME_TEMPLATE_VERSION,
  validateTailoringPlan,
  validateTailoredResume,
  type CandidateEvidence,
  type JobSnapshot,
  type TailoredResume,
  type TailoringArtifact,
  type TailoringPlan,
  type TailoringValidation,
} from "../../shared/tailoring";
import {
  createTailoringPlan,
  generateStructuredResume,
  regenerateStructuredBullet,
} from "../tailor/structured";
import { getLatestUserTailoring, getUserProfile } from "../account";
import { recordProductEvent } from "../product-events";
import { ensureEligibleJobs } from "../job-scope";
import {
  WORKERS_AI_DAILY_NEURON_LIMIT,
  completeAppTailorUsage,
  failAppTailorUsage,
  loadTailorUsage,
  nextUtcDay,
  reserveAppTailorQuota,
  reserveTailorProviderAttempt,
} from "../tailor/usage";
import {
  normalizeWorkersAiModel,
} from "../tailor/config";
import {
  createResumeProfileSnapshot,
  loadResumeProfileSnapshot,
  resumeProfileHasChanged,
} from "../tailor/profile-snapshot";
import {
  artifactProvenanceHash,
  deleteR2Keys,
  insertArtifactMetadata,
  restoreArtifactDeletionState,
  sha256Hex,
  validSha256,
  type StoredArtifactRow,
} from "../tailor/artifact-storage";
import {
  compileResumeWithService,
  ResumeCompilerIntegrityError,
} from "../tailor/compiler-service";
import { recordTailoringQualityEvent } from "../tailor/quality";
import type {
  Env,
  TailoringRow,
  Variables,
} from "../types";

const tailor = new Hono<{ Bindings: Env; Variables: Variables }>();
tailor.use("/*", async (c, next) => {
  await ensureEligibleJobs(c.env.DB);
  await next();
});
interface JobForTailor {
  id: string;
  external_id: string;
  title: string;
  url: string;
  description: string | null;
  company_name: string;
  ats_type: string;
  source_type: string | null;
  ats_slug: string;
}

function parseStoredJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const EMPTY_PLAN: TailoringPlan = {
  schemaVersion: 2,
  requirements: [],
  matches: [],
  gaps: [],
  selectedEvidenceIds: [],
  excludedEvidenceIds: [],
};

function stringValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Adds exact-source provenance to plans created immediately before that field
 * shipped. If the frozen description cannot prove a requirement verbatim, the
 * row remains readable but must be replaced before generation or editing.
 */
export function normalizeStoredTailoringPlan(
  description: string,
  evidence: CandidateEvidence[],
  value: string | null,
): { plan: TailoringPlan; valid: boolean } {
  const raw = parseStoredJson<Record<string, unknown>>(value, {});
  const requirements = Array.isArray(raw.requirements)
    ? raw.requirements.flatMap((candidate, index) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
        const item = candidate as Record<string, unknown>;
        const text = typeof item.text === "string" ? item.text.trim() : "";
        if (!text) return [];
        const existingSource = item.source && typeof item.source === "object" && !Array.isArray(item.source)
          ? item.source as Record<string, unknown>
          : null;
        const existingStart = typeof existingSource?.start === "number" ? existingSource.start : -1;
        const existingEnd = typeof existingSource?.end === "number" ? existingSource.end : -1;
        const existingQuote = typeof existingSource?.quote === "string" ? existingSource.quote : "";
        const existingIsExact = existingStart >= 0
          && existingEnd > existingStart
          && description.slice(existingStart, existingEnd) === existingQuote;
        const locatedStart = existingIsExact ? existingStart : description.indexOf(text);
        const source = existingIsExact
          ? { quote: existingQuote, start: existingStart, end: existingEnd }
          : locatedStart >= 0
            ? { quote: text, start: locatedStart, end: locatedStart + text.length }
            : { quote: "", start: -1, end: -1 };
        const rawConfidence = typeof item.confidence === "number" ? item.confidence : 0.5;
        return [{
          id: typeof item.id === "string" && item.id ? item.id : `requirement-${index}`,
          text,
          priority: item.priority === "preferred" ? "preferred" as const : "required" as const,
          keywords: stringValues(item.keywords),
          source,
          confidence: Number.isFinite(rawConfidence)
            ? Math.max(0, Math.min(1, rawConfidence))
            : 0.5,
        }];
      })
    : [];
  const matches = Array.isArray(raw.matches)
    ? raw.matches.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
        const item = candidate as Record<string, unknown>;
        return typeof item.requirementId === "string"
          ? [{
              requirementId: item.requirementId,
              evidenceIds: stringValues(item.evidenceIds),
              reason: typeof item.reason === "string" ? item.reason : "",
            }]
          : [];
      })
    : [];
  const gaps = Array.isArray(raw.gaps)
    ? raw.gaps.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
        const item = candidate as Record<string, unknown>;
        return typeof item.requirementId === "string"
          ? [{
              requirementId: item.requirementId,
              reason: typeof item.reason === "string" ? item.reason : "",
            }]
          : [];
      })
    : [];
  const plan: TailoringPlan = {
    schemaVersion: 2,
    requirements,
    matches,
    gaps,
    selectedEvidenceIds: stringValues(raw.selectedEvidenceIds),
    excludedEvidenceIds: stringValues(raw.excludedEvidenceIds),
  };
  const issues = validateTailoringPlan(description, evidence, plan);
  return { plan, valid: requirements.length > 0 && issues.length === 0 };
}

export function normalizeTailoring(
  row: TailoringRow,
  latestArtifact: TailoringArtifact | null = null,
  sourceState: {
    sourceProfileChanged: boolean;
    requiresFreshPlan: boolean;
  } = {
    sourceProfileChanged: false,
    requiresFreshPlan: false,
  },
  planOverride?: TailoringPlan,
) {
  const status = row.status === "generated" || row.status === "failed"
    ? row.status
    : "planned";
  return {
    kind: "structured" as const,
    id: row.id,
    job_id: row.job_id,
    status,
    jobSnapshot: parseStoredJson<JobSnapshot>(row.job_snapshot_json, {
      jobId: row.job_id,
      title: "",
      company: "",
      url: "",
      description: "",
      descriptionHash: "",
      capturedAt: row.created_at,
    }),
    evidence: parseStoredJson<CandidateEvidence[]>(row.evidence_json, []),
    plan: planOverride ?? parseStoredJson<TailoringPlan>(row.plan_json, EMPTY_PLAN),
    resumeDraft: parseStoredJson<TailoredResume | null>(row.resume_draft_json, null),
    validation: parseStoredJson<TailoringValidation | null>(row.validation_json, null),
    templateVersion: row.template_version,
    compilerVersion: row.compiler_version,
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    model: row.model,
    created_at: row.created_at,
    updated_at: row.updated_at,
    latestArtifact,
    sourceProfileChanged: sourceState.sourceProfileChanged,
    requiresFreshPlan: sourceState.requiresFreshPlan,
  };
}

async function loadLatestArtifact(
  db: D1Database,
  userId: string,
  tailoringId: string,
): Promise<TailoringArtifact | null> {
  const artifact = await db.prepare(
    `SELECT a.*, CASE WHEN s.artifact_id IS NULL THEN 0 ELSE 1 END AS selected
     FROM tailored_resume_artifacts a
     LEFT JOIN tailoring_artifact_selections s ON s.artifact_id = a.id
     WHERE a.tailoring_id = ? AND a.user_id = ? AND a.storage_state = 'available'
     ORDER BY revision DESC
     LIMIT 1`,
  ).bind(tailoringId, userId).first<StoredArtifactRow>();
  return artifact ? artifactResponse(artifact) : null;
}

function artifactResponse(row: StoredArtifactRow): TailoringArtifact {
  return {
    id: row.id,
    tailoringId: row.tailoring_id,
    revision: row.revision,
    templateVersion: row.template_version,
    compilerVersion: row.compiler_version,
    createdAt: row.created_at,
    pageCount: row.page_count ?? undefined,
    pdfSha256: row.pdf_sha256 ?? undefined,
    resumeSha256: row.resume_sha256 ?? undefined,
    selected: Boolean(row.selected),
    storageState: row.storage_state === "available" ? "stored" : "missing",
    retentionPolicy: "until_deleted",
    verification: row.verification_status,
  };
}

async function normalizeTailoringForUser(
  db: D1Database,
  userId: string,
  row: TailoringRow,
  latestArtifact: TailoringArtifact | null = null,
) {
  const frozenProfile = await loadResumeProfileSnapshot(
    row.profile_snapshot_json,
    row.profile_hash,
  );
  if (!frozenProfile || !row.profile_hash) {
    return normalizeTailoring(row, latestArtifact, {
      sourceProfileChanged: false,
      requiresFreshPlan: true,
    });
  }
  const snapshot = parseStoredJson<JobSnapshot | null>(row.job_snapshot_json, null);
  const evidence = parseStoredJson<CandidateEvidence[]>(row.evidence_json, []);
  const normalizedPlan = normalizeStoredTailoringPlan(
    snapshot?.description ?? "",
    evidence,
    row.plan_json,
  );
  const { data: currentProfile } = await getUserProfile(db, userId);
  return normalizeTailoring(row, latestArtifact, {
    sourceProfileChanged: await resumeProfileHasChanged(currentProfile, row.profile_hash),
    requiresFreshPlan: !snapshot || !normalizedPlan.valid,
  }, normalizedPlan.plan);
}

const FRESH_PLAN_REQUIRED = {
  error: "This tailoring needs a fresh plan. Start over to use your current resume.",
  code: "tailoring_refresh_required",
} as const;

function tailoringFailureCode(error: unknown, fallback: string): string {
  return error instanceof ResumeCompilerIntegrityError ? error.code : fallback;
}

async function loadJobForTailor(
  db: D1Database,
  jobId: string
): Promise<JobForTailor | null> {
  return db
    .prepare(
      `SELECT
         j.id,
         j.external_id,
         j.title,
         j.url,
         j.description,
         c.name AS company_name,
         c.ats_type,
         c.source_type,
         c.ats_slug
       FROM jobs j
       JOIN companies c ON c.id = j.company_id
       WHERE j.id = ? AND j.closed_at IS NULL`
    )
    .bind(jobId)
    .first<JobForTailor>();
}

async function ensureJobDescription(
  db: D1Database,
  job: JobForTailor
): Promise<string | null> {
  if (job.description) return job.description;
  const adapter = getAdapter((job.source_type ?? job.ats_type) as never);
  if (!adapter) return null;

  const content = await adapter.fetchJobContent(job.ats_slug, job.external_id, job.url);
  if (!content.description) return null;

  await db.prepare(
    `UPDATE jobs
     SET description = ?, salary = COALESCE(?, salary)
     WHERE id = ?`
  ).bind(content.description, content.salary, job.id).run();

  return content.description;
}

tailor.get("/tailor/usage", async (c) => {
  const userId = c.get("userId");
  const model = normalizeWorkersAiModel(c.req.query("model") || c.env.WORKERS_AI_MODEL);

  const usage = await loadTailorUsage({
    db: c.env.DB,
    userId,
    model,
  }).catch(() => ({
    provider: "workers_ai" as const,
    model,
    app_today: 0,
    user_today: 0,
    included_user_today: 0,
    daily_limit: null,
    app_remaining: null,
    user_remaining: null,
    included_user_remaining: null,
    provider_units_today: 0,
    provider_units_limit: WORKERS_AI_DAILY_NEURON_LIMIT,
    provider_units_remaining: WORKERS_AI_DAILY_NEURON_LIMIT,
    resets_at: nextUtcDay(),
  }));

  return c.json({ usage });
});

tailor.get("/tailor/:job_id", async (c) => {
  const { job_id } = c.req.param();
  const userId = c.get("userId");
  const row = await getLatestUserTailoring(c.env.DB, userId, job_id);
  const latestArtifact = row
    ? await loadLatestArtifact(c.env.DB, userId, row.id)
    : null;

  return c.json({
    tailoring: row
      ? await normalizeTailoringForUser(c.env.DB, userId, row, latestArtifact)
      : null,
  });
});

tailor.post("/tailor/:job_id/plan", async (c) => {
  const startedAt = Date.now();
  if (c.get("sessionState") !== "authenticated") {
    return c.json({
      error: "Sign in to create a tailored resume.",
      code: "authentication_required",
    }, 401);
  }
  if (!c.env.AI) {
    return c.json({
      error: "Tailoring is temporarily unavailable. Your resume has not been changed.",
      code: "tailor_not_configured",
    }, 503);
  }
  const { job_id } = c.req.param();
  const job = await loadJobForTailor(c.env.DB, job_id);
  if (!job) return c.json({ error: "Job not found" }, 404);
  const description = await ensureJobDescription(c.env.DB, job);
  if (!description) {
    return c.json({ error: "The original job description is unavailable right now." }, 400);
  }
  const userId = c.get("userId");
  const { data: profile } = await getUserProfile(c.env.DB, userId);
  const evidence = buildCandidateEvidence(profile);
  if (!profile.contact.name || evidence.length === 0) {
    return c.json({
      error: "Add your contact details and at least one experience, project, skill, or education item first.",
      code: "resume_profile_required",
    }, 400);
  }
  const model = normalizeWorkersAiModel(c.env.WORKERS_AI_MODEL);
  const quota = await reserveAppTailorQuota(c.env.DB, userId, model);
  if (!quota.ok) {
    return c.json({
      error: "You've used today's included tailorings. Try again tomorrow.",
      code: "tailor_quota_exceeded",
      resets_at: quota.resets_at,
    }, 429);
  }
  const capturedAt = new Date().toISOString();
  const profileSnapshot = await createResumeProfileSnapshot(profile);
  const snapshot: JobSnapshot = {
    jobId: job.id,
    title: job.title,
    company: job.company_name,
    url: job.url,
    description,
    descriptionHash: await sha256Hex(description),
    capturedAt,
  };
  try {
    const result = await createTailoringPlan({
      ai: c.env.AI,
      model,
      description: snapshot.description,
      evidence,
    });
    const planIssues = validateTailoringPlan(snapshot.description, evidence, result.plan);
    if (planIssues.length > 0) {
      throw new Error("The role requirements could not be linked back to the saved job description.");
    }
    await completeAppTailorUsage({
      db: c.env.DB,
      usageId: quota.usageId,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      providerUnits: null,
    });
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO tailorings (
         id, user_id, job_id, status, job_snapshot_json, profile_snapshot_json,
         profile_hash, evidence_json,
         requirements_json, plan_json, input_tokens, output_tokens, model,
         template_version, compiler_version, usage_id, created_at, updated_at
       ) VALUES (?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      userId,
      job.id,
      JSON.stringify(snapshot),
      profileSnapshot.json,
      profileSnapshot.hash,
      JSON.stringify(evidence),
      JSON.stringify(result.plan.requirements),
      JSON.stringify(result.plan),
      result.usage.inputTokens || null,
      result.usage.outputTokens || null,
      model,
      RESUME_TEMPLATE_VERSION,
      RESUME_COMPILER_VERSION,
      quota.usageId,
      capturedAt,
      capturedAt,
    ).run();
    const row = await c.env.DB.prepare(
      "SELECT * FROM tailorings WHERE id = ? AND user_id = ?"
    ).bind(id, userId).first<TailoringRow>();
    if (!row) throw new Error("Could not load the structured tailoring draft.");
    await recordProductEvent(c.env.DB, {
      userId,
      sessionId: c.get("sessionId"),
      name: "tailoring_plan_created",
      entityType: "job",
      entityId: job.id,
      properties: { provider: "workers_ai", model, count: result.plan.requirements.length },
    }).catch(() => undefined);
    await recordTailoringQualityEvent(c.env.DB, {
      tailoringId: id,
      userId,
      jobId: job.id,
      stage: "plan",
      outcome: "succeeded",
      durationMs: Date.now() - startedAt,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      plan: result.plan,
    }).catch(() => undefined);
    return c.json({
      tailoring: await normalizeTailoringForUser(c.env.DB, userId, row),
    });
  } catch (error) {
    await failAppTailorUsage({
      db: c.env.DB,
      usageId: quota.usageId,
      stage: "plan",
      code: "tailoring_plan_failed",
      refundCredit: true,
    }).catch(() => undefined);
    await recordTailoringQualityEvent(c.env.DB, {
      userId,
      jobId: job.id,
      stage: "plan",
      outcome: "refunded",
      durationMs: Date.now() - startedAt,
      errorCode: "tailoring_plan_failed",
    }).catch(() => undefined);
    return c.json({
      error: error instanceof Error
        ? error.message
        : "The role could not be analyzed. Your resume has not been changed.",
      code: "tailoring_plan_failed",
    }, 502);
  }
});

tailor.post("/tailorings/:id/generate", async (c) => {
  const startedAt = Date.now();
  if (c.get("sessionState") !== "authenticated") {
    return c.json({ error: "Sign in to create a tailored resume." }, 401);
  }
  if (!c.env.AI) {
    return c.json({ error: "Tailoring is temporarily unavailable." }, 503);
  }
  const { id } = c.req.param();
  const userId = c.get("userId");
  const row = await c.env.DB.prepare(
    "SELECT * FROM tailorings WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first<TailoringRow>();
  if (!row) return c.json({ error: "Tailoring not found" }, 404);
  const profile = await loadResumeProfileSnapshot(
    row.profile_snapshot_json,
    row.profile_hash,
  );
  if (!profile) return c.json(FRESH_PLAN_REQUIRED, 409);
  const body = (await c.req.json<{
    selectedEvidenceIds?: string[];
    excludedEvidenceIds?: string[];
  }>().catch(() => null)) ?? {};
  const evidence = parseStoredJson<CandidateEvidence[]>(row.evidence_json, []);
  const snapshot = parseStoredJson<JobSnapshot | null>(row.job_snapshot_json, null);
  if (!snapshot) return c.json(FRESH_PLAN_REQUIRED, 409);
  const normalizedPlan = normalizeStoredTailoringPlan(snapshot.description, evidence, row.plan_json);
  if (!normalizedPlan.valid) return c.json(FRESH_PLAN_REQUIRED, 409);
  const storedPlan = normalizedPlan.plan;
  const availableIds = new Set(evidence.map((item) => item.id));
  const selectedEvidenceIds = Array.isArray(body.selectedEvidenceIds)
    ? [...new Set(body.selectedEvidenceIds.filter((value) => availableIds.has(value)))]
    : storedPlan.selectedEvidenceIds.filter((value) => availableIds.has(value));
  if (selectedEvidenceIds.length === 0) {
    return c.json({ error: "Select at least one piece of supporting evidence." }, 400);
  }
  const plan: TailoringPlan = {
    ...storedPlan,
    selectedEvidenceIds,
    excludedEvidenceIds: evidence.map((item) => item.id).filter((value) => !selectedEvidenceIds.includes(value)),
  };
  const model = normalizeWorkersAiModel(c.env.WORKERS_AI_MODEL);
  if (!row.usage_id) return c.json(FRESH_PLAN_REQUIRED, 409);
  const attempt = await reserveTailorProviderAttempt({
    db: c.env.DB,
    usageId: row.usage_id,
    model,
    userId,
    chargeCredit: true,
  });
  if (!attempt.ok) {
    return c.json({
      error: "Tailoring is at its daily capacity. Try again tomorrow.",
      code: "tailor_quota_exceeded",
      resets_at: attempt.resets_at,
    }, 429);
  }
  try {
    const result = await generateStructuredResume({
      ai: c.env.AI,
      model,
      profile,
      description: snapshot.description,
      evidence,
      selectedEvidenceIds,
    });
    const now = new Date().toISOString();
    const inputTokens = (row.input_tokens ?? 0) + result.usage.inputTokens;
    const outputTokens = (row.output_tokens ?? 0) + result.usage.outputTokens;
    if (result.validation.valid) {
      await completeAppTailorUsage({
        db: c.env.DB,
        usageId: row.usage_id,
        inputTokens,
        outputTokens,
        providerUnits: null,
      });
    } else {
      await failAppTailorUsage({
        db: c.env.DB,
        usageId: row.usage_id,
        stage: "generate",
        code: "tailoring_validation_failed",
        refundCredit: true,
      });
    }
    const status = result.validation.valid ? "generated" : "failed";
    await c.env.DB.prepare(
      `UPDATE tailorings
       SET status = ?, plan_json = ?, resume_draft_json = ?, validation_json = ?,
           initial_resume_json = COALESCE(initial_resume_json, ?),
           input_tokens = ?, output_tokens = ?, model = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).bind(
      status,
      JSON.stringify(plan),
      JSON.stringify(result.resume),
      JSON.stringify(result.validation),
      JSON.stringify(result.resume),
      inputTokens || null,
      outputTokens || null,
      model,
      now,
      id,
      userId,
    ).run();
    const updated = await c.env.DB.prepare(
      "SELECT * FROM tailorings WHERE id = ? AND user_id = ?"
    ).bind(id, userId).first<TailoringRow>();
    if (!updated) return c.json({ error: "Tailoring not found" }, 404);
    await recordTailoringQualityEvent(c.env.DB, {
      tailoringId: id,
      userId,
      jobId: row.job_id,
      stage: "generate",
      outcome: result.validation.valid ? "succeeded" : "refunded",
      durationMs: Date.now() - startedAt,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      repaired: result.repaired,
      plan,
      resume: result.resume,
      baselineResume: result.resume,
      validation: result.validation,
      errorCode: result.validation.valid ? null : "tailoring_validation_failed",
    }).catch(() => undefined);
    if (!result.validation.valid) {
      return c.json({
        error: "We couldn't verify every generated claim. Review the flagged evidence and try again.",
        code: "tailoring_validation_failed",
        tailoring: await normalizeTailoringForUser(c.env.DB, userId, updated),
      }, 422);
    }
    await recordProductEvent(c.env.DB, {
      userId,
      sessionId: c.get("sessionId"),
      name: "tailoring_completed",
      entityType: "job",
      entityId: row.job_id,
      properties: { provider: "workers_ai", model },
    }).catch(() => undefined);
    return c.json({
      tailoring: await normalizeTailoringForUser(c.env.DB, userId, updated),
    });
  } catch (error) {
    await failAppTailorUsage({
      db: c.env.DB,
      usageId: row.usage_id,
      stage: "generate",
      code: "tailoring_generation_failed",
      refundCredit: true,
    }).catch(() => undefined);
    await recordTailoringQualityEvent(c.env.DB, {
      tailoringId: id,
      userId,
      jobId: row.job_id,
      stage: "generate",
      outcome: "refunded",
      durationMs: Date.now() - startedAt,
      errorCode: "tailoring_generation_failed",
    }).catch(() => undefined);
    return c.json({
      error: error instanceof Error
        ? error.message
        : "The resume could not be generated. Your saved profile has not been changed.",
      code: "tailoring_generation_failed",
    }, 502);
  }
});

tailor.post("/tailorings/:id/regenerate", async (c) => {
  const startedAt = Date.now();
  if (c.get("sessionState") !== "authenticated") {
    return c.json({ error: "Sign in to update a tailored resume." }, 401);
  }
  if (!c.env.AI) {
    return c.json({ error: "Tailoring is temporarily unavailable." }, 503);
  }
  const { id } = c.req.param();
  const userId = c.get("userId");
  const row = await c.env.DB.prepare(
    "SELECT * FROM tailorings WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first<TailoringRow>();
  if (!row) return c.json({ error: "Tailoring not found" }, 404);
  const profile = await loadResumeProfileSnapshot(row.profile_snapshot_json, row.profile_hash);
  if (!profile || !row.usage_id) return c.json(FRESH_PLAN_REQUIRED, 409);
  const snapshot = parseStoredJson<JobSnapshot | null>(row.job_snapshot_json, null);
  const evidence = parseStoredJson<CandidateEvidence[]>(row.evidence_json, []);
  if (!snapshot) return c.json(FRESH_PLAN_REQUIRED, 409);
  const normalizedPlan = normalizeStoredTailoringPlan(snapshot.description, evidence, row.plan_json);
  if (!normalizedPlan.valid) return c.json(FRESH_PLAN_REQUIRED, 409);
  const resume = parseStoredJson<TailoredResume | null>(row.resume_draft_json, null);
  if (!resume) return c.json({ error: "Generate a resume before rewriting a bullet." }, 409);

  const body = await c.req.json<{
    section?: unknown;
    sourceEntryId?: unknown;
    bulletId?: unknown;
    instruction?: unknown;
  }>().catch(() => null);
  const section = body?.section === "experience" || body?.section === "projects"
    ? body.section
    : null;
  const sourceEntryId = typeof body?.sourceEntryId === "string" ? body.sourceEntryId.trim() : "";
  const bulletId = typeof body?.bulletId === "string" ? body.bulletId.trim() : "";
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim().slice(0, 300) : undefined;
  if (!section || !sourceEntryId || !bulletId) {
    return c.json({ error: "Choose a resume bullet to rewrite." }, 400);
  }
  const entry = resume[section].find((candidate) => candidate.sourceEntryId === sourceEntryId);
  const bullet = entry?.bullets.find((candidate) => candidate.id === bulletId);
  if (!entry || !bullet) return c.json({ error: "That resume bullet no longer exists." }, 404);
  if (bullet.locked) return c.json({ error: "Unlock this bullet before regenerating it." }, 409);
  if (bullet.evidenceIds.length === 0) {
    return c.json({ error: "This bullet has no saved evidence to regenerate from." }, 422);
  }

  const model = normalizeWorkersAiModel(c.env.WORKERS_AI_MODEL);
  const attempt = await reserveTailorProviderAttempt({
    db: c.env.DB,
    usageId: row.usage_id,
    model,
    userId,
    chargeCredit: false,
  });
  if (!attempt.ok) {
    return c.json({
      error: "Tailoring is at its daily capacity. Try again tomorrow.",
      code: "tailor_quota_exceeded",
      resets_at: attempt.resets_at,
    }, 429);
  }

  try {
    const result = await regenerateStructuredBullet({
      ai: c.env.AI,
      model,
      profile,
      description: snapshot.description,
      evidence,
      resume,
      section,
      sourceEntryId,
      bulletId,
      instruction,
    });
    const inputTokens = (row.input_tokens ?? 0) + result.usage.inputTokens;
    const outputTokens = (row.output_tokens ?? 0) + result.usage.outputTokens;
    if (result.validation.valid) {
      await completeAppTailorUsage({
        db: c.env.DB,
        usageId: row.usage_id,
        inputTokens,
        outputTokens,
        providerUnits: null,
        preserveRefunded: true,
      });
    } else {
      await failAppTailorUsage({
        db: c.env.DB,
        usageId: row.usage_id,
        stage: "regenerate",
        code: "tailoring_validation_failed",
        refundCredit: false,
      });
    }
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE tailorings
       SET status = ?, resume_draft_json = ?, validation_json = ?,
           input_tokens = ?, output_tokens = ?, model = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).bind(
      result.validation.valid ? "generated" : "failed",
      JSON.stringify(result.resume),
      JSON.stringify(result.validation),
      inputTokens || null,
      outputTokens || null,
      model,
      now,
      id,
      userId,
    ).run();
    const updated = await c.env.DB.prepare(
      "SELECT * FROM tailorings WHERE id = ? AND user_id = ?"
    ).bind(id, userId).first<TailoringRow>();
    if (!updated) return c.json({ error: "Tailoring not found" }, 404);
    await recordTailoringQualityEvent(c.env.DB, {
      tailoringId: id,
      userId,
      jobId: row.job_id,
      stage: "regenerate",
      outcome: result.validation.valid ? "succeeded" : "rejected",
      durationMs: Date.now() - startedAt,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      repaired: result.repaired,
      plan: normalizedPlan.plan,
      resume: result.resume,
      baselineResume: parseStoredJson<TailoredResume | null>(row.initial_resume_json, null),
      validation: result.validation,
      errorCode: result.validation.valid ? null : "tailoring_validation_failed",
    }).catch(() => undefined);
    if (!result.validation.valid) {
      return c.json({
        error: "We couldn't verify that rewrite. Your previous bullet is still available in PDF history.",
        code: "tailoring_validation_failed",
        tailoring: await normalizeTailoringForUser(c.env.DB, userId, updated),
      }, 422);
    }
    return c.json({
      tailoring: await normalizeTailoringForUser(c.env.DB, userId, updated),
    });
  } catch (error) {
    await failAppTailorUsage({
      db: c.env.DB,
      usageId: row.usage_id,
      stage: "regenerate",
      code: "tailoring_regeneration_failed",
      refundCredit: false,
    }).catch(() => undefined);
    await recordTailoringQualityEvent(c.env.DB, {
      tailoringId: id,
      userId,
      jobId: row.job_id,
      stage: "regenerate",
      outcome: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: "tailoring_regeneration_failed",
    }).catch(() => undefined);
    return c.json({
      error: error instanceof Error ? error.message : "That bullet could not be rewritten.",
      code: "tailoring_regeneration_failed",
    }, 502);
  }
});

tailor.patch("/tailorings/:id", async (c) => {
  const { id } = c.req.param();
  const userId = c.get("userId");
  const existing = await c.env.DB.prepare(
    "SELECT * FROM tailorings WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first<TailoringRow>();
  if (!existing) return c.json({ error: "Tailoring not found" }, 404);
  const profile = await loadResumeProfileSnapshot(
    existing.profile_snapshot_json,
    existing.profile_hash,
  );
  if (!profile) return c.json(FRESH_PLAN_REQUIRED, 409);
  const body =
    (await c.req
      .json<{
        resume_draft?: TailoredResume;
        selectedEvidenceIds?: string[];
      }>()
      .catch(() => null)) ?? {};
  if (!body.resume_draft) return c.json({ error: "No structured draft to update" }, 400);
  const serialized = JSON.stringify(body.resume_draft);
  if (serialized.length > 300_000) return c.json({ error: "Resume draft is too large" }, 413);
  const evidence = parseStoredJson<CandidateEvidence[]>(existing.evidence_json, []);
  const snapshot = parseStoredJson<JobSnapshot | null>(existing.job_snapshot_json, null);
  if (!snapshot) return c.json(FRESH_PLAN_REQUIRED, 409);
  const normalizedPlan = normalizeStoredTailoringPlan(snapshot.description, evidence, existing.plan_json);
  if (!normalizedPlan.valid) return c.json(FRESH_PLAN_REQUIRED, 409);
  const storedPlan = normalizedPlan.plan;
  const availableIds = new Set(evidence.map((item) => item.id));
  const selectedEvidenceIds = Array.isArray(body.selectedEvidenceIds)
    ? [...new Set(body.selectedEvidenceIds.filter((evidenceId) => availableIds.has(evidenceId)))]
    : storedPlan.selectedEvidenceIds.filter((evidenceId) => availableIds.has(evidenceId));
  const plan: TailoringPlan = {
    ...storedPlan,
    selectedEvidenceIds,
    excludedEvidenceIds: evidence
      .map((item) => item.id)
      .filter((evidenceId) => !selectedEvidenceIds.includes(evidenceId)),
  };
  const validation = validateTailoredResume(profile, evidence, body.resume_draft);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE tailorings
     SET resume_draft_json = ?, validation_json = ?, plan_json = ?, status = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).bind(
    serialized,
    JSON.stringify(validation),
    JSON.stringify(plan),
    validation.valid ? "generated" : "failed",
    now,
    id,
    userId,
  ).run();
  const updated = await c.env.DB.prepare(
    "SELECT * FROM tailorings WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first<TailoringRow>();
  if (!updated) return c.json({ error: "Tailoring not found" }, 404);
  await recordTailoringQualityEvent(c.env.DB, {
    tailoringId: id,
    userId,
    jobId: existing.job_id,
    stage: "edit",
    outcome: validation.valid ? "succeeded" : "rejected",
    plan,
    resume: body.resume_draft,
    baselineResume: parseStoredJson<TailoredResume | null>(existing.initial_resume_json, null),
    validation,
    errorCode: validation.valid ? null : "tailoring_validation_failed",
  }).catch(() => undefined);
  return c.json({
    tailoring: await normalizeTailoringForUser(c.env.DB, userId, updated),
  });
});

// Device-side preview/compile telemetry contains only bounded counters and a
// stable error code—never resume text, job-description text, or filenames.
tailor.post("/tailorings/:id/quality", async (c) => {
  if (c.get("sessionState") !== "authenticated") {
    return c.json({ error: "Sign in to record tailoring quality." }, 401);
  }
  const { id } = c.req.param();
  const userId = c.get("userId");
  const row = await c.env.DB.prepare(
    "SELECT job_id FROM tailorings WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first<{ job_id: string }>();
  if (!row) return c.json({ error: "Tailoring not found" }, 404);
  const body = await c.req.json<{
    stage?: unknown;
    outcome?: unknown;
    durationMs?: unknown;
    pageCount?: unknown;
    errorCode?: unknown;
  }>().catch(() => null);
  const stage = body?.stage === "preview" || body?.stage === "compile" ? body.stage : null;
  const outcome = body?.outcome === "succeeded" || body?.outcome === "failed" ? body.outcome : null;
  if (!stage || !outcome) return c.json({ error: "Invalid quality event." }, 400);
  const durationMs = typeof body?.durationMs === "number" && Number.isFinite(body.durationMs)
    ? Math.max(0, Math.min(120_000, Math.round(body.durationMs)))
    : null;
  const pageCount = typeof body?.pageCount === "number" && Number.isSafeInteger(body.pageCount)
    ? Math.max(1, Math.min(10, body.pageCount))
    : null;
  await recordTailoringQualityEvent(c.env.DB, {
    tailoringId: id,
    userId,
    jobId: row.job_id,
    stage,
    outcome,
    durationMs,
    pageCount,
    errorCode: typeof body?.errorCode === "string" ? body.errorCode : null,
  });
  return c.body(null, 204);
});

async function loadOwnedArtifact(
  db: D1Database,
  userId: string,
  tailoringId: string,
  artifactId: string,
): Promise<StoredArtifactRow | null> {
  return db.prepare(
    `SELECT a.*, CASE WHEN s.artifact_id IS NULL THEN 0 ELSE 1 END AS selected
     FROM tailored_resume_artifacts a
     LEFT JOIN tailoring_artifact_selections s ON s.artifact_id = a.id
     WHERE a.id = ? AND a.tailoring_id = ? AND a.user_id = ?`
  ).bind(artifactId, tailoringId, userId).first<StoredArtifactRow>();
}

async function readVerifiedArtifactPdf(
  db: D1Database,
  bucket: R2Bucket,
  artifact: StoredArtifactRow,
): Promise<Uint8Array | null> {
  if (artifact.storage_state !== "available") return null;
  const object = await bucket.get(artifact.pdf_storage_key);
  if (!object) {
    await db.prepare(
      "UPDATE tailored_resume_artifacts SET storage_state = 'missing' WHERE id = ?"
    ).bind(artifact.id).run();
    return null;
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (
    bytes.byteLength === 0
    || bytes.byteLength > 5 * 1024 * 1024
    || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  ) {
    await db.prepare(
      "UPDATE tailored_resume_artifacts SET storage_state = 'corrupt' WHERE id = ?"
    ).bind(artifact.id).run();
    return null;
  }
  const actualHash = await sha256Hex(bytes);
  if (artifact.pdf_sha256 && artifact.pdf_sha256 !== actualHash) {
    await db.prepare(
      "UPDATE tailored_resume_artifacts SET storage_state = 'corrupt' WHERE id = ?"
    ).bind(artifact.id).run();
    return null;
  }
  if (!artifact.pdf_sha256 || artifact.pdf_byte_size == null) {
    await db.prepare(
      `UPDATE tailored_resume_artifacts
       SET pdf_sha256 = ?, pdf_byte_size = ?
       WHERE id = ? AND user_id = ?`
    ).bind(actualHash, bytes.byteLength, artifact.id, artifact.user_id).run();
  }
  return bytes;
}

tailor.get("/tailorings/:id/artifacts", async (c) => {
  if (c.get("sessionState") !== "authenticated") {
    return c.json({ error: "Sign in to view exported resumes." }, 401);
  }
  const { id } = c.req.param();
  const userId = c.get("userId");
  const owned = await c.env.DB.prepare(
    "SELECT id FROM tailorings WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first<{ id: string }>();
  if (!owned) return c.json({ error: "Tailoring not found" }, 404);
  const rows = await c.env.DB.prepare(
    `SELECT a.*, CASE WHEN s.artifact_id IS NULL THEN 0 ELSE 1 END AS selected
     FROM tailored_resume_artifacts a
     LEFT JOIN tailoring_artifact_selections s ON s.artifact_id = a.id
     WHERE a.tailoring_id = ? AND a.user_id = ? AND a.storage_state <> 'deleting'
     ORDER BY a.revision DESC`
  ).bind(id, userId).all<StoredArtifactRow>();
  return c.json({ artifacts: (rows.results ?? []).map(artifactResponse) });
});

tailor.get("/tailorings/:id/artifacts/:artifact_id", async (c) => {
  if (c.get("sessionState") !== "authenticated") {
    return c.json({ error: "Sign in to download exported resumes." }, 401);
  }
  if (!c.env.RESUME_BUCKET) {
    return c.json({ error: "Resume export storage is temporarily unavailable." }, 503);
  }
  const { id, artifact_id } = c.req.param();
  const userId = c.get("userId");
  const artifact = await loadOwnedArtifact(c.env.DB, userId, id, artifact_id);
  if (!artifact) return c.json({ error: "PDF version not found" }, 404);
  const bytes = await readVerifiedArtifactPdf(c.env.DB, c.env.RESUME_BUCKET, artifact);
  if (!bytes) {
    return c.json({
      error: "This PDF is no longer available. Delete the version and export it again.",
      code: "artifact_unavailable",
    }, 410);
  }
  return new Response(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="tailored-resume-v${artifact.revision}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-length": String(bytes.byteLength),
    },
  });
});

tailor.post("/tailorings/:id/artifacts/:artifact_id/select", async (c) => {
  if (c.get("sessionState") !== "authenticated") {
    return c.json({ error: "Sign in to select an exported resume." }, 401);
  }
  if (!c.env.RESUME_BUCKET) {
    return c.json({ error: "Resume export storage is temporarily unavailable." }, 503);
  }
  const { id, artifact_id } = c.req.param();
  const userId = c.get("userId");
  const artifact = await loadOwnedArtifact(c.env.DB, userId, id, artifact_id);
  if (!artifact) return c.json({ error: "PDF version not found" }, 404);
  const bytes = await readVerifiedArtifactPdf(c.env.DB, c.env.RESUME_BUCKET, artifact);
  if (!bytes || artifact.page_count == null || !artifact.resume_sha256) {
    return c.json({
      error: "This PDF could not pass its integrity check. Export a new version before selecting it.",
      code: "artifact_integrity_failed",
    }, 409);
  }
  const selectedAt = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO tailoring_artifact_selections (tailoring_id, user_id, artifact_id, selected_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(tailoring_id) DO UPDATE SET
       user_id = excluded.user_id,
       artifact_id = excluded.artifact_id,
       selected_at = excluded.selected_at`
  ).bind(id, userId, artifact_id, selectedAt).run();
  await recordTailoringQualityEvent(c.env.DB, {
    tailoringId: id,
    userId,
    jobId: (await c.env.DB.prepare("SELECT job_id FROM tailorings WHERE id = ?").bind(id).first<{ job_id: string }>())?.job_id ?? "",
    stage: "artifact",
    outcome: "succeeded",
    pageCount: artifact.page_count,
    errorCode: "selected",
    compilerOrigin: artifact.compiler_origin,
    verificationStatus: artifact.verification_status,
  }).catch(() => undefined);
  return c.json({ artifact: artifactResponse({ ...artifact, selected: 1 }) });
});

tailor.delete("/tailorings/:id/artifacts/:artifact_id", async (c) => {
  if (c.get("sessionState") !== "authenticated") {
    return c.json({ error: "Sign in to delete exported resumes." }, 401);
  }
  if (!c.env.RESUME_BUCKET) {
    return c.json({ error: "Resume export storage is temporarily unavailable." }, 503);
  }
  const { id, artifact_id } = c.req.param();
  const userId = c.get("userId");
  const artifact = await loadOwnedArtifact(c.env.DB, userId, id, artifact_id);
  if (!artifact) return c.json({ error: "PDF version not found" }, 404);
  const requestedAt = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE tailored_resume_artifacts
     SET storage_state = 'deleting', delete_requested_at = ?
     WHERE id = ? AND tailoring_id = ? AND user_id = ?`
  ).bind(requestedAt, artifact_id, id, userId).run();
  try {
    await c.env.RESUME_BUCKET.delete(artifact.pdf_storage_key);
  } catch {
    await restoreArtifactDeletionState({
      db: c.env.DB,
      userId,
      tailoringId: id,
      artifactId: artifact_id,
    }).catch(() => undefined);
    return c.json({
      error: "This PDF could not be deleted right now. Try again.",
      code: "artifact_delete_failed",
    }, 503);
  }
  await c.env.DB.prepare(
    "DELETE FROM tailored_resume_artifacts WHERE id = ? AND tailoring_id = ? AND user_id = ?"
  ).bind(artifact_id, id, userId).run();
  return c.json({ ok: true as const });
});

tailor.delete("/tailorings/:id/artifacts", async (c) => {
  if (c.get("sessionState") !== "authenticated") {
    return c.json({ error: "Sign in to delete exported resumes." }, 401);
  }
  if (!c.env.RESUME_BUCKET) {
    return c.json({ error: "Resume export storage is temporarily unavailable." }, 503);
  }
  const { id } = c.req.param();
  const userId = c.get("userId");
  const owned = await c.env.DB.prepare(
    "SELECT id FROM tailorings WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first<{ id: string }>();
  if (!owned) return c.json({ error: "Tailoring not found" }, 404);
  const rows = await c.env.DB.prepare(
    `SELECT pdf_storage_key FROM tailored_resume_artifacts
     WHERE tailoring_id = ? AND user_id = ?`
  ).bind(id, userId).all<{ pdf_storage_key: string }>();
  const artifacts = rows.results ?? [];
  if (artifacts.length === 0) return c.json({ ok: true as const, deleted: 0 });
  const requestedAt = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE tailored_resume_artifacts
     SET storage_state = 'deleting', delete_requested_at = ?
     WHERE tailoring_id = ? AND user_id = ?`
  ).bind(requestedAt, id, userId).run();
  try {
    await deleteR2Keys(c.env.RESUME_BUCKET, artifacts.map((artifact) => artifact.pdf_storage_key));
  } catch {
    await restoreArtifactDeletionState({
      db: c.env.DB,
      userId,
      tailoringId: id,
    }).catch(() => undefined);
    return c.json({
      error: "Your PDFs could not all be deleted right now. Try again.",
      code: "artifact_delete_failed",
    }, 503);
  }
  await c.env.DB.prepare(
    "DELETE FROM tailored_resume_artifacts WHERE tailoring_id = ? AND user_id = ?"
  ).bind(id, userId).run();
  return c.json({ ok: true as const, deleted: artifacts.length });
});

tailor.post("/tailorings/:id/artifacts", async (c) => {
  const startedAt = Date.now();
  if (c.get("sessionState") !== "authenticated") {
    return c.json({ error: "Sign in to export a resume." }, 401);
  }
  if (!c.env.RESUME_BUCKET) {
    return c.json({ error: "Resume export storage is temporarily unavailable." }, 503);
  }
  const { id } = c.req.param();
  const userId = c.get("userId");
  const row = await c.env.DB.prepare(
    "SELECT * FROM tailorings WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first<TailoringRow>();
  if (!row) return c.json({ error: "Tailoring not found" }, 404);
  const profile = await loadResumeProfileSnapshot(
    row.profile_snapshot_json,
    row.profile_hash,
  );
  if (!profile) return c.json(FRESH_PLAN_REQUIRED, 409);
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "The generated PDF could not be read." }, 400);
  }
  const pdf = form.get("pdf");
  const resumeJson = form.get("resume_json");
  const validationJson = form.get("validation_json");
  const typstSource = form.get("typst_source");
  const templateVersion = form.get("template_version");
  const compilerVersion = form.get("compiler_version");
  const pageCountValue = form.get("page_count");
  const declaredPdfSha256 = form.get("pdf_sha256");
  const declaredResumeSha256 = form.get("resume_sha256");
  const extractedTextSha256Value = form.get("extracted_text_sha256");
  if (
    !(pdf instanceof File)
    || typeof resumeJson !== "string"
    || typeof validationJson !== "string"
    || typeof typstSource !== "string"
    || typeof templateVersion !== "string"
    || typeof compilerVersion !== "string"
    || typeof pageCountValue !== "string"
  ) {
    return c.json({ error: "The export is missing required resume data." }, 400);
  }
  const pageCount = Number(pageCountValue);
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 10) {
    return c.json({ error: "The export has an invalid page count." }, 400);
  }
  if (
    declaredPdfSha256 != null
    && (typeof declaredPdfSha256 !== "string" || !validSha256(declaredPdfSha256))
  ) {
    return c.json({ error: "The PDF integrity value is invalid." }, 400);
  }
  if (
    declaredResumeSha256 != null
    && (typeof declaredResumeSha256 !== "string" || !validSha256(declaredResumeSha256))
  ) {
    return c.json({ error: "The resume integrity value is invalid." }, 400);
  }
  const extractedTextSha256 = typeof extractedTextSha256Value === "string" && validSha256(extractedTextSha256Value)
    ? extractedTextSha256Value.toLowerCase()
    : null;
  if (
    pdf.size > 5 * 1024 * 1024
    || resumeJson.length > 300_000
    || validationJson.length > 100_000
    || typstSource.length > 300_000
  ) {
    return c.json({ error: "The generated resume is too large to save." }, 413);
  }
  const usesRecordedVersions = templateVersion === row.template_version
    && compilerVersion === row.compiler_version;
  const usesCurrentVersions = templateVersion === RESUME_TEMPLATE_VERSION
    && compilerVersion === RESUME_COMPILER_VERSION;
  if (!usesRecordedVersions && !usesCurrentVersions) {
    return c.json({
      error: "This resume was built with an outdated template. Build the preview again.",
      code: "tailoring_version_mismatch",
    }, 409);
  }
  const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
  const signature = pdfBytes.slice(0, 5);
  if (new TextDecoder().decode(signature) !== "%PDF-") {
    return c.json({ error: "The generated file is not a valid PDF." }, 400);
  }
  let resume: TailoredResume;
  let clientValidation: TailoringValidation;
  try {
    resume = JSON.parse(resumeJson) as TailoredResume;
    clientValidation = JSON.parse(validationJson) as TailoringValidation;
  } catch {
    return c.json({ error: "The structured resume data is invalid." }, 400);
  }
  const evidence = parseStoredJson<CandidateEvidence[]>(row.evidence_json, []);
  const validation = validateTailoredResume(profile, evidence, resume);
  if (!validation.valid || !clientValidation.valid) {
    await recordTailoringQualityEvent(c.env.DB, {
      tailoringId: id,
      userId,
      jobId: row.job_id,
      stage: "artifact",
      outcome: "failed",
      durationMs: Date.now() - startedAt,
      resume,
      baselineResume: parseStoredJson<TailoredResume | null>(row.initial_resume_json, null),
      validation,
      pageCount,
      errorCode: "tailoring_validation_failed",
    }).catch(() => undefined);
    return c.json({
      error: "Resolve the evidence warnings before downloading this resume.",
      code: "tailoring_validation_failed",
      validation,
    }, 422);
  }
  const pdfSha256 = await sha256Hex(pdfBytes);
  const resumeSha256 = await sha256Hex(resumeJson);
  const typstSha256 = await sha256Hex(typstSource);
  if (
    (typeof declaredPdfSha256 === "string" && declaredPdfSha256.toLowerCase() !== pdfSha256)
    || (typeof declaredResumeSha256 === "string" && declaredResumeSha256.toLowerCase() !== resumeSha256)
  ) {
    await recordTailoringQualityEvent(c.env.DB, {
      tailoringId: id,
      userId,
      jobId: row.job_id,
      stage: "artifact",
      outcome: "failed",
      durationMs: Date.now() - startedAt,
      resume,
      baselineResume: parseStoredJson<TailoredResume | null>(row.initial_resume_json, null),
      validation,
      pageCount,
      errorCode: "artifact_hash_mismatch",
    }).catch(() => undefined);
    return c.json({
      error: "The generated resume changed during export. Build the preview again.",
      code: "artifact_hash_mismatch",
    }, 409);
  }

  let compilerOrigin: "client" | "service" = "client";
  let verificationStatus: StoredArtifactRow["verification_status"] = "client_only";
  if (c.env.RESUME_COMPILER) {
    try {
      const compiled = await compileResumeWithService(c.env.RESUME_COMPILER, {
        source: typstSource,
        templateVersion,
        compilerVersion,
        resumeSha256,
        expectedPdfSha256: pdfSha256,
        expectedExtractedTextSha256: extractedTextSha256,
      });
      if (compiled.pageCount != null && compiled.pageCount !== pageCount) {
        throw new ResumeCompilerIntegrityError(
          "compiler_page_count_mismatch",
          "The isolated compiler returned a different page count.",
        );
      }
      compilerOrigin = compiled.verification === "server_reproduced" ? "service" : "client";
      verificationStatus = compiled.verification;
    } catch (error) {
      const code = tailoringFailureCode(error, "compiler_unavailable");
      await recordTailoringQualityEvent(c.env.DB, {
        tailoringId: id,
        userId,
        jobId: row.job_id,
        stage: "artifact",
        outcome: "failed",
        durationMs: Date.now() - startedAt,
        resume,
        baselineResume: parseStoredJson<TailoredResume | null>(row.initial_resume_json, null),
        validation,
        pageCount,
        errorCode: code,
        compilerOrigin: "service",
      }).catch(() => undefined);
      return c.json({
        error: error instanceof Error ? error.message : "The resume could not be verified by the isolated compiler.",
        code,
      }, error instanceof ResumeCompilerIntegrityError ? 422 : 503);
    }
  }
  const latest = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(revision), 0) AS revision
     FROM tailored_resume_artifacts WHERE tailoring_id = ? AND user_id = ?`
  ).bind(id, userId).first<{ revision: number }>();
  const revision = (latest?.revision ?? 0) + 1;
  const artifactId = crypto.randomUUID();
  const key = `tailored/${userId}/${id}/${artifactId}.pdf`;
  const createdAt = new Date().toISOString();
  const provenanceSha256 = await artifactProvenanceHash({
    tailoringId: id,
    revision,
    resumeSha256,
    typstSha256,
    pdfSha256,
    templateVersion,
    compilerVersion,
    pageCount,
  });
  try {
    await c.env.RESUME_BUCKET.put(key, pdfBytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: {
        tailoringId: id,
        artifactId,
        revision: String(revision),
        pdfSha256,
        provenanceSha256,
      },
    });
    await insertArtifactMetadata({
      db: c.env.DB,
      id: artifactId,
      tailoringId: id,
      userId,
      revision,
      resumeJson,
      validationJson: JSON.stringify(validation),
      typstSource,
      templateVersion,
      compilerVersion,
      pdfStorageKey: key,
      pageCount,
      pdfSha256,
      resumeSha256,
      typstSha256,
      provenanceSha256,
      extractedTextSha256,
      pdfByteSize: pdfBytes.byteLength,
      compilerOrigin,
      verificationStatus,
      createdAt,
    });
  } catch (error) {
    await c.env.RESUME_BUCKET.delete(key).catch(() => undefined);
    await recordTailoringQualityEvent(c.env.DB, {
      tailoringId: id,
      userId,
      jobId: row.job_id,
      stage: "artifact",
      outcome: "failed",
      durationMs: Date.now() - startedAt,
      resume,
      baselineResume: parseStoredJson<TailoredResume | null>(row.initial_resume_json, null),
      validation,
      pageCount,
      errorCode: "artifact_storage_failed",
      compilerOrigin,
      verificationStatus,
    }).catch(() => undefined);
    return c.json({
      error: "The PDF could not be saved. Try exporting it again.",
      code: "artifact_storage_failed",
    }, 503);
  }
  const storedArtifact: TailoringArtifact = {
    id: artifactId,
    tailoringId: id,
    revision,
    templateVersion,
    compilerVersion,
    createdAt,
    pageCount,
    pdfSha256,
    resumeSha256,
    selected: false,
    storageState: "stored",
    retentionPolicy: "until_deleted",
    verification: verificationStatus,
  };
  await recordTailoringQualityEvent(c.env.DB, {
    tailoringId: id,
    userId,
    jobId: row.job_id,
    stage: "artifact",
    outcome: "succeeded",
    durationMs: Date.now() - startedAt,
    resume,
    baselineResume: parseStoredJson<TailoredResume | null>(row.initial_resume_json, null),
    validation,
    pageCount,
    compilerOrigin,
    verificationStatus,
  }).catch(() => undefined);
  return c.json({
    artifact: storedArtifact,
  });
});

export default tailor;
