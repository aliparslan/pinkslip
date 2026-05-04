import { Hono } from "hono";
import type { CorpusVersionRow, Env } from "../types";

const corpus = new Hono<{ Bindings: Env }>();

export async function getLatestCorpusVersion(
  db: D1Database
): Promise<CorpusVersionRow | null> {
  return db
    .prepare(
      `SELECT id, content_md, label, created_at, updated_at
       FROM corpus_versions
       ORDER BY datetime(updated_at) DESC, id DESC
       LIMIT 1`
    )
    .first<CorpusVersionRow>();
}

corpus.get("/", async (c) => {
  const latest = await getLatestCorpusVersion(c.env.DB);
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
  const now = new Date().toISOString();
  const latest = await getLatestCorpusVersion(c.env.DB);

  if (!latest) {
    await c.env.DB.prepare(
      `INSERT INTO corpus_versions (content_md, label, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    ).bind(contentMd, "corpus", now, now).run();

    const created = await getLatestCorpusVersion(c.env.DB);
    return c.json({
      content_md: created?.content_md ?? contentMd,
      version_id: created?.id ?? null,
      updated_at: created?.updated_at ?? now,
    });
  }

  await c.env.DB.prepare(
    `UPDATE corpus_versions
     SET content_md = ?, updated_at = ?
     WHERE id = ?`
  ).bind(contentMd, now, latest.id).run();

  return c.json({
    content_md: contentMd,
    version_id: latest.id,
    updated_at: now,
    label: latest.label,
  });
});

corpus.get("/versions", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT id, label, created_at, updated_at
     FROM corpus_versions
     ORDER BY datetime(updated_at) DESC, id DESC`
  ).all<Omit<CorpusVersionRow, "content_md">>();

  return c.json({ versions: result.results ?? [] });
});

corpus.get("/versions/:id", async (c) => {
  const { id } = c.req.param();
  const version = await c.env.DB.prepare(
    `SELECT id, content_md, label, created_at, updated_at
     FROM corpus_versions
     WHERE id = ?`
  ).bind(id).first<CorpusVersionRow>();

  if (!version) {
    return c.json({ error: "Version not found" }, 404);
  }

  return c.json(version);
});

corpus.post("/snapshot", async (c) => {
  const body =
    (await c.req.json<{ label?: string }>().catch(() => null)) ?? {};
  const latest = await getLatestCorpusVersion(c.env.DB);
  if (!latest) {
    return c.json({ error: "No corpus available" }, 400);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO corpus_versions (content_md, label, created_at, updated_at)
     VALUES (?, ?, ?, ?)`
  ).bind(
    latest.content_md,
    body.label?.trim() || `snapshot ${now.slice(0, 16)}`,
    now,
    now
  ).run();

  const created = await getLatestCorpusVersion(c.env.DB);
  return c.json({ version_id: created?.id ?? null });
});

export default corpus;
