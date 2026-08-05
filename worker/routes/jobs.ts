import { Hono } from "hono";
import { requireAdmin } from "../auth";
import type { Env, Variables, JobRow, CompanySourceType } from "../types";
import { getAdapter } from "../ats";
import {
  ensureUserEvergreenMatchesReady,
  ensureUserJobMatchesReady,
  ensureUserJobMatches,
  invalidateJobMatches,
  MATCHER_VERSION,
  rematchJobForMatchedUsers,
} from "../user-job-matches";
import { recordProductEvent } from "../product-events";
import { ensureEligibleJobs } from "../job-scope";
import { isUsJobLocation } from "../us-jobs";
import {
  LOCATION_OPTIONS,
  MAX_YEARS_EXPERIENCE,
  ROLE_OPTIONS,
  specificRoleSpecialties,
  type RoleId,
} from "../../shared/search-profile";
import { MAX_POSTED_AGE_DAYS } from "../../shared/job-policy";

const jobs = new Hono<{ Bindings: Env; Variables: Variables }>();

export { MAX_POSTED_AGE_DAYS };

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
  j.evergreen,
  CASE
    WHEN jf.min_years = 0 THEN 'No experience required'
    WHEN jf.min_years IS NOT NULL THEN 'Asks for ' || jf.min_years || '+ years'
    WHEN jf.seniority = 'new_grad' THEN 'New-grad role'
    WHEN jf.seniority = 'early_career' THEN 'Early-career role'
    ELSE 'Experience not specified'
  END AS match_fact,
  jf.specialties_json,
  jf.sponsorship_available,
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
  c.website AS company_domain,
  COALESCE(c.source_type, c.ats_type) AS source_type
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
  j.evergreen,
  CASE
    WHEN jf.min_years = 0 THEN 'No experience required'
    WHEN jf.min_years IS NOT NULL THEN 'Asks for ' || jf.min_years || '+ years'
    WHEN jf.seniority = 'new_grad' THEN 'New-grad role'
    WHEN jf.seniority = 'early_career' THEN 'Early-career role'
    ELSE 'Experience not specified'
  END AS match_fact,
  jf.specialties_json,
  jf.sponsorship_available,
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
  c.website AS company_domain,
  COALESCE(c.source_type, c.ats_type) AS source_type
