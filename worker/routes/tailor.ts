import { Hono } from "hono";
import { getAdapter } from "../ats";
import {
  buildCandidateEvidence,
  RESUME_COMPILER_VERSION,
  RESUME_TEMPLATE_VERSION,
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
} from "../tailor/structured";
import { getLatestUserTailoring, getUserProfile } from "../account";
import { recordProductEvent } from "../product-events";
import { ensureEligibleJobs } from "../job-scope";
import {
  WORKERS_AI_DAILY_NEURON_LIMIT,
  completeAppTailorUsage,
  loadTailorUsage,
  nextUtcDay,
  reserveAppTailorQuota,
} from "../tailor/usage";
import {
  normalizeWorkersAiModel,
} from "../tailor/config";
import {
  createResumeProfileSnapshot,
  loadResumeProfileSnapshot,
  resumeProfileHasChanged,
} from "../tailor/profile-snapshot";
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
    plan: parseStoredJson<TailoringPlan>(row.plan_json, {
      schemaVersion: 2,
      requirements: [],
      matches: [],
      gaps: [],
      selectedEvidenceIds: [],
      excludedEvidenceIds: [],
    }),
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
    `SELECT id, tailoring_id, revision, template_version, compiler_version, created_at
     FROM tailored_resume_artifacts
     WHERE tailoring_id = ? AND user_id = ?
     ORDER BY revision DESC
     LIMIT 1`,
  ).bind(tailoringId, userId).first<{
    id: string;
    tailoring_id: string;
    revision: number;
    template_version: string;
    compiler_version: string;
    created_at: string;
  }>();
  return artifact
    ? {
        id: artifact.id,
        tailoringId: artifact.tailoring_id,
        revision: artifact.revision,
        templateVersion: artifact.template_version,
        compilerVersion: artifact.compiler_version,
        createdAt: artifact.created_at,
      }
    : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
  const { data: currentProfile } = await getUserProfile(db, userId);
  return normalizeTailoring(row, latestArtifact, {
    sourceProfileChanged: await resumeProfileHasChanged(currentProfile, row.profile_hash),
    requiresFreshPlan: false,
  });
}

const FRESH_PLAN_REQUIRED = {
  error: "This tailoring needs a fresh plan. Start over to use your current resume.",
  code: "tailoring_refresh_required",
} as const;

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
    descriptionHash: await sha256(description),
    capturedAt,
  };
  try {
    const result = await createTailoringPlan({
      ai: c.env.AI,
      model,
      description: snapshot.description,
      evidence,
    });
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
    return c.json({
      tailoring: await normalizeTailoringForUser(c.env.DB, userId, row),
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error
        ? error.message
        : "The role could not be analyzed. Your resume has not been changed.",
      code: "tailoring_plan_failed",
    }, 502);
  }
});

tailor.post("/tailorings/:id/generate", async (c) => {
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
  const storedPlan = parseStoredJson<TailoringPlan>(row.plan_json, {
    schemaVersion: 2,
    requirements: [],
    matches: [],
    gaps: [],
    selectedEvidenceIds: [],
    excludedEvidenceIds: [],
  });
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
  const snapshot = parseStoredJson<JobSnapshot | null>(row.job_snapshot_json, null);
  if (!snapshot) return c.json({ error: "The saved job snapshot is missing." }, 409);
  const model = normalizeWorkersAiModel(c.env.WORKERS_AI_MODEL);
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
    if (row.usage_id) {
      await completeAppTailorUsage({
        db: c.env.DB,
        usageId: row.usage_id,
        inputTokens,
        outputTokens,
        providerUnits: null,
      });
    }
    const status = result.validation.valid ? "generated" : "failed";
    await c.env.DB.prepare(
      `UPDATE tailorings
       SET status = ?, plan_json = ?, resume_draft_json = ?, validation_json = ?,
           input_tokens = ?, output_tokens = ?, model = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).bind(
      status,
      JSON.stringify(plan),
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
    return c.json({
      error: error instanceof Error
        ? error.message
        : "The resume could not be generated. Your saved profile has not been changed.",
      code: "tailoring_generation_failed",
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
  const storedPlan = parseStoredJson<TailoringPlan>(existing.plan_json, {
    schemaVersion: 2,
    requirements: [],
    matches: [],
    gaps: [],
    selectedEvidenceIds: [],
    excludedEvidenceIds: [],
  });
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
  return c.json({
    tailoring: await normalizeTailoringForUser(c.env.DB, userId, updated),
  });
});

tailor.post("/tailorings/:id/artifacts", async (c) => {
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
  if (
    !(pdf instanceof File)
    || typeof resumeJson !== "string"
    || typeof validationJson !== "string"
    || typeof typstSource !== "string"
    || typeof templateVersion !== "string"
    || typeof compilerVersion !== "string"
  ) {
    return c.json({ error: "The export is missing required resume data." }, 400);
  }
  if (
    pdf.size > 5 * 1024 * 1024
    || resumeJson.length > 300_000
    || validationJson.length > 100_000
    || typstSource.length > 300_000
  ) {
    return c.json({ error: "The generated resume is too large to save." }, 413);
  }
  if (
    templateVersion !== row.template_version
    || compilerVersion !== row.compiler_version
  ) {
    return c.json({
      error: "This resume was built with an outdated template. Build the preview again.",
      code: "tailoring_version_mismatch",
    }, 409);
  }
  const signature = new Uint8Array(await pdf.slice(0, 5).arrayBuffer());
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
    return c.json({
      error: "Resolve the evidence warnings before downloading this resume.",
      code: "tailoring_validation_failed",
      validation,
    }, 422);
  }
  const latest = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(revision), 0) AS revision
     FROM tailored_resume_artifacts WHERE tailoring_id = ? AND user_id = ?`
  ).bind(id, userId).first<{ revision: number }>();
  const revision = (latest?.revision ?? 0) + 1;
  const artifactId = crypto.randomUUID();
  const key = `tailored/${userId}/${id}/${artifactId}.pdf`;
  const createdAt = new Date().toISOString();
  await c.env.RESUME_BUCKET.put(key, pdf.stream(), {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { tailoringId: id, artifactId, revision: String(revision) },
  });
  try {
    await c.env.DB.prepare(
      `INSERT INTO tailored_resume_artifacts (
         id, tailoring_id, user_id, revision, resume_json, validation_json,
         typst_source, template_version, compiler_version, pdf_storage_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      artifactId,
      id,
      userId,
      revision,
      resumeJson,
      JSON.stringify(validation),
      typstSource,
      templateVersion.slice(0, 80),
      compilerVersion.slice(0, 80),
      key,
      createdAt,
    ).run();
  } catch (error) {
    await c.env.RESUME_BUCKET.delete(key).catch(() => undefined);
    throw error;
  }
  return c.json({
    artifact: {
      id: artifactId,
      tailoringId: id,
      revision,
      templateVersion,
      compilerVersion,
      createdAt,
    },
  });
});

export default tailor;
