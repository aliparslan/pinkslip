import { Hono } from "hono";
import { requireAdmin } from "../auth";
import type { Env, Variables, JobRow, CompanySourceType } from "../types";
import { getAdapter } from "../ats";
import { loadPreferencesForPoll } from "../poller";
import { scoreJob } from "../scoring";
import type { JobListing } from "../adapters/types";
import {
  ensureUserJobMatchesReady,
  ensureUserJobScores,
  invalidateJobScores,
  rescoreJobForMatchedUsers,
} from "../user-job-scores";
import { recordProductEvent } from "../product-events";
import { ensureEligibleJobs } from "../job-scope";
import { isUsJobLocation } from "../us-jobs";
import { LOCATION_OPTIONS } from "../../shared/search-profile";

const jobs = new Hono<{ Bindings: Env; Variables: Variables }>();
jobs.use("/*", async (c, next) => {
  await ensureEligibleJobs(c.env.DB);
  await next();
});
const JOB_LIST_FIELDS = `
  j.id,
  j.company_id,
  j.external_id,
  j.title,
  j.url,
  j.location,
  j.department,
  j.posted_at,
  j.first_seen_at,
  COALESCE(us.score, j.score) AS score,
  COALESCE(us.title_score, j.title_score) AS title_score,
  COALESCE(us.yoe_score, j.yoe_score) AS yoe_score,
  COALESCE(us.location_score, j.location_score) AS location_score,
  COALESCE(us.department_score, j.department_score) AS department_score,
  COALESCE(us.recency_score, j.recency_score) AS recency_score,
  COALESCE(us.reasons_json, '[]') AS match_reasons_json,
  us.scorer_version,
  CAST(
    EXISTS(
      SELECT 1
      FROM dismissed_jobs d
      WHERE d.user_id = ? AND d.job_id = j.id
  ) AS INTEGER
  ) AS dismissed,
  NULL AS description,
  j.salary,
  j.closed_at,
  CAST(
    EXISTS(
      SELECT 1
      FROM saved_jobs s
      WHERE s.user_id = ? AND s.job_id = j.id
    ) AS INTEGER
  ) AS saved,
  CAST(
    EXISTS(
      SELECT 1
      FROM applications a
      WHERE a.user_id = ? AND a.job_id = j.id
    ) AS INTEGER
  ) AS applied,
  c.name AS company_name,
  c.website AS company_domain
`;

const JOB_DETAIL_FIELDS = `
  j.id,
  j.company_id,
  j.external_id,
  j.title,
  j.url,
  j.location,
  j.department,
  j.posted_at,
  j.first_seen_at,
  COALESCE(us.score, j.score) AS score,
  COALESCE(us.title_score, j.title_score) AS title_score,
  COALESCE(us.yoe_score, j.yoe_score) AS yoe_score,
  COALESCE(us.location_score, j.location_score) AS location_score,
  COALESCE(us.department_score, j.department_score) AS department_score,
  COALESCE(us.recency_score, j.recency_score) AS recency_score,
  COALESCE(us.reasons_json, '[]') AS match_reasons_json,
  us.scorer_version,
  CAST(
    EXISTS(
      SELECT 1
      FROM dismissed_jobs d
      WHERE d.user_id = ? AND d.job_id = j.id
    ) AS INTEGER
  ) AS dismissed,
  j.description,
  j.salary,
  j.closed_at,
  CAST(
    EXISTS(
      SELECT 1
      FROM saved_jobs s
      WHERE s.user_id = ? AND s.job_id = j.id
    ) AS INTEGER
  ) AS saved,
  CAST(
    EXISTS(
      SELECT 1
      FROM applications a
      WHERE a.user_id = ? AND a.job_id = j.id
    ) AS INTEGER
  ) AS applied,
  c.name AS company_name,
  c.website AS company_domain
`;

