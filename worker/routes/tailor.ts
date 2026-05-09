import { Hono } from "hono";
import { getAdapter } from "../ats";
import { getLatestCorpusVersion } from "./corpus";
import { buildTailorPrompt, TAILOR_SYSTEM } from "../tailor/prompt";
import { parseTailoringText } from "../tailor/parse";
import type {
  Env,
  TailoringRow,
  Variables,
} from "../types";

const tailor = new Hono<{ Bindings: Env; Variables: Variables }>();

interface JobForTailor {
  id: string;
  external_id: string;
  title: string;
  description: string | null;
  company_name: string;
  ats_type: string;
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
         j.description,
         c.name AS company_name,
         c.ats_type,
         c.ats_slug
       FROM jobs j
       JOIN companies c ON c.id = j.company_id
       WHERE j.id = ?`
    )
    .bind(jobId)
    .first<JobForTailor>();
}

async function ensureJobDescription(
  db: D1Database,
  job: JobForTailor
): Promise<string | null> {
  if (job.description) return job.description;
  const adapter = getAdapter(job.ats_type as never);
  if (!adapter) return null;

  const content = await adapter.fetchJobContent(job.ats_slug, job.external_id);
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
}) {
  const { apiKey, model, sourceMd, job, db, persist, writer, encoder } = args;

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
    throw new Error(body || `Anthropic request failed (${response.status})`);
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
  let tailoringId: string | null = null;
  if (persist && db) {
    tailoringId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await db.prepare(
      `INSERT INTO tailorings (
         id,
         job_id,
         corpus_version_id,
         resume_md,
         cover_letter_md,
         qa_json,
         input_tokens,
         output_tokens,
         model,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tailoringId,
      job.id,
      persist.corpusVersionId,
      parsed.resume_md,
      parsed.cover_letter_md,
      parsed.qa_json,
      inputTokens || null,
      outputTokens || null,
      model,
      createdAt
    ).run();
  }

  await writeSse(writer, encoder, {
    type: "done",
    tailoring_id: tailoringId,
    persisted: Boolean(tailoringId),
    tokens: {
      in: inputTokens,
      out: outputTokens,
    },
  });
}

tailor.get("/tailor/:job_id", async (c) => {
  const { job_id } = c.req.param();
  const row = await c.env.DB.prepare(
    `SELECT *
     FROM tailorings
     WHERE job_id = ?
     ORDER BY datetime(created_at) DESC, created_at DESC
     LIMIT 1`
  ).bind(job_id).first<TailoringRow>();

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
    `UPDATE tailorings SET ${clauses.join(", ")} WHERE id = ?`
  ).bind(...bindings, id).run();

  const updated = await c.env.DB.prepare(
    `SELECT * FROM tailorings WHERE id = ?`
  ).bind(id).first<TailoringRow>();

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
        api_key?: string;
        model?: string;
        resume_md?: string;
      }>()
      .catch(() => null)) ?? {};

  const requestApiKey = body.api_key?.trim();
  const requestModel = body.model?.trim();
  const requestResumeMd = body.resume_md?.trim();
  const localMode = Boolean(requestApiKey || requestResumeMd);

  const apiKey = requestApiKey || c.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return c.json(
      { error: "Add an Anthropic API key in Profile to tailor privately on this device, or configure ANTHROPIC_API_KEY on the worker" },
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

  let sourceMd = requestResumeMd ?? "";
  let persist: { corpusVersionId: number } | undefined;

  if (!sourceMd) {
    const corpus = await getLatestCorpusVersion(c.env.DB);
    if (!corpus) {
      return c.json({ error: "Corpus not found" }, 400);
    }
    sourceMd = corpus.content_md;
    persist = { corpusVersionId: corpus.id };
  }

  const model =
    requestModel
    || c.env.ANTHROPIC_MODEL?.trim()
    || "claude-sonnet-4-20250514";
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  c.executionCtx.waitUntil(
    (async () => {
      try {
        await streamAnthropicTailoring({
          apiKey,
          model,
          sourceMd,
          job: { ...job, description },
          db: c.env.DB,
          persist: localMode ? undefined : persist,
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
