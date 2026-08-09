import { Hono } from "hono";
import { getAdapter } from "../ats";
import {
  buildCandidateEvidence,
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
import { copyCorpusVersion, getLatestUserTailoring, getUserProfile } from "../account";
import { recordProductEvent } from "../product-events";
import { ensureEligibleJobs } from "../job-scope";
import {
  GEMINI_DAILY_LIMITS,
  WORKERS_AI_DAILY_NEURON_LIMIT,
  completeAppTailorUsage,
  loadTailorUsage,
  nextUtcDay,
  reserveAppTailorQuota,
  type TailorProvider,
} from "../tailor/usage";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GEMINI_MODEL,
  normalizeWorkersAiModel,
  resolveAppTailorConfig,
} from "../tailor/config";
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
const ALLOWED_GEMINI_MODELS = new Set([
  "gemini-3.1-flash-lite",
  "gemini-3-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
]);
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
) {
  if (row.schema_version >= 2) {
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
        schemaVersion: 1,
        requirements: [],
        matches: [],
        gaps: [],
        selectedEvidenceIds: [],
        excludedEvidenceIds: [],
      }),
      resumeDraft: parseStoredJson<TailoredResume | null>(row.resume_draft_json, null),
      validation: parseStoredJson<TailoringValidation | null>(row.validation_json, null),
      templateVersion: row.template_version ?? "resume-v1",
      compilerVersion: row.compiler_version ?? "typst-web-v1",
      input_tokens: row.input_tokens,
      output_tokens: row.output_tokens,
      model: row.model,
      created_at: row.created_at,
      updated_at: row.updated_at ?? row.created_at,
      latestArtifact,
    };
  }
  return {
    kind: "legacy" as const,
    id: row.id,
    job_id: row.job_id,
    resume_md_final: row.user_edited_resume_md ?? row.resume_md ?? "",
    cover_letter_md_final: row.user_edited_cover_md ?? row.cover_letter_md ?? "",
    qa_json_final: row.user_edited_qa_json ?? row.qa_json ?? "[]",
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    model: row.model,
    created_at: row.created_at,
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

function requireStructuredTailoring(row: TailoringRow | null): TailoringRow | null {
  return row && row.schema_version >= 2 ? row : null;
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

function normalizeGeminiModel(model: string): string {
  const normalized = (model.trim() || DEFAULT_GEMINI_MODEL).replace(/^models\//, "");
  return ALLOWED_GEMINI_MODELS.has(normalized) ? normalized : DEFAULT_GEMINI_MODEL;
}

function normalizeTailorProvider(value: string | undefined): TailorProvider | null {
  if (value === "gemini" || value === "anthropic" || value === "workers_ai") return value;
  return null;
}

tailor.get("/tailor/usage", async (c) => {
  const userId = c.get("userId");
  const appConfig = resolveAppTailorConfig(c.env);
  const provider = normalizeTailorProvider(c.req.query("provider"))
    ?? appConfig?.provider
    ?? "gemini";
  const requestedModel = c.req.query("model")?.trim();
  const model = provider === "gemini"
    ? normalizeGeminiModel(requestedModel || c.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL)
    : provider === "workers_ai"
      ? normalizeWorkersAiModel(requestedModel || appConfig?.model)
      : requestedModel || c.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;

  const usage = await loadTailorUsage({
    db: c.env.DB,
    userId,
    provider,
    model,
  }).catch(() => ({
    provider,
    model,
    app_today: 0,
    user_today: 0,
    included_user_today: 0,
    daily_limit: provider === "gemini" ? GEMINI_DAILY_LIMITS[model] ?? null : null,
    app_remaining: null,
    user_remaining: null,
    included_user_remaining: null,
    provider_units_today: 0,
    provider_units_limit: provider === "workers_ai" ? WORKERS_AI_DAILY_NEURON_LIMIT : null,
    provider_units_remaining: provider === "workers_ai" ? WORKERS_AI_DAILY_NEURON_LIMIT : null,
    resets_at: nextUtcDay(),
  }));

  return c.json({ usage });
});

tailor.get("/tailor/:job_id", async (c) => {
  const { job_id } = c.req.param();
  const userId = c.get("userId");
  const row = await getLatestUserTailoring(c.env.DB, userId, job_id);
  const latestArtifact = row && row.schema_version >= 2
    ? await loadLatestArtifact(c.env.DB, userId, row.id)
    : null;

  return c.json({ tailoring: row ? normalizeTailoring(row, latestArtifact) : null });
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
  const quota = await reserveAppTailorQuota(c.env.DB, userId, "workers_ai", model);
  if (!quota.ok) {
    return c.json({
      error: "You've used today's included tailorings. Try again tomorrow.",
      code: "tailor_quota_exceeded",
      resets_at: quota.resets_at,
    }, 429);
  }
  const capturedAt = new Date().toISOString();
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
    const corpusVersionId = await copyCorpusVersion(c.env.DB, userId, "", "structured resume");
    if (!corpusVersionId) throw new Error("Could not create the structured tailoring draft.");
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO tailorings (
         id, user_id, job_id, corpus_version_id, input_tokens, output_tokens,
         model, created_at, schema_version, status, job_snapshot_json,
         evidence_json, requirements_json, plan_json, template_version,
         compiler_version, updated_at, usage_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2, 'planned', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      userId,
      job.id,
      corpusVersionId,
      result.usage.inputTokens || null,
      result.usage.outputTokens || null,
      model,
      capturedAt,
      JSON.stringify(snapshot),
      JSON.stringify(evidence),
      JSON.stringify(result.plan.requirements),
      JSON.stringify(result.plan),
      "resume-v1",
      "typst-web-v1",
      capturedAt,
      quota.usageId,
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
    return c.json({ tailoring: normalizeTailoring(row) });
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
  const row = requireStructuredTailoring(await c.env.DB.prepare(
    "SELECT * FROM tailorings WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first<TailoringRow>());
  if (!row) return c.json({ error: "Structured tailoring not found" }, 404);
  const body = (await c.req.json<{
    selectedEvidenceIds?: string[];
    excludedEvidenceIds?: string[];
  }>().catch(() => null)) ?? {};
  const evidence = parseStoredJson<CandidateEvidence[]>(row.evidence_json, []);
  const storedPlan = parseStoredJson<TailoringPlan>(row.plan_json, {
    schemaVersion: 1,
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
  const { data: profile } = await getUserProfile(c.env.DB, userId);
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
        tailoring: normalizeTailoring(updated),
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
    return c.json({ tailoring: normalizeTailoring(updated) });
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
  const body =
    (await c.req
      .json<{
        user_edited_resume_md?: string;
        user_edited_cover_md?: string;
        user_edited_qa_json?: string;
        resume_draft?: TailoredResume;
        selectedEvidenceIds?: string[];
      }>()
      .catch(() => null)) ?? {};
  if (existing.schema_version >= 2) {
    if (!body.resume_draft) return c.json({ error: "No structured draft to update" }, 400);
    const serialized = JSON.stringify(body.resume_draft);
    if (serialized.length > 300_000) return c.json({ error: "Resume draft is too large" }, 413);
    const { data: profile } = await getUserProfile(c.env.DB, userId);
    const evidence = parseStoredJson<CandidateEvidence[]>(existing.evidence_json, []);
    const storedPlan = parseStoredJson<TailoringPlan>(existing.plan_json, {
      schemaVersion: 1,
      requirements: [],
      matches: [],
      gaps: [],
      selectedEvidenceIds: [],
      excludedEvidenceIds: [],
    });
    const availableIds = new Set(evidence.map((item) => item.id));
    const selectedEvidenceIds = Array.isArray(body.selectedEvidenceIds)
      ? [...new Set(body.selectedEvidenceIds.filter((id) => availableIds.has(id)))]
      : storedPlan.selectedEvidenceIds.filter((id) => availableIds.has(id));
    const plan: TailoringPlan = {
      ...storedPlan,
      selectedEvidenceIds,
      excludedEvidenceIds: evidence
        .map((item) => item.id)
        .filter((id) => !selectedEvidenceIds.includes(id)),
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
    return c.json({ tailoring: normalizeTailoring(updated) });
  }
  if (
    (body.user_edited_resume_md?.length ?? 0) > 200_000
    || (body.user_edited_cover_md?.length ?? 0) > 100_000
    || (body.user_edited_qa_json?.length ?? 0) > 100_000
  ) {
    return c.json({ error: "Tailoring edits are too large" }, 413);
  }

  const clauses: string[] = [];
  const bindings: string[] = [];

  if (body.user_edited_resume_md !== undefined) {
    clauses.push("user_edited_resume_md = ?");
    bindings.push(body.user_edited_resume_md);
  }
  if (body.user_edited_cover_md !== undefined) {
    clauses.push("user_edited_cover_md = ?");
    bindings.push(body.user_edited_cover_md);
  }
  if (body.user_edited_qa_json !== undefined) {
    clauses.push("user_edited_qa_json = ?");
    bindings.push(body.user_edited_qa_json);
  }

  if (clauses.length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE tailorings SET ${clauses.join(", ")} WHERE id = ? AND user_id = ?`
  ).bind(...bindings, id, userId).run();

  const updated = await c.env.DB.prepare(
    `SELECT * FROM tailorings WHERE id = ? AND user_id = ?`
  ).bind(id, userId).first<TailoringRow>();

  if (!updated) {
    return c.json({ error: "Tailoring not found" }, 404);
  }

  return c.json({ tailoring: normalizeTailoring(updated) });
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
  const row = requireStructuredTailoring(await c.env.DB.prepare(
    "SELECT * FROM tailorings WHERE id = ? AND user_id = ?"
  ).bind(id, userId).first<TailoringRow>());
  if (!row) return c.json({ error: "Structured tailoring not found" }, 404);
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
    templateVersion !== (row.template_version ?? "resume-v1")
    || compilerVersion !== (row.compiler_version ?? "typst-web-v1")
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
  const { data: profile } = await getUserProfile(c.env.DB, userId);
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

tailor.post("/tailor/:job_id", (c) => c.json({
  error: "Create a new structured tailoring plan before generating a resume.",
  code: "structured_tailoring_required",
}, 409));

export default tailor;