type JobListRow = JobRow & {
  company_name: string;
  company_domain: string;
  saved: number;
  applied: number;
  applied_at?: string;
  match_reasons_json: string;
  match_reasons?: string[];
  scorer_version?: string | null;
};

function serializeJob(row: JobListRow) {
  let matchReasons: string[] = [];
  try {
    const parsed = JSON.parse(row.match_reasons_json);
    matchReasons = Array.isArray(parsed)
      ? parsed.filter((reason): reason is string => typeof reason === "string")
      : [];
  } catch {
    matchReasons = [];
  }
  const { match_reasons_json: _, ...job } = row;
  return { ...job, match_reasons: matchReasons };
}

const LOCATION_ALIASES: Record<string, string[]> = {
  Remote: ["remote"],
  // Metro ids from the shared catalog — what the app sends. Covers every
  // onboarding metro (Seattle, Austin, LA, …), not just the original six.
  ...Object.fromEntries(
    LOCATION_OPTIONS.map((option) => [option.id, [...option.aliases]])
  ),
  // Legacy display-label keys, kept so older clients' saved filters still work.
  NYC: ["new york", "nyc", "brooklyn"],
  "SF Bay Area": [
    "san francisco",
    "bay area",
    "sf",
    "palo alto",
    "mountain view",
    "sunnyvale",
    "san jose",
    "menlo park",
    "redwood city",
  ],
  Chicago: ["chicago"],
  Boston: ["boston", "cambridge, ma"],
  DC: ["washington", "d.c.", "dc", "arlington, va", "mclean, va"],
};

