import { Hono } from "hono";
import { getAdapter } from "../ats";
import { getLatestCorpusVersion } from "./corpus";
import { serializeProfileForPrompt } from "../tailor/serialize-profile";
import { parseTailoringText } from "../tailor/parse";
import {
  streamAnthropicTailoring,
  streamGeminiTailoring,
  streamWorkersAiTailoring,
  writeSse,
} from "../tailor/providers";
import { copyCorpusVersion, getLatestUserTailoring, getUserProfile } from "../account";
import { recordProductEvent } from "../product-events";
import { ensureEligibleJobs } from "../job-scope";
import {
  GEMINI_DAILY_LIMITS,
  WORKERS_AI_DAILY_NEURON_LIMIT,
  completeAppTailorUsage,
  loadTailorUsage,
  nextUtcDay,
  recordTailorUsage,
  reserveAppTailorQuota,
  type TailorKeySource,
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

function normalizeTailoring(row: TailoringRow) {
  return {
    ...row,
    qa_json: row.qa_json,
    user_edited_qa_json: row.user_edited_qa_json,
    resume_md_final: row.user_edited_resume_md ?? row.resume_md,
    cover_letter_md_final: row.user_edited_cover_md ?? row.cover_letter_md,
    qa_json_final: row.user_edited_qa_json ?? row.qa_json,
  };
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

function buildCandidateEvidenceSource(args: {
  resumeMd?: string | null;
  corpusMd?: string | null;
}) {
  const sections: string[] = [];
  const resumeMd = args.resumeMd?.trim();
  const corpusMd = args.corpusMd?.trim();

  if (resumeMd) {
    sections.push(`PRIMARY RESUME SOURCE:
${resumeMd}`);
  }

  if (corpusMd) {
    sections.push(`MASTER CORPUS SOURCE:
${corpusMd}`);
  }

  return sections.join("\n\n---\n\n").trim();
}

export async function resolveTailoringPersistence(args: {
  db: D1Database;
  userId: string;
  corpusVersionId: number | null;
  hasProfile: boolean;
  localMode: boolean;
}): Promise<{ corpusVersionId: number } | undefined> {
  if (args.localMode) return undefined;
  if (args.corpusVersionId) return { corpusVersionId: args.corpusVersionId };
  if (!args.hasProfile) return undefined;

  const corpusVersionId = await copyCorpusVersion(args.db, args.userId, "", "corpus");
  if (!corpusVersionId) throw new Error("Could not create a tailoring persistence target");
  return { corpusVersionId };
}

async function persistTailoring(args: {
  db?: D1Database;
  persist?: { corpusVersionId: number };
  userId: string;
  jobId: string;
  parsed: ReturnType<typeof parseTailoringText>;
  inputTokens: number;
  outputTokens: number;
  model: string;
}): Promise<string | null> {
  const { db, persist, userId, jobId, parsed, inputTokens, outputTokens, model } = args;
  if (!persist || !db) return null;

  const tailoringId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db.prepare(
    `INSERT INTO tailorings (
       id,
       user_id,
       job_id,
       corpus_version_id,
       resume_md,
       cover_letter_md,
       qa_json,
       input_tokens,
       output_tokens,
       model,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    tailoringId,
    userId,
    jobId,
    persist.corpusVersionId,
    parsed.resume_md,
    parsed.cover_letter_md,
    parsed.qa_json,
    inputTokens || null,
    outputTokens || null,
    model,
    createdAt
  ).run();

  return tailoringId;
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
  const row = await getLatestUserTailoring(c.env.DB, c.get("userId"), job_id);

  return c.json({ tailoring: row ? normalizeTailoring(row) : null });
});

tailor.patch("/tailorings/:id", async (c) => {
  const { id } = c.req.param();
  const body =
    (await c.req
      .json<{
        user_edited_resume_md?: string;
        user_edited_cover_md?: string;
        user_edited_qa_json?: string;
      }>()
      .catch(() => null)) ?? {};
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
  ).bind(...bindings, id, c.get("userId")).run();

  const updated = await c.env.DB.prepare(
    `SELECT * FROM tailorings WHERE id = ? AND user_id = ?`
  ).bind(id, c.get("userId")).first<TailoringRow>();

  if (!updated) {
    return c.json({ error: "Tailoring not found" }, 404);
  }

  return c.json({ tailoring: normalizeTailoring(updated) });
});

tailor.post("/tailor/:job_id", async (c) => {
  const { job_id } = c.req.param();
  const body =
    (await c.req
      .json<{
        provider?: string;
        api_key?: string;
        model?: string;
        resume_md?: string;
      }>()
      .catch(() => null)) ?? {};

  const requestedProvider = normalizeTailorProvider(body.provider);
  const requestApiKey = body.api_key?.trim();
  const requestModel = body.model?.trim();
  const requestResumeMd = body.resume_md?.trim();
  if (requestResumeMd && requestResumeMd.length > 200_000) {
    return c.json({ error: "Resume input is capped at 200,000 characters" }, 413);
  }
  const localMode = Boolean(requestApiKey || requestResumeMd);
  const keySource: TailorKeySource = requestApiKey ? "user" : "app";
  const appConfig = resolveAppTailorConfig(c.env);
  const provider: TailorProvider = requestApiKey
    ? requestedProvider === "anthropic" ? "anthropic" : "gemini"
    : appConfig?.provider ?? "gemini";

  const apiKey =
    requestApiKey
    || (provider === "workers_ai"
      ? undefined
      : provider === "gemini"
      ? c.env.GEMINI_API_KEY?.trim()
      : c.env.ANTHROPIC_API_KEY?.trim());
  if ((provider === "workers_ai" && !c.env.AI) || (provider !== "workers_ai" && !apiKey)) {
    // `code` lets the app render a guided setup card instead of a raw error.
    // The message stays free of env-var jargon — it's shown to job seekers.
    return c.json(
      {
        error: "Tailoring isn't set up yet. Add a free Gemini API key in You → Tailoring to enable it.",
        code: "tailor_not_configured",
      },
      503
    );
  }
  if (keySource === "app" && c.get("sessionState") !== "authenticated") {
    return c.json(
      {
        error: "Sign in to use pinkslip's included tailoring, or add your own Gemini API key in You → Tailoring.",
        code: "authentication_required",
      },
      401
    );
  }

  const job = await loadJobForTailor(c.env.DB, job_id);
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  const description = await ensureJobDescription(c.env.DB, job);
  if (!description) {
    return c.json(
      { error: "Job description is unavailable for tailoring right now" },
      400
    );
  }

  let sourceMd = "";
  let persist: { corpusVersionId: number } | undefined;
  const corpus = await getLatestCorpusVersion(c.env.DB, c.get("userId"));
  const { data: profileData } = await getUserProfile(c.env.DB, c.get("userId"));

  const hasProfile = profileData.contact.name || profileData.experience.length > 0;
  persist = await resolveTailoringPersistence({
    db: c.env.DB,
    userId: c.get("userId"),
    corpusVersionId: corpus?.id ?? null,
    hasProfile: Boolean(hasProfile),
    localMode,
  });

  if (requestResumeMd) {
    sourceMd = buildCandidateEvidenceSource({
      resumeMd: requestResumeMd,
      corpusMd: corpus?.content_md,
    });
  } else if (hasProfile) {
    const profileMd = serializeProfileForPrompt(profileData, corpus?.content_md);
    sourceMd = `PRIMARY RESUME SOURCE:\n${profileMd}`;
  } else {
    if (!corpus) {
      return c.json({ error: "No profile or corpus found. Please fill out your resume profile first." }, 400);
    }
    sourceMd = buildCandidateEvidenceSource({ corpusMd: corpus.content_md });
  }

  const model =
    keySource === "app"
      ? appConfig?.model ?? DEFAULT_GEMINI_MODEL
      : requestModel
        || (provider === "gemini"
          ? DEFAULT_GEMINI_MODEL
          : DEFAULT_ANTHROPIC_MODEL);
  const safeModel = provider === "gemini"
    ? normalizeGeminiModel(model)
    : provider === "workers_ai"
      ? normalizeWorkersAiModel(model)
      : model;

  // Enforce the daily quota when we're paying (app key). User-supplied keys are
  // the user's own cost and are not capped here.
  let usageReservationId: string | null = null;
  if (keySource === "app") {
    const quota = await reserveAppTailorQuota(c.env.DB, c.get("userId"), provider, safeModel);
    if (!quota.ok) {
      return c.json(
        {
          error: "You've hit today's tailoring limit. Add your own Gemini API key in You → Tailoring to keep going, or try again tomorrow.",
          code: "tailor_quota_exceeded",
          resets_at: quota.resets_at,
        },
        429
      );
    }
    usageReservationId = quota.usageId;
  }

  await recordProductEvent(c.env.DB, {
    userId: c.get("userId"),
    sessionId: c.get("sessionId"),
    name: "tailoring_started",
    entityType: "job",
    entityId: job_id,
    properties: { provider, model: safeModel },
  }).catch(() => undefined);
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  c.executionCtx.waitUntil(
    (async () => {
      try {
        const providerJob = { ...job, description };
        const result = provider === "workers_ai"
          ? await streamWorkersAiTailoring({
              ai: c.env.AI!,
              model: normalizeWorkersAiModel(safeModel),
              sourceMd,
              job: providerJob,
              writer,
              encoder,
            })
          : provider === "gemini"
            ? await streamGeminiTailoring({
                apiKey: apiKey!,
                model: safeModel,
                sourceMd,
                job: providerJob,
                writer,
                encoder,
              })
            : await streamAnthropicTailoring({
                apiKey: apiKey!,
                model: safeModel,
                sourceMd,
                job: providerJob,
                writer,
                encoder,
              });
        if (usageReservationId) {
          await completeAppTailorUsage({
            db: c.env.DB,
            usageId: usageReservationId,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            providerUnits: result.providerUnits,
          });
        }
        const tailoringId = await persistTailoring({
          db: c.env.DB,
          persist: localMode ? undefined : persist,
          userId: c.get("userId"),
          jobId: job.id,
          parsed: result.parsed,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          model: safeModel,
        });
        await writeSse(writer, encoder, {
          type: "done",
          tailoring_id: tailoringId,
          persisted: Boolean(tailoringId),
          tokens: { in: result.inputTokens, out: result.outputTokens },
        });
        if (keySource !== "app") {
          await recordTailorUsage({
            db: c.env.DB,
            userId: c.get("userId"),
            keySource,
            provider,
            model: safeModel,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            providerUnits: result.providerUnits,
          }).catch(() => undefined);
        }
        await recordProductEvent(c.env.DB, {
          userId: c.get("userId"),
          sessionId: c.get("sessionId"),
          name: "tailoring_completed",
          entityType: "job",
          entityId: job.id,
          properties: { provider, model: safeModel },
        }).catch(() => undefined);
      } catch (error) {
        await writeSse(writer, encoder, {
          type: "error",
          message:
            error instanceof Error ? error.message : "Tailoring request failed",
        });
      } finally {
        await writer.close();
      }
    })()
  );

  return new Response(stream.readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
});

export default tailor;
