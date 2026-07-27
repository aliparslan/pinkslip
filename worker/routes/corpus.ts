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
    return c.json({ content_md: "", updated_at: null });
  }

  return c.json({
    content_md: latest.content_md,
    updated_at: latest.updated_at,
  });
});

corpus.put("/", async (c) => {
  const userId = c.get("userId");
  const body =
    (await c.req.json<{ content_md?: string }>().catch(() => null)) ?? {};
  const contentMd = body.content_md?.trim() ?? "";
  if (contentMd.length > 200_000) {
    return c.json({ error: "Corpus content is capped at 200,000 characters" }, 413);
  }
  const latest = await getLatestCorpusVersion(c.env.DB, userId);

  // Unchanged content avoids a needless write when autosave fires on blur.
  if (latest && latest.content_md === contentMd) {
    return c.json({
      content_md: latest.content_md,
      updated_at: latest.updated_at,
    });
  }

  const now = new Date().toISOString();
  if (latest) {
    // Master story is one working document. Keep the row as an implementation
    // detail instead of exposing or accumulating user-facing history.
    await c.env.DB.prepare(
      "UPDATE corpus_versions SET content_md = ?, label = 'corpus', updated_at = ? WHERE id = ? AND user_id = ?"
    ).bind(contentMd, now, latest.id, userId).run();
  } else {
    await copyCorpusVersion(c.env.DB, userId, contentMd, "corpus");
  }

  const created = await getLatestCorpusVersion(c.env.DB, userId);
  return c.json({
    content_md: created?.content_md ?? contentMd,
    updated_at: created?.updated_at ?? now,
  });
});

export default corpus;