function parseListParam(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildLocationFilter(location: string | undefined, locations: string | undefined) {
  const selected = parseListParam(locations ?? location).filter((item) => item !== "All");
  if (selected.length === 0) {
    return null;
  }

  const aliases = selected.flatMap((item) => LOCATION_ALIASES[item] ?? [item.toLowerCase()]);
  return {
    clause: `(${aliases
      .map(() => "LOWER(COALESCE(j.location, '')) LIKE ?")
      .join(" OR ")})`,
    bindings: aliases.map((alias) => `%${alias.toLowerCase()}%`),
  };
}

function parseMoneyToken(token: string): number | null {
  const hasThousandsSuffix = /k\b/i.test(token);
  const numeric = Number.parseFloat(token.replace(/,/g, "").replace(/k\b/i, ""));
  if (!Number.isFinite(numeric)) return null;
  return hasThousandsSuffix || numeric < 1000 ? Math.round(numeric * 1000) : Math.round(numeric);
}

function parseSalaryRange(salary: string | null): { min: number; max: number } | null {
  if (!salary) return null;
  if (/(?:\/|\b)(?:hr|hour|hourly)\b/i.test(salary)) return null;

  const matches = salary.match(/(?:\$|USD\s*)?\s*\d[\d,]*(?:\.\d+)?\s*k?/gi) ?? [];
  const values = matches
    .map(parseMoneyToken)
    .filter((value): value is number => value !== null && value >= 1000);

  if (values.length === 0) return null;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function extractRequiredYoe(row: Pick<JobListRow, "title" | "description">): number | null {
  const text = `${row.title ?? ""}\n${row.description ?? ""}`.toLowerCase();
  if (/\b(?:junior|new grad|new graduate|entry level|early career)\b/.test(text)) return 0;
  if (/\b(?:senior|sr\.?|staff|principal|lead)\b/.test(text)) return 5;

  const rangeMatch = text.match(/\b(\d{1,2})\s*(?:\+|–|-|to)\s*(\d{1,2})?\s*(?:years?|yrs?)\b(?!\s*ago)/);
  if (rangeMatch) return Number.parseInt(rangeMatch[1], 10);

  // Require a requirement cue so a stray "5 years ago" doesn't read as a YOE bar.
  const qualified =
    text.match(/\b(?:at least|minimum of|minimum|min\.?|requires?|require)\s+(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/)
    ?? text.match(/\b(\d{1,2})\s*\+\s*(?:years?|yrs?)\b(?!\s*ago)/)
    ?? text.match(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+|related\s+|work\s+|hands-on\s+)?experience\b/);
  if (qualified) return Number.parseInt(qualified[1], 10);

  return null;
}

function passesAdvancedFilters(
  row: JobListRow,
  filters: {
    minSalary: number | null;
    maxSalary: number | null;
    maxYoe: number | null;
  }
): boolean {
  if (filters.minSalary !== null || filters.maxSalary !== null) {
    const range = parseSalaryRange(row.salary);
    if (!range) return false;
    if (filters.minSalary !== null && range.max < filters.minSalary) return false;
    if (filters.maxSalary !== null && range.min > filters.maxSalary) return false;
  }

  if (filters.maxYoe !== null) {
    const requiredYoe = extractRequiredYoe(row);
    if (requiredYoe !== null && requiredYoe > filters.maxYoe) return false;
  }

  return true;
}

// GET / — List jobs
jobs.get("/", async (c) => {
  const userId = c.get("userId");
  await ensureUserJobMatchesReady(c.env.DB, userId);
  const {
    min_score,
    company_id,
    dismissed,
    limit,
    offset,
    location,
    locations,
    saved,
    q,
    min_salary,
    max_salary,
    max_yoe,
  } = c.req.query();

  const parsedLimit = parseInt(limit ?? "300", 10);
  const parsedOffset = parseInt(offset ?? "0", 10);
  const limitVal = Math.max(1, Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 300, 1000));
  const offsetVal = Math.max(0, Number.isFinite(parsedOffset) ? parsedOffset : 0);
  const minSalary = min_salary !== undefined ? parseInt(min_salary, 10) : Number.NaN;
  const maxSalary = max_salary !== undefined ? parseInt(max_salary, 10) : Number.NaN;
  const maxYoe = max_yoe !== undefined ? parseInt(max_yoe, 10) : Number.NaN;
  const advancedFilters = {
    minSalary: Number.isFinite(minSalary) ? minSalary : null,
    maxSalary: Number.isFinite(maxSalary) ? maxSalary : null,
    maxYoe: Number.isFinite(maxYoe) ? maxYoe : null,
  };
  const hasAdvancedFilters = Object.values(advancedFilters).some((value) => value !== null);

  const conditions: string[] = [
    "c.enabled = 1",
    "j.closed_at IS NULL",
    `NOT EXISTS (
      SELECT 1 FROM user_blocked_companies ubc
      WHERE ubc.user_id = ? AND ubc.company_id = j.company_id
    )`,
  ];
  const bindings: (string | number)[] = [userId, userId, userId, userId];
  bindings.push(userId);

  // Default excludes dismissed unless explicitly requested
  if (dismissed === "true") {
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM dismissed_jobs d
        WHERE d.user_id = ? AND d.job_id = j.id
      )`
    );
    bindings.push(userId);
  } else if (dismissed === undefined || dismissed === "false") {
    conditions.push(
      `NOT EXISTS (
        SELECT 1
        FROM dismissed_jobs d
        WHERE d.user_id = ? AND d.job_id = j.id
      )`
    );
    bindings.push(userId);
  }
  // dismissed=all → no filter

  if (company_id !== undefined) {
    conditions.push("j.company_id = ?");
    bindings.push(company_id);
  }

  if (q !== undefined && q.trim() !== "") {
    const term = `%${q.trim().toLowerCase()}%`;
    conditions.push(
      `(LOWER(j.title) LIKE ? OR LOWER(c.name) LIKE ?)`
    );
    bindings.push(term, term);
  }

  if (saved === "true") {
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM saved_jobs s
        WHERE s.user_id = ? AND s.job_id = j.id
      )`
    );
    bindings.push(userId);
  }

  const locationFilter = buildLocationFilter(location, locations);
  if (locationFilter) {
    conditions.push(locationFilter.clause);
    bindings.push(...locationFilter.bindings);
  }

  if (min_score !== undefined) {
    const minScoreVal = parseFloat(min_score);
    if (Number.isFinite(minScoreVal)) {
      conditions.push("us.score >= ?");
      bindings.push(minScoreVal);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  // The feed has one implicit order: the newest posting date first. Some ATS
  // feeds omit or mangle posted_at, so fall back to the stable ingestion time.
  // first_seen_at and id make pagination deterministic when dates match.
  const orderBy = "COALESCE(datetime(j.posted_at), datetime(j.first_seen_at)) DESC, j.first_seen_at DESC, j.id DESC";

  const sql = `
    SELECT ${hasAdvancedFilters ? JOB_DETAIL_FIELDS : JOB_LIST_FIELDS}
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    JOIN user_job_matches us ON us.job_id = j.id AND us.user_id = ?
    ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const queryLimit = hasAdvancedFilters
    ? 1000
    : limitVal + 1;
  const queryOffset = hasAdvancedFilters ? 0 : offsetVal;
  bindings.push(queryLimit, queryOffset);

  const stmt = c.env.DB.prepare(sql);
  const result = await stmt.bind(...bindings).all<JobListRow>();
  const filteredRows = hasAdvancedFilters
    ? (result.results ?? []).filter((row) => passesAdvancedFilters(row, advancedFilters))
    : (result.results ?? []);
  const rows = hasAdvancedFilters
    ? filteredRows.slice(offsetVal, offsetVal + limitVal)
    : filteredRows.slice(0, limitVal);

  return c.json({
    jobs: rows.map(serializeJob),
    meta: {
      total: filteredRows.length,
      count: rows.length,
      has_more: hasAdvancedFilters
        ? offsetVal + rows.length < filteredRows.length || (result.results ?? []).length === queryLimit
        : filteredRows.length > limitVal,
      next_offset: offsetVal + rows.length,
    },
  });
});

async function backfillJobContent(
  db: D1Database,
  job: {
    id: string;
    external_id: string;
    title: string;
    url: string;
    location: string;
    department: string | null;
    posted_at: string | null;
    description: string | null;
    salary: string | null;
    ats_type: string;
    source_type: string | null;
    ats_slug: string;
  },
  viewerUserId?: string
) {
  const adapter = getAdapter((job.source_type ?? job.ats_type) as CompanySourceType);
  if (!adapter) return;

  const content = await adapter.fetchJobContent(job.ats_slug, job.external_id, job.url);
  if (!content.description && !content.salary && !content.location && !content.postedAt) return;
  if (content.location && !isUsJobLocation(content.location)) {
    await db.prepare(
      "UPDATE jobs SET closed_at = ? WHERE id = ? AND closed_at IS NULL"
    ).bind(new Date().toISOString(), job.id).run();
    await invalidateJobScores(db, job.id);
    return;
  }

  const nextDescription = content.description ?? job.description;
  const nextSalary = content.salary ?? job.salary;
  const nextLocation = content.location ?? job.location;
  const nextPostedAt = content.postedAt ?? job.posted_at;
  const prefs = await loadPreferencesForPoll(db);
  const breakdown = scoreJob(
    {
      externalId: job.external_id,
      title: job.title,
      url: job.url,
      location: nextLocation,
      department: job.department,
      postedAt: nextPostedAt,
      description: nextDescription,
      salary: nextSalary,
    } satisfies JobListing,
    prefs
  );

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (content.description) {
    sets.push("description = ?");
    vals.push(content.description);
  }
  if (content.salary) {
    sets.push("salary = ?");
    vals.push(content.salary);
  }
  if (content.location) {
    sets.push("location = ?");
    vals.push(content.location);
  }
  if (content.postedAt) {
    sets.push("posted_at = ?");
    vals.push(content.postedAt);
  }
  sets.push("score = ?", "title_score = ?", "yoe_score = ?", "location_score = ?", "department_score = ?", "recency_score = ?");
  vals.push(
    breakdown.score,
    breakdown.title_score,
    breakdown.yoe_score,
    breakdown.location_score,
    breakdown.department_score,
    breakdown.recency_score
  );
  vals.push(job.id);
  await db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  // Re-score (don't blanket-invalidate) so the job keeps its place in the feeds
  // of users it still matches, with an updated score from the new content.
  await rescoreJobForMatchedUsers(db, job.id, viewerUserId);
}

// GET /:id — Job detail (backfills description on demand)
jobs.get("/:id", async (c) => {
  const { id } = c.req.param();
  const userId = c.get("userId");
  const db = c.env.DB;
  await ensureUserJobScores(db, userId, [id]);

  const result = await db.prepare(
    `SELECT ${JOB_DETAIL_FIELDS}, c.ats_type, c.source_type, c.ats_slug
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     LEFT JOIN user_job_matches us ON us.job_id = j.id AND us.user_id = ?
     WHERE j.id = ?`
  )
    .bind(userId, userId, userId, userId, id)
    .first<JobListRow & { ats_type: string; source_type: string | null; ats_slug: string }>();

  if (!result) {
    return c.json({ error: "Not found" }, 404);
  }

  let contentPending = false;
  if (result.description === null) {
    contentPending = true;
    c.executionCtx.waitUntil(
      backfillJobContent(db, result, userId).catch((error) => {
        console.error("Description backfill failed:", error);
      })
    );
  }

  return c.json({
    ...serializeJob(result),
    content_pending: contentPending,
    content_refresh_after_ms: contentPending ? 1500 : null,
  });
});

// PATCH /:id — Update job
jobs.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();
  const body = await c.req.json<{ dismissed?: boolean; saved?: boolean; applied?: boolean }>();
  await ensureUserJobScores(c.env.DB, userId, [id]);

  if (body.dismissed === undefined && body.saved === undefined && body.applied === undefined) {
    return c.json({ error: "No fields to update" }, 400);
  }

  if (body.dismissed !== undefined) {
    if (body.dismissed) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO dismissed_jobs (user_id, job_id, dismissed_at)
         VALUES (?, ?, ?)`
      ).bind(userId, id, new Date().toISOString()).run();
    } else {
      await c.env.DB.prepare(
        `DELETE FROM dismissed_jobs WHERE user_id = ? AND job_id = ?`
      ).bind(userId, id).run();
    }
    await recordProductEvent(c.env.DB, {
      userId,
      sessionId: c.get("sessionId"),
      name: body.dismissed ? "job_dismissed" : "job_restored",
      entityType: "job",
      entityId: id,
    }).catch(() => undefined);
  }

  // Sync saved_jobs table (scoped to user)
  if (body.saved !== undefined) {
    if (body.saved) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO saved_jobs (user_id, job_id) VALUES (?, ?)`
      ).bind(userId, id).run();
    } else {
      await c.env.DB.prepare(
        `DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?`
      ).bind(userId, id).run();
    }
    await recordProductEvent(c.env.DB, {
      userId,
      sessionId: c.get("sessionId"),
      name: body.saved ? "job_saved" : "job_unsaved",
      entityType: "job",
      entityId: id,
    }).catch(() => undefined);
  }

  if (body.applied !== undefined) {
    if (body.applied) {
      const now = new Date().toISOString();
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO applications (
           id, job_id, company_name, title, stage, next, url, created_at, updated_at, user_id
         )
         SELECT ?, j.id, c.name, j.title, 'Applied', '', COALESCE(j.url, ''), ?, ?, ?
         FROM jobs j
         JOIN companies c ON c.id = j.company_id
         WHERE j.id = ?`
      ).bind(crypto.randomUUID(), now, now, userId, id).run();
      await c.env.DB.prepare(
        `UPDATE applications
         SET company_name = (SELECT c.name FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = ?),
             title = (SELECT title FROM jobs WHERE id = ?),
             stage = 'Applied',
             next = '',
             url = COALESCE((SELECT url FROM jobs WHERE id = ?), ''),
             updated_at = ?
         WHERE user_id = ? AND job_id = ?`
      ).bind(id, id, id, now, userId, id).run();
    } else {
      await c.env.DB.prepare(
        `DELETE FROM applications WHERE user_id = ? AND job_id = ?`
      ).bind(userId, id).run();
    }
    await recordProductEvent(c.env.DB, {
      userId,
      sessionId: c.get("sessionId"),
      name: body.applied ? "application_added" : "application_removed",
      entityType: "job",
      entityId: id,
    }).catch(() => undefined);
  }

  const updated = await c.env.DB.prepare(
    `SELECT ${JOB_DETAIL_FIELDS}
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     LEFT JOIN user_job_matches us ON us.job_id = j.id AND us.user_id = ?
     WHERE j.id = ? AND j.closed_at IS NULL`
  )
    .bind(userId, userId, userId, userId, id)
    .first<JobListRow>();

  if (!updated) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(serializeJob(updated));
});

