import { Hono } from "hono";
import { getAdapter } from "../ats";
import { getLatestCorpusVersion } from "./corpus";
import { buildTailorPrompt, TAILOR_SYSTEM } from "../tailor/prompt";
import { serializeProfileForPrompt } from "../tailor/serialize-profile";
import { parseTailoringText } from "../tailor/parse";
import { getLatestUserTailoring, getUserProfile } from "../account";
import { recordProductEvent } from "../product-events";
import { ensureEligibleJobs } from "../job-scope";
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
const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const ALLOWED_GEMINI_MODELS = new Set([
  "gemini-3.1-flash-lite",
  "gemini-3-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
]);
const GEMINI_DAILY_LIMITS: Record<string, number> = {
  "gemini-3.1-flash-lite": 500,
  "gemini-3-flash": 20,
  "gemini-2.5-flash": 20,
  "gemini-2.5-flash-lite": 20,
};

// App-key ("we pay") tailoring quotas. Requests that supply the user's own API
// key bill the user, so they are not capped here.
const APP_USER_DAILY_LIMIT = 15; // per user (incl. guests) per UTC day
const APP_GLOBAL_DAILY_FALLBACK = 1000; // all users per day when the provider has no documented daily limit

type TailorProvider = "gemini" | "anthropic";
type TailorKeySource = "app" | "user";

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

function writeSse(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  payload: Record<string, unknown>
) {
  return writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

function cleanProviderError(
  provider: string,
  status: number,
  body: string
): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    const message = parsed.error?.message?.trim();
    if (message) return `${provider} request failed (${status}): ${message}`;
  } catch {
    // Avoid returning raw provider bodies because prompts may include resume data.
  }
  return `${provider} request failed (${status})`;
}

