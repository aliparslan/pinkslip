import { Hono } from "hono";
import type { Env, ProfileRow, ResumeProfile } from "../types";

const profile = new Hono<{ Bindings: Env }>();

const EMPTY_PROFILE: ResumeProfile = {
  contact: { name: "", email: "", phone: "", location: "", linkedin: "", github: "", website: "" },
  experience: [],
  education: [],
  projects: [],
  skills: [],
  optionalSections: [],
};

async function ensureProfileTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`
  ).run();
}

export async function getProfile(db: D1Database): Promise<{ data: ResumeProfile; id: number | null; updated_at: string | null }> {
  await ensureProfileTable(db);
  const row = await db
    .prepare(`SELECT id, data, updated_at FROM profile ORDER BY id DESC LIMIT 1`)
    .first<ProfileRow>();

  if (!row) {
    return { data: EMPTY_PROFILE, id: null, updated_at: null };
  }

  try {
    const parsed = JSON.parse(row.data) as ResumeProfile;
    return { data: { ...EMPTY_PROFILE, ...parsed }, id: row.id, updated_at: row.updated_at };
  } catch {
    return { data: EMPTY_PROFILE, id: row.id, updated_at: row.updated_at };
  }
}

profile.get("/", async (c) => {
  const result = await getProfile(c.env.DB);
  return c.json(result);
});

profile.put("/", async (c) => {
  const body = await c.req.json<{ data?: ResumeProfile }>().catch(() => null);
  if (!body?.data) {
    return c.json({ error: "Missing data field" }, 400);
  }

  await ensureProfileTable(c.env.DB);
  const now = new Date().toISOString();
  const dataJson = JSON.stringify(body.data);

  const existing = await c.env.DB
    .prepare(`SELECT id FROM profile ORDER BY id DESC LIMIT 1`)
    .first<{ id: number }>();

  if (existing) {
    await c.env.DB
      .prepare(`UPDATE profile SET data = ?, updated_at = ? WHERE id = ?`)
      .bind(dataJson, now, existing.id)
      .run();
    return c.json({ data: body.data, id: existing.id, updated_at: now });
  }

  await c.env.DB
    .prepare(`INSERT INTO profile (data, created_at, updated_at) VALUES (?, ?, ?)`)
    .bind(dataJson, now, now)
    .run();

  const created = await c.env.DB
    .prepare(`SELECT id FROM profile ORDER BY id DESC LIMIT 1`)
    .first<{ id: number }>();

  return c.json({ data: body.data, id: created?.id ?? null, updated_at: now });
});

export default profile;