// DELETE /:id/block — Permanently block a job globally (never returns from polls)
jobs.delete("/:id/block", requireAdmin, async (c) => {
  const { id } = c.req.param();

  const job = await c.env.DB.prepare(
    "SELECT id, company_id, external_id, title FROM jobs WHERE id = ?"
  )
    .bind(id)
    .first<{ id: string; company_id: string; external_id: string; title: string }>();

  if (!job) {
    return c.json({ error: "Not found" }, 404);
  }

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO blocked_jobs (id, company_id, external_id, title, blocked_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), job.company_id, job.external_id, job.title, new Date().toISOString())
    .run();

  await c.env.DB.prepare("DELETE FROM jobs WHERE id = ?").bind(id).run();

  return c.body(null, 204);
});

// GET /saved — List saved jobs for current user
jobs.get("/saved/list", async (c) => {
  const userId = c.get("userId");
  await ensureUserJobScores(c.env.DB, userId);
  const result = await c.env.DB.prepare(
    `SELECT ${JOB_LIST_FIELDS}
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     JOIN saved_jobs s ON s.job_id = j.id AND s.user_id = ?
     LEFT JOIN user_job_matches us ON us.job_id = j.id AND us.user_id = ?
     WHERE j.closed_at IS NULL
       AND NOT EXISTS (
       SELECT 1 FROM user_blocked_companies ubc
       WHERE ubc.user_id = ? AND ubc.company_id = j.company_id
     )
     ORDER BY datetime(COALESCE(j.posted_at, j.first_seen_at)) DESC, j.first_seen_at DESC`
  ).bind(userId, userId, userId, userId, userId, userId).all<JobListRow>();

  return c.json({ jobs: (result.results ?? []).map(serializeJob) });
});

// GET /applied/list — Lightweight application history. This intentionally
// ignores the legacy pipeline stages; an application is simply present or not.
jobs.get("/applied/list", async (c) => {
  const userId = c.get("userId");
  await ensureUserJobScores(c.env.DB, userId);
  const result = await c.env.DB.prepare(
    `SELECT ${JOB_LIST_FIELDS}, a.created_at AS applied_at
     FROM applications a
     JOIN jobs j ON j.id = a.job_id
     JOIN companies c ON j.company_id = c.id
     LEFT JOIN user_job_matches us ON us.job_id = j.id AND us.user_id = ?
     WHERE a.user_id = ?
     ORDER BY datetime(a.created_at) DESC, a.id DESC`
  ).bind(userId, userId, userId, userId, userId).all<JobListRow>();

  return c.json({ jobs: (result.results ?? []).map(serializeJob) });
});

export default jobs;