function normalizeGeminiModel(model: string): string {
  const normalized = (model.trim() || DEFAULT_GEMINI_MODEL).replace(/^models\//, "");
  return ALLOWED_GEMINI_MODELS.has(normalized) ? normalized : DEFAULT_GEMINI_MODEL;
}

function normalizeTailorProvider(value: string | undefined): TailorProvider | null {
  if (value === "gemini" || value === "anthropic") return value;
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

function startOfUtcDay(date = new Date()) {
  return `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

function nextUtcDay(date = new Date()) {
  const next = new Date(startOfUtcDay(date));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

async function ensureTailorUsageTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS tailor_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      key_source TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_tailor_usage_provider_model_created
      ON tailor_usage(provider, model, created_at)`
  ).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_tailor_usage_user_created
      ON tailor_usage(user_id, created_at)`
  ).run();
}

async function recordTailorUsage(args: {
  db?: D1Database;
  userId: string;
  keySource: TailorKeySource;
  provider: TailorProvider;
  model: string;
}) {
  if (!args.db) return;
  await ensureTailorUsageTable(args.db);
  await args.db.prepare(
    `INSERT INTO tailor_usage (id, user_id, key_source, provider, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    args.userId,
    args.keySource,
    args.provider,
    args.model,
    new Date().toISOString()
  ).run();
}

async function loadTailorUsage(args: {
  db: D1Database;
  userId: string;
  provider: TailorProvider;
  model: string;
}) {
  await ensureTailorUsageTable(args.db);
  const today = startOfUtcDay();
  const [app, user] = await Promise.all([
    args.db.prepare(
      `SELECT COUNT(*) AS count
       FROM tailor_usage
       WHERE key_source = 'app'
         AND provider = ?
         AND model = ?
         AND created_at >= ?`
    ).bind(args.provider, args.model, today).first<{ count: number }>(),
    args.db.prepare(
      `SELECT COUNT(*) AS count
       FROM tailor_usage
       WHERE key_source = 'user'
         AND user_id = ?
         AND provider = ?
         AND model = ?
         AND created_at >= ?`
    ).bind(args.userId, args.provider, args.model, today).first<{ count: number }>(),
  ]);

  const dailyLimit = args.provider === "gemini" ? GEMINI_DAILY_LIMITS[args.model] ?? null : null;
  const appToday = app?.count ?? 0;
  const userToday = user?.count ?? 0;

  return {
    provider: args.provider,
    model: args.model,
    app_today: appToday,
    user_today: userToday,
    daily_limit: dailyLimit,
    app_remaining: dailyLimit === null ? null : Math.max(0, dailyLimit - appToday),
    user_remaining: dailyLimit === null ? null : Math.max(0, dailyLimit - userToday),
    resets_at: nextUtcDay(),
  };
}

// Enforce the app-key tailoring quota: a per-user daily cap (so one user/guest
// can't drain the budget or rack up cost) plus the provider's global daily cap.
async function reserveAppTailorQuota(
  db: D1Database,
  userId: string,
  provider: TailorProvider,
  model: string
): Promise<{ ok: true } | { ok: false; resets_at: string }> {
  await ensureTailorUsageTable(db);
  const today = startOfUtcDay();
  const globalLimit = provider === "gemini"
    ? GEMINI_DAILY_LIMITS[model] ?? APP_GLOBAL_DAILY_FALLBACK
    : APP_GLOBAL_DAILY_FALLBACK;

  // Reserve quota in the same SQLite statement that checks both limits. This
  // prevents concurrent requests from all passing a read-only count check before
  // any of them records usage.
  const result = await db.prepare(
    `INSERT INTO tailor_usage (id, user_id, key_source, provider, model, created_at)
     SELECT ?, ?, 'app', ?, ?, ?
     WHERE (
       SELECT COUNT(*) FROM tailor_usage
       WHERE key_source = 'app' AND user_id = ? AND created_at >= ?
     ) < ?
       AND (
         SELECT COUNT(*) FROM tailor_usage
         WHERE key_source = 'app' AND provider = ? AND model = ? AND created_at >= ?
       ) < ?`
  ).bind(
    crypto.randomUUID(),
    userId,
    provider,
    model,
    new Date().toISOString(),
    userId,
    today,
    APP_USER_DAILY_LIMIT,
    provider,
    model,
    today,
    globalLimit
  ).run();
  if ((result.meta.changes ?? 0) === 0) {
    return { ok: false, resets_at: nextUtcDay() };
  }
  return { ok: true };
}

function textFromGeminiPayload(payload: any): string {
  if (payload.error?.message) {
    throw new Error(`Gemini streaming error: ${payload.error.message}`);
  }

  return (payload.candidates ?? [])
    .flatMap((candidate: any) => candidate.content?.parts ?? [])
    .map((part: any) => (typeof part.text === "string" ? part.text : ""))
    .join("");
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

async function streamAnthropicTailoring(args: {
  apiKey: string;
  model: string;
  sourceMd: string;
  job: JobForTailor & { description: string };
  writer: WritableStreamDefaultWriter<Uint8Array>;
  encoder: TextEncoder;
  db?: D1Database;
  persist?: {
    corpusVersionId: number;
  };
  usage?: {
    userId: string;
    sessionId?: string | null;
    keySource: TailorKeySource;
    provider: TailorProvider;
  };
}) {
  const { apiKey, model, sourceMd, job, db, persist, usage, writer, encoder } = args;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2400,
      system: TAILOR_SYSTEM,
      stream: true,
      messages: [
        {
          role: "user",
          content: buildTailorPrompt(
            {
              title: job.title,
              company: job.company_name,
              description: job.description,
            },
            sourceMd
          ),
        },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(cleanProviderError("Anthropic", response.status, body));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");

    while (buffer.includes("\n\n")) {
      const boundary = buffer.indexOf("\n\n");
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (!rawEvent.trim()) continue;

      const dataLines = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      if (dataLines.length === 0) continue;

      const payload = JSON.parse(dataLines.join("\n"));
      switch (payload.type) {
        case "message_start":
          inputTokens = payload.message?.usage?.input_tokens ?? inputTokens;
          break;
        case "content_block_delta":
          if (payload.delta?.type === "text_delta" && payload.delta.text) {
            fullText += payload.delta.text;
            await writeSse(writer, encoder, {
              type: "chunk",
              text: payload.delta.text,
            });
          }
          break;
        case "message_delta":
          outputTokens = payload.usage?.output_tokens ?? outputTokens;
          break;
        case "error":
          throw new Error(
            payload.error?.message || "Anthropic streaming error"
          );
        default:
          break;
      }
    }
  }

  const parsed = parseTailoringText(fullText);
  const tailoringId = await persistTailoring({
    db,
    persist,
    userId: usage?.userId ?? "guest",
    jobId: job.id,
    parsed,
    inputTokens,
    outputTokens,
    model,
  });

  await writeSse(writer, encoder, {
    type: "done",
    tailoring_id: tailoringId,
    persisted: Boolean(tailoringId),
    tokens: {
      in: inputTokens,
      out: outputTokens,
    },
  });

  if (usage && db) {
    if (usage.keySource !== "app") {
      await recordTailorUsage({
        db,
        userId: usage.userId,
        keySource: usage.keySource,
        provider: usage.provider,
        model,
      }).catch(() => undefined);
    }
    await recordProductEvent(db, {
      userId: usage.userId,
      sessionId: usage.sessionId,
      name: "tailoring_completed",
      entityType: "job",
      entityId: job.id,
      properties: { provider: usage.provider, model },
    }).catch(() => undefined);
  }
}

async function streamGeminiTailoring(args: {
  apiKey: string;
  model: string;
  sourceMd: string;
  job: JobForTailor & { description: string };
  writer: WritableStreamDefaultWriter<Uint8Array>;
  encoder: TextEncoder;
  db?: D1Database;
  persist?: {
    corpusVersionId: number;
  };
  usage?: {
    userId: string;
    sessionId?: string | null;
    keySource: TailorKeySource;
    provider: TailorProvider;
  };
}) {
  const { apiKey, sourceMd, job, db, persist, usage, writer, encoder } = args;
  const model = normalizeGeminiModel(args.model);
  const prompt = buildTailorPrompt(
    {
      title: job.title,
      company: job.company_name,
      description: job.description,
    },
    sourceMd
  );

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: TAILOR_SYSTEM }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 2400,
          temperature: 0.15,
        },
      }),
    }
  );

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(cleanProviderError("Gemini", response.status, body));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  async function handleEvent(rawEvent: string) {
    if (!rawEvent.trim()) return;
    const dataLines = rawEvent
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());

    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    if (!data || data === "[DONE]") return;

    const payload = JSON.parse(data);
    const chunk = textFromGeminiPayload(payload);
    if (chunk) {
      fullText += chunk;
      await writeSse(writer, encoder, {
        type: "chunk",
        text: chunk,
      });
    }

    const usage = payload.usageMetadata;
    inputTokens = usage?.promptTokenCount ?? inputTokens;
    outputTokens = usage?.candidatesTokenCount ?? outputTokens;
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");

    while (buffer.includes("\n\n")) {
      const boundary = buffer.indexOf("\n\n");
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      await handleEvent(rawEvent);
    }
  }

  if (buffer.trim()) {
    await handleEvent(buffer);
  }

  const parsed = parseTailoringText(fullText);
  const tailoringId = await persistTailoring({
    db,
    persist,
    userId: usage?.userId ?? "guest",
    jobId: job.id,
    parsed,
    inputTokens,
    outputTokens,
    model,
  });

  await writeSse(writer, encoder, {
    type: "done",
    tailoring_id: tailoringId,
    persisted: Boolean(tailoringId),
    tokens: {
      in: inputTokens,
      out: outputTokens,
    },
  });

  if (usage && db) {
    if (usage.keySource !== "app") {
      await recordTailorUsage({
        db,
        userId: usage.userId,
        keySource: usage.keySource,
        provider: usage.provider,
        model,
      }).catch(() => undefined);
    }
    await recordProductEvent(db, {
      userId: usage.userId,
      sessionId: usage.sessionId,
      name: "tailoring_completed",
      entityType: "job",
      entityId: job.id,
      properties: { provider: usage.provider, model },
    }).catch(() => undefined);
  }
}

