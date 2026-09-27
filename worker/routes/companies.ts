import { Hono } from "hono";
import { isAdminUser, requireAdmin } from "../auth";
import type { Env, CompanyRow, Variables } from "../types";
import {
  pollCompany,
  sendNotificationsForJobs,
  shouldQueueNotificationsForCompany,
  type NewJobMeta,
} from "../poller";
import { matchJobsForAllProfiles } from "../user-job-matches";
import { loadCustomTitles } from "../job-scope";
import {
  defaultCompanyPollTier,
  getCompanySourceType,
  normalizeCompanySource,
  verifyCompanySource,
} from "../ats";
import {
  isPollableCompanySourceType,
  type PollableCompanySourceType,
} from "../../shared/company-sources";

const companies = new Hono<{ Bindings: Env; Variables: Variables }>();

export interface ManualPollIndexDependencies {
  match: typeof matchJobsForAllProfiles;
  notify: typeof sendNotificationsForJobs;
}

const manualPollIndexDependencies: ManualPollIndexDependencies = {
  match: matchJobsForAllProfiles,
  notify: sendNotificationsForJobs,
};

/**
 * Make manually imported jobs available in personalized feeds immediately.
 *
 * A disabled company is in backfill/verification mode, not invisible indexing
 * mode: its matches remain hidden behind `companies.enabled` until activation.
 * Notification candidates are the only derived state that must wait until the
 * source is enabled, otherwise a historical catalog import becomes a push
 * burst.
 */
export async function indexManualPollJobs(
  db: D1Database,
  env: Env,
  company: Pick<CompanyRow, "enabled">,
  newJobs: NewJobMeta[],
  dependencies: ManualPollIndexDependencies = manualPollIndexDependencies
): Promise<number> {
  await dependencies.match(
    db,
    newJobs.map((job) => ({ jobId: job.jobId, listing: job.listing }))
  );
  if (!shouldQueueNotificationsForCompany(company)) return 0;
  return dependencies.notify(db, env, newJobs);
}

function assertPollableSourceType(
  value: unknown
): asserts value is PollableCompanySourceType {
  if (!isPollableCompanySourceType(value)) {
    throw new Error(`Unsupported polling source "${value}"`);
  }
}

function storedAtsType(sourceType: PollableCompanySourceType): CompanyRow["ats_type"] {
  return ["greenhouse", "lever", "ashby"].includes(sourceType)
    ? sourceType as CompanyRow["ats_type"]
    : "custom";
}

function serializeCompany<T extends CompanyRow>(company: T) {
  return { ...company, ats_type: getCompanySourceType(company) };
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
    ats_type: unknown;
    ats_slug: string;
  }>();

  try {
    assertPollableSourceType(body.ats_type);
    const atsSlug = normalizeCompanySource(body.ats_type, body.ats_slug);
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
    ats_type: unknown;
    ats_slug: string;
    website?: string;
  }>();

  const name = body.name?.trim() ?? "";
  let atsSlug: string;
  try {
    assertPollableSourceType(body.ats_type);
    atsSlug = normalizeCompanySource(body.ats_type, body.ats_slug);
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
      `INSERT INTO companies (
         id, name, ats_type, source_type, ats_slug, website, enabled, poll_tier, added_at
       ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
      .bind(
        id,
        name,
        storedAtsType(body.ats_type),
        body.ats_type,
        atsSlug,
        body.website?.trim() || null,
        defaultCompanyPollTier(body.ats_type),
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
    ats_type?: unknown;
    website?: string;
  }>();

  const current = await c.env.DB.prepare(
    "SELECT * FROM companies WHERE id = ?"
  )
    .bind(id)
    .first<CompanyRow>();
  if (!current) return c.json({ error: "Not found" }, 404);

  let requestedAtsType: PollableCompanySourceType | undefined;
  try {
    if (body.ats_type !== undefined) {
      assertPollableSourceType(body.ats_type);
      requestedAtsType = body.ats_type;
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid ATS source" }, 400);
  }

  const currentSourceType = getCompanySourceType(current);
  const nextAtsType = requestedAtsType ?? currentSourceType;
  let nextAtsSlug = current.ats_slug;
  if (body.ats_slug !== undefined || body.ats_type !== undefined) {
    try {
      assertPollableSourceType(nextAtsType);
      nextAtsSlug = normalizeCompanySource(nextAtsType, body.ats_slug ?? current.ats_slug);
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

  if (requestedAtsType !== undefined) {
    setClauses.push("ats_type = ?", "source_type = ?");
    bindings.push(storedAtsType(requestedAtsType), requestedAtsType);
    if (requestedAtsType !== currentSourceType) {
      setClauses.push("poll_tier = ?");
      bindings.push(defaultCompanyPollTier(requestedAtsType));
    }
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

  const fullBackfill = c.req.query("backfill") === "true";
  if (fullBackfill && shouldQueueNotificationsForCompany(company)) {
    return c.json({
      error: "Full catalog backfill is only allowed while the company is disabled",
    }, 400);
  }

  const now = new Date().toISOString();
  try {
    const customTitles = await loadCustomTitles(db);
    const newJobs = await pollCompany(company, db, customTitles, { fullBackfill });
    const notificationsSent = await indexManualPollJobs(
      db,
      c.env,
      company,
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
