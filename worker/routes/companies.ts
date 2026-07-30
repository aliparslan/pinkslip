import { Hono } from "hono";
import { isAdminUser, requireAdmin } from "../auth";
import type { Env, CompanyRow, CompanySourceType, Variables } from "../types";
import { loadPreferencesForPoll, pollCompany, sendNotificationsForJobs } from "../poller";
import { matchJobsForAllProfiles } from "../user-job-scores";
import { verifyCompanySource } from "../ats";
import { normalizeGemSource } from "../adapters/gem";
import { normalizeRipplingSource } from "../adapters/rippling";
import { normalizeSmartRecruitersSource } from "../adapters/smartrecruiters";
import { normalizeWorkdaySource } from "../adapters/workday";
import { normalizeYcSource } from "../adapters/yc";

const companies = new Hono<{ Bindings: Env; Variables: Variables }>();

const KNOWN_SOURCE_TYPES = new Set<CompanySourceType>([
  "greenhouse", "lever", "ashby", "workday", "rippling", "gem", "smartrecruiters", "yc", "custom",
]);

function assertKnownSourceType(value: string): asserts value is CompanySourceType {
  if (!KNOWN_SOURCE_TYPES.has(value as CompanySourceType)) {
    throw new Error(`Unknown ATS type "${value}"`);
  }
}

function effectiveSourceType(company: Pick<CompanyRow, "ats_type" | "source_type">) {
  return company.source_type ?? company.ats_type;
}

function storedAtsType(sourceType: CompanySourceType): CompanyRow["ats_type"] {
  return ["greenhouse", "lever", "ashby"].includes(sourceType)
    ? sourceType as CompanyRow["ats_type"]
    : "custom";
}

function normalizeAtsSlug(sourceType: CompanySourceType, slug: string): string {
  switch (sourceType) {
    case "workday":
      return normalizeWorkdaySource(slug);
    case "rippling":
      return normalizeRipplingSource(slug);
    case "gem":
      return normalizeGemSource(slug);
    case "smartrecruiters":
      return normalizeSmartRecruitersSource(slug);
    case "yc":
      return normalizeYcSource(slug);
    case "greenhouse":
    case "lever":
    case "ashby": {
      const trimmed = slug.trim();
      if (/\s/.test(trimmed) || /:\/\//.test(trimmed) || trimmed.includes("/")) {
        throw new Error(`Enter just the ${sourceType} board token, not a full URL`);
      }
      return trimmed;
    }
    default:
      return slug.trim();
  }
}

function serializeCompany<T extends CompanyRow>(company: T) {
  return { ...company, ats_type: effectiveSourceType(company) };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique|constraint/i.test(error.message);
}

companies.get("/", async (c) => {
  const { ats_type } = c.req.query();
  const admin = await isAdminUser(
    c.env.DB,
    c.get("userId"),
    c.get("sessionState")
  );

  const conditions: string[] = admin ? [] : ["c.enabled = 1"];
  const bindings: string[] = [];

  if (ats_type !== undefined) {
    conditions.push("COALESCE(c.source_type, c.ats_type) = ?");
    bindings.push(ats_type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await c.env.DB.prepare(
    `SELECT c.*,
       CAST(EXISTS(
         SELECT 1 FROM user_blocked_companies ubc
         WHERE ubc.user_id = ? AND ubc.company_id = c.id
       ) AS INTEGER) AS blocked
     FROM companies c ${where}
     ORDER BY c.name ASC`
  )
    .bind(c.get("userId"), ...bindings)
    .all<CompanyRow>();

  return c.json({ companies: (result.results ?? []).map(serializeCompany) });
});

companies.post("/verify", requireAdmin, async (c) => {
  const body = await c.req.json<{
    ats_type: CompanySourceType;
    ats_slug: string;
  }>();

  try {
    const atsSlug = normalizeAtsSlug(body.ats_type, body.ats_slug);
    const jobs = await verifyCompanySource({
      ats_type: body.ats_type,
      ats_slug: atsSlug,
    });
    return c.json({
      ok: true,
      sample_jobs: jobs.slice(0, 3),
      total_jobs: jobs.length,
    });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : "Verification failed",
    });
  }
});