tailor.get("/tailor/usage", async (c) => {
  const userId = c.get("userId");
  const provider = normalizeTailorProvider(c.req.query("provider")) ?? "gemini";
  const requestedModel = c.req.query("model")?.trim();
  const model = provider === "gemini"
    ? normalizeGeminiModel(requestedModel || c.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL)
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
    daily_limit: provider === "gemini" ? GEMINI_DAILY_LIMITS[model] ?? null : null,
    app_remaining: null,
    user_remaining: null,
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
  const provider: TailorProvider =
    requestedProvider
    ?? (c.env.GEMINI_API_KEY?.trim()
      ? "gemini"
      : c.env.ANTHROPIC_API_KEY?.trim()
        ? "anthropic"
        : "gemini");

  const apiKey =
    requestApiKey
    || (provider === "gemini"
      ? c.env.GEMINI_API_KEY?.trim()
      : c.env.ANTHROPIC_API_KEY?.trim());
  if (!apiKey) {
    return c.json(
      { error: "Add a Gemini API key in Profile, or configure GEMINI_API_KEY on the worker." },
      503
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

  if (requestResumeMd) {
    sourceMd = buildCandidateEvidenceSource({
      resumeMd: requestResumeMd,
      corpusMd: corpus?.content_md,
    });
  } else if (hasProfile) {
    const profileMd = serializeProfileForPrompt(profileData, corpus?.content_md);
    sourceMd = `PRIMARY RESUME SOURCE:\n${profileMd}`;
    if (corpus) persist = { corpusVersionId: corpus.id };
  } else {
    if (!corpus) {
      return c.json({ error: "No profile or corpus found. Please fill out your resume profile first." }, 400);
    }
    sourceMd = buildCandidateEvidenceSource({ corpusMd: corpus.content_md });
    persist = { corpusVersionId: corpus.id };
  }

  const model =
    requestModel
    || (provider === "gemini"
      ? c.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
      : c.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL);
  const safeModel = provider === "gemini" ? normalizeGeminiModel(model) : model;

  // Enforce the daily quota when we're paying (app key). User-supplied keys are
  // the user's own cost and are not capped here.
  if (keySource === "app") {
    const quota = await reserveAppTailorQuota(c.env.DB, c.get("userId"), provider, safeModel);
    if (!quota.ok) {
      return c.json(
        {
          error: "You've hit today's tailoring limit. Add your own Gemini API key in Profile to keep going, or try again tomorrow.",
          code: "tailor_quota_exceeded",
          resets_at: quota.resets_at,
        },
        429
      );
    }
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
        const streamTailoring =
          provider === "gemini" ? streamGeminiTailoring : streamAnthropicTailoring;

        await streamTailoring({
          apiKey,
          model: safeModel,
          sourceMd,
          job: { ...job, description },
          db: c.env.DB,
          persist: localMode ? undefined : persist,
          usage: {
            userId: c.get("userId"),
            sessionId: c.get("sessionId"),
            keySource,
            provider,
          },
          writer,
          encoder,
        });
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
