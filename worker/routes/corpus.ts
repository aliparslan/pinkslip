import { Hono } from "hono";
import type { CorpusVersionRow, Env, Variables } from "../types";
import { copyCorpusVersion, getLatestUserCorpusVersion } from "../account";

const corpus = new Hono<{ Bindings: Env; Variables: Variables }>();

export async function getLatestCorpusVersion(
  db: D1Database,
  userId: string
): Promise<CorpusVersionRow | null> {
  return getLatestUserCorpusVersion(db, userId);
}

corpus.get("/", async (c) => {
  const latest = await getLatestCorpusVersion(c.env.DB, c.get("userId"));
  if (!latest) {
    return c.json({ content_md: "", version_id: null, updated_at: null });
  }

  return c.json({
    content_md: latest.content_md,
    version_id: latest.id,
    updated_at: latest.updated_at,
    label: latest.label,
  });
});

corpus.put("/", async (c) => {
  const body =
    (await c.req.json<{ content_md?: string }>().catch(() => null)) ?? {};
  const contentMd = body.content_md?.trim() ?? "";
  const versionId = await copyCorpusVersion(
    c.env.DB,
    c.get("userId"),
    contentMd,
    "corpus"
  );
  const created = await getLatestCorpusVersion(c.env.DB, c.get("userId"));

  return c.json({
    content_md: created?.content_md ?? contentMd,
    version_id: created?.id ?? versionId,
    updated_at: created?.updated_at ?? new Date().toISOString(),
    label: created?.label ?? "corpus",
  });
});

corpus.get("/versions", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT id, label, created_at, updated_at
     FROM corpus_versions
     WHERE user_id = ?
     ORDER BY datetime(updated_at) DESC, id DESC`
  ).bind(c.get("userId")).all<Omit<CorpusVersionRow, "content_md">>();

  return c.json({ versions: result.results ?? [] });
});

corpus.get("/versions/:id", async (c) => {
  const { id } = c.req.param();
  const version = await c.env.DB.prepare(
    `SELECT id, user_id, content_md, label, created_at, updated_at
     FROM corpus_versions
     WHERE id = ? AND user_id = ?`
  ).bind(id, c.get("userId")).first<CorpusVersionRow>();

  if (!version) {
    return c.json({ error: "Version not found" }, 404);
  }

  return c.json(version);
});

corpus.post("/snapshot", async (c) => {
  const body =
    (await c.req.json<{ label?: string }>().catch(() => null)) ?? {};
  const latest = await getLatestCorpusVersion(c.env.DB, c.get("userId"));
  if (!latest) {
    return c.json({ error: "No corpus available" }, 400);
  }

  const versionId = await copyCorpusVersion(
    c.env.DB,
    c.get("userId"),
    latest.content_md,
    body.label?.trim() || `snapshot ${new Date().toISOString().slice(0, 16)}`
  );
  const created = await getLatestCorpusVersion(c.env.DB, c.get("userId"));
  return c.json({ version_id: created?.id ?? null });
});

export default corpus;