companies.post("/", requireAdmin, async (c) => {
  const body = await c.req.json<{
    name: string;
    ats_type: CompanySourceType;
    ats_slug: string;
    website?: string;
  }>();

  const name = body.name?.trim() ?? "";
  let atsSlug: string;
  try {
    assertKnownSourceType(body.ats_type);
    atsSlug = normalizeAtsSlug(body.ats_type, body.ats_slug);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid ATS source" }, 400);
  }
  if (!name || !atsSlug) {
    return c.json({ error: "Company name and ATS slug are required" }, 400);
  }

  const duplicate = await c.env.DB.prepare(
    `SELECT id, name FROM companies
     WHERE COALESCE(source_type, ats_type) = ?
       AND LOWER(TRIM(ats_slug)) = LOWER(TRIM(?))
     LIMIT 1`
  )
    .bind(body.ats_type, atsSlug)
    .first<{ id: string; name: string }>();

  if (duplicate) {
    return c.json(
      { error: `${duplicate.name} already uses that ${body.ats_type} source`, code: "duplicate_source" },
      409
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await c.env.DB.prepare(
      `INSERT INTO companies (id, name, ats_type, source_type, ats_slug, website, enabled, added_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    )
      .bind(
        id,
        name,
        storedAtsType(body.ats_type),
        body.ats_type,
        atsSlug,
        body.website?.trim() || null,
        now
      )
      .run();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json({ error: "That company source already exists", code: "duplicate_source" }, 409);
    }
    throw error;
  }

  const created = await c.env.DB.prepare(
    "SELECT * FROM companies WHERE id = ?"
  )
    .bind(id)
    .first<CompanyRow>();

  return c.json(created ? serializeCompany(created) : null, 201);
});

companies.patch("/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{
    enabled?: boolean;
    name?: string;
    ats_slug?: string;
    ats_type?: CompanySourceType;
    website?: string;
  }>();

  const current = await c.env.DB.prepare(
    "SELECT * FROM companies WHERE id = ?"
  )
    .bind(id)
    .first<CompanyRow>();
  if (!current) return c.json({ error: "Not found" }, 404);

  const nextAtsType = body.ats_type ?? effectiveSourceType(current);
  let nextAtsSlug = current.ats_slug;
  if (body.ats_slug !== undefined || body.ats_type !== undefined) {
    try {
      if (body.ats_type !== undefined) assertKnownSourceType(body.ats_type);
      nextAtsSlug = normalizeAtsSlug(nextAtsType as CompanySourceType, body.ats_slug ?? current.ats_slug);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid ATS source" }, 400);
    }
  }

  const setClauses: string[] = [];
  const bindings: (string | number)[] = [];

  if (body.enabled !== undefined) {
    setClauses.push("enabled = ?");
    bindings.push(body.enabled ? 1 : 0);
  }

  if (body.name !== undefined) {
    setClauses.push("name = ?");
    bindings.push(body.name.trim());
  }

  if (body.ats_slug !== undefined) {
    setClauses.push("ats_slug = ?");
    bindings.push(nextAtsSlug);
  }

  if (body.ats_type !== undefined) {
    setClauses.push("ats_type = ?", "source_type = ?");
    bindings.push(storedAtsType(body.ats_type), body.ats_type);
    if (body.ats_slug === undefined && nextAtsSlug !== current.ats_slug) {
      setClauses.push("ats_slug = ?");
      bindings.push(nextAtsSlug);
    }
  }

  if (body.website !== undefined) {
    setClauses.push("website = ?");
    bindings.push(body.website.trim());
  }

  if (setClauses.length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  bindings.push(id);

  if (body.ats_type !== undefined || body.ats_slug !== undefined) {
    const duplicate = await c.env.DB.prepare(
      `SELECT id, name FROM companies
       WHERE id != ?
         AND COALESCE(source_type, ats_type) = ?
         AND LOWER(TRIM(ats_slug)) = LOWER(TRIM(?))
       LIMIT 1`
    )
      .bind(id, nextAtsType, nextAtsSlug)
      .first<{ id: string; name: string }>();

    if (duplicate) {
      return c.json(
        { error: `${duplicate.name} already uses that source`, code: "duplicate_source" },
        409
      );
    }
  }

  try {
    await c.env.DB.prepare(
      `UPDATE companies SET ${setClauses.join(", ")} WHERE id = ?`
    )
      .bind(...bindings)
      .run();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json({ error: "That company source already exists", code: "duplicate_source" }, 409);
    }
    throw error;
  }

  const updated = await c.env.DB.prepare(
    "SELECT * FROM companies WHERE id = ?"
  )
    .bind(id)
    .first<CompanyRow>();

  if (!updated) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(serializeCompany(updated));
});

companies.post("/:id/poll", requireAdmin, async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;

  const company = await db
    .prepare("SELECT * FROM companies WHERE id = ?")
    .bind(id)
    .first<CompanyRow>();

  if (!company) {
    return c.json({ error: "Not found" }, 404);
  }

  const prefs = await loadPreferencesForPoll(db);

  const now = new Date().toISOString();
  try {
    const newJobs = await pollCompany(company, db, prefs);
    await matchJobsForAllProfiles(
      db,
      newJobs.map((job) => ({ jobId: job.jobId, listing: job.listing }))
    );
    const notificationsSent = await sendNotificationsForJobs(
      db,
      c.env,
      newJobs
    );
    await db
      .prepare("UPDATE companies SET last_poll_status = 'ok', last_poll_error = NULL, last_polled_at = ? WHERE id = ?")
      .bind(now, id)
      .run();

    const updated = await db.prepare("SELECT * FROM companies WHERE id = ?").bind(id).first<CompanyRow>();
    return c.json({
      ...(updated ? serializeCompany(updated) : updated),
      new_jobs: newJobs.length,
      notifications_sent: notificationsSent,
    });
  } catch (e: any) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await db
      .prepare("UPDATE companies SET last_poll_status = 'error', last_poll_error = ?, last_polled_at = ? WHERE id = ?")
      .bind(errMsg, now, id)
      .run();

    const updated = await db.prepare("SELECT * FROM companies WHERE id = ?").bind(id).first<CompanyRow>();
    return c.json({
      ...(updated ? serializeCompany(updated) : updated),
      poll_error: errMsg,
    }, 200);
  }
});

companies.delete("/:id", requireAdmin, async (c) => {
  const { id } = c.req.param();

  await c.env.DB.prepare("DELETE FROM companies WHERE id = ?")
    .bind(id)
    .run();

  return c.body(null, 204);
});

export default companies;