`;

type JobListRow = JobRow & {
  company_name: string;
  company_domain: string;
  saved: number;
  applied: number;
  applied_at?: string;
  match_fact: string;
  specialties_json: string;
  sponsorship_available: number | null;
};

const ROLE_IDS = new Set<string>(ROLE_OPTIONS.map((option) => option.id));

function serializeJob(row: JobListRow) {
  let specialties: string[] = [];
  try {
    const parsed = JSON.parse(row.specialties_json);
    specialties = Array.isArray(parsed)
      ? specificRoleSpecialties(parsed.filter(
          (value): value is RoleId => typeof value === "string" && ROLE_IDS.has(value)
        ))
      : [];
  } catch {
    specialties = [];
  }
  const { specialties_json: _, ...job } = row;
  return {
    ...job,
    specialties,
    sponsorship_available: row.sponsorship_available === null
      ? null
      : row.sponsorship_available === 1,
  };
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
  const normalized = token.replace(/[$,]/g, "").replace(/USD/gi, "").replace(/k\b/i, "").trim();
  const numeric = Number.parseFloat(normalized);
  if (!Number.isFinite(numeric)) return null;
  return hasThousandsSuffix || numeric < 1000 ? Math.round(numeric * 1000) : Math.round(numeric);
}

export function parseSalaryRange(salary: string | null): { min: number; max: number } | null {
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

function passesAdvancedFilters(
  row: JobListRow,
  filters: {
    minSalary: number | null;
    maxSalary: number | null;
  }
): boolean {
  if (filters.minSalary !== null || filters.maxSalary !== null) {
    const range = parseSalaryRange(row.salary);
    if (!range) return false;
    if (filters.minSalary !== null && range.max < filters.minSalary) return false;
    if (filters.maxSalary !== null && range.min > filters.maxSalary) return false;
  }

  return true;
}

jobs.get("/", async (c) => {
  const userId = c.get("userId");
  const {
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
    min_yoe,
    max_yoe,
    posted,
  } = c.req.query();
  if (posted === "evergreen") {
    await ensureUserEvergreenMatchesReady(c.env.DB, userId);
  } else {
    await ensureUserJobMatchesReady(c.env.DB, userId);
  }

  const parsedLimit = parseInt(limit ?? "300", 10);
  const parsedOffset = parseInt(offset ?? "0", 10);
  const limitVal = Math.max(1, Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 300, 1000));
  const offsetVal = Math.max(0, Number.isFinite(parsedOffset) ? parsedOffset : 0);
  const minSalary = min_salary !== undefined ? parseInt(min_salary, 10) : Number.NaN;
  const maxSalary = max_salary !== undefined ? parseInt(max_salary, 10) : Number.NaN;
  const parsedMinYoe = min_yoe !== undefined ? parseInt(min_yoe, 10) : Number.NaN;
  const parsedMaxYoe = max_yoe !== undefined ? parseInt(max_yoe, 10) : Number.NaN;
  const minYoe = Number.isFinite(parsedMinYoe)
    ? Math.max(0, Math.min(MAX_YEARS_EXPERIENCE, parsedMinYoe))
    : null;
  const maxYoe = Number.isFinite(parsedMaxYoe)
    ? Math.max(0, Math.min(MAX_YEARS_EXPERIENCE, parsedMaxYoe))
    : null;
  const advancedFilters = {
    minSalary: Number.isFinite(minSalary) ? minSalary : null,
    maxSalary: Number.isFinite(maxSalary) ? maxSalary : null,
  };
  const hasAdvancedFilters = Object.values(advancedFilters).some((value) => value !== null);

  const conditions: string[] = [
    "c.enabled = 1",
    "j.closed_at IS NULL",
    "us.matcher_version = ?",
    `(jf.min_years IS NULL OR jf.min_years <= ${MAX_YEARS_EXPERIENCE})`,
    "(jrq.job_id IS NULL OR jrq.state = 'approved')",
    `NOT EXISTS (
      SELECT 1 FROM user_blocked_companies ubc
      WHERE ubc.user_id = ? AND ubc.company_id = j.company_id
    )`,
    // A posting with a real date older than 30 days is normally stale. The
    // evergreen flag is the explicit exception for roles the current board
    // still lists, and those remain visible in the normal feed.
    //
    // Undated jobs are deliberately kept. They are not "unknown age" — they come
    // from boards that only list a role while it is genuinely open (startups),
    // so absence of a date is itself a freshness signal.
    //
    // datetime() is REQUIRED here, unlike first_seen_at: posted_at comes from
    // upstream ATS feeds in mixed formats — Greenhouse emits "-04:00" offsets,
    // Ashby "+00:00", Lever/Workday "Z" — so lexicographic comparison would sort
    // local times against UTC times incorrectly.
    `(j.evergreen = 1 OR j.posted_at IS NULL OR datetime(j.posted_at) > datetime('now', '-${MAX_POSTED_AGE_DAYS + 1} days'))`,
  ];
  const bindings: (string | number)[] = [
    userId,
    userId,
    userId,
    userId,
    MATCHER_VERSION,
    userId,
  ];

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

  // `posted=undated` isolates postings from boards that publish no date. Those
  // are overwhelmingly startup roles, which stay listed only while genuinely
  // open — so "no date" is a useful signal to filter *for*, not a gap to hide.
  if (posted === "undated") {
    conditions.push("j.posted_at IS NULL");
  } else if (posted === "evergreen") {
    // The default feed includes these; this mode deliberately narrows to them.
    conditions.push("j.evergreen = 1");
  } else if (posted === "dated") {
    conditions.push("j.posted_at IS NOT NULL AND j.evergreen = 0");
  }

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

  if (maxYoe !== null) {
    conditions.push("(jf.min_years IS NULL OR jf.min_years <= ?)");
    bindings.push(maxYoe);
  }
  if (minYoe !== null && minYoe > 0) {
    conditions.push("jf.min_years IS NOT NULL AND jf.min_years >= ?");
    bindings.push(minYoe);
  }

  const locationFilter = buildLocationFilter(location, locations);
  if (locationFilter) {
    conditions.push(locationFilter.clause);
    bindings.push(...locationFilter.bindings);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  // Feed order is intentionally factual: newest source/detection date first.
  // User eligibility is binary, so there is no hidden score affecting rank.
  const orderBy = "date(COALESCE(j.posted_at, j.first_seen_at)) DESC, j.first_seen_at DESC, j.id DESC";

  const sql = `
    SELECT ${hasAdvancedFilters ? JOB_DETAIL_FIELDS : JOB_LIST_FIELDS}
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    JOIN job_features jf ON jf.job_id = j.id
    JOIN user_job_matches us ON us.job_id = j.id AND us.user_id = ?
    LEFT JOIN job_review_queue jrq ON jrq.job_id = j.id
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
    await invalidateJobMatches(db, job.id);
    return;
  }

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
  vals.push(job.id);
  await db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  // Re-evaluate binary eligibility after content changes.
  await rematchJobForMatchedUsers(db, job.id, viewerUserId);
}

jobs.get("/:id", async (c) => {
  const { id } = c.req.param();
  const userId = c.get("userId");
  const db = c.env.DB;
  await ensureUserJobMatches(db, userId, [id]);

  const result = await db.prepare(
    `SELECT ${JOB_DETAIL_FIELDS}, c.ats_type, c.ats_slug
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     JOIN job_features jf ON jf.job_id = j.id
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

jobs.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();
  const body = await c.req.json<{ dismissed?: boolean; saved?: boolean; applied?: boolean }>();
  await ensureUserJobMatches(c.env.DB, userId, [id]);

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
     JOIN job_features jf ON jf.job_id = j.id
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

// Blocking is global, not per-user: the poller skips blocked external_ids, so the
// job never returns from a later poll of the same company.
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

jobs.get("/saved/list", async (c) => {
  const userId = c.get("userId");
  await ensureUserJobMatches(c.env.DB, userId);
  const result = await c.env.DB.prepare(
    `SELECT ${JOB_LIST_FIELDS}
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     JOIN job_features jf ON jf.job_id = j.id
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

// Intentionally ignores the legacy pipeline stages; an application is simply
// present or not.
jobs.get("/applied/list", async (c) => {
  const userId = c.get("userId");
  await ensureUserJobMatches(c.env.DB, userId);
  const result = await c.env.DB.prepare(
    `SELECT ${JOB_LIST_FIELDS}, a.created_at AS applied_at
     FROM applications a
     JOIN jobs j ON j.id = a.job_id
     JOIN companies c ON j.company_id = c.id
     JOIN job_features jf ON jf.job_id = j.id
     LEFT JOIN user_job_matches us ON us.job_id = j.id AND us.user_id = ?
     WHERE a.user_id = ?
     ORDER BY datetime(a.created_at) DESC, a.id DESC`
  ).bind(userId, userId, userId, userId, userId).all<JobListRow>();

  return c.json({ jobs: (result.results ?? []).map(serializeJob) });
});

export default jobs;
