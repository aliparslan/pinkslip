import { Hono } from "hono";
import type { Env, Variables } from "../types";
import {
  loadUserPreferenceState,
  saveUserPreferenceState,
} from "../user-preferences";
import { ensureUserJobMatchesReady } from "../user-job-scores";
import { ensureEligibleJobs } from "../job-scope";
import { DEFAULT_SEARCH_PROFILE, normalizeSearchProfile } from "../../shared/search-profile";
import { diversifyRankedJobs } from "../job-ranking";

const preferences = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET / — Get all preferences as key-value object
preferences.get("/", async (c) => {
  if (c.get("sessionState") === "anonymous") {
    const searchProfile = normalizeSearchProfile(DEFAULT_SEARCH_PROFILE);
    return c.json({ search_profile: searchProfile, notify_threshold: searchProfile.match_threshold });
  }
  return c.json(await loadUserPreferenceState(c.env.DB, c.get("userId")));
});

// PUT / — Update preferences
preferences.put("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const state = await saveUserPreferenceState(
    c.env.DB,
    c.get("userId"),
    {
      search_profile: body.search_profile,
      notify_threshold: body.notify_threshold ?? body.notification_threshold,
    }
  );
  return c.json(state);
});

preferences.get("/preview", async (c) => {
  const userId = c.get("userId");
  await ensureEligibleJobs(c.env.DB);
  await ensureUserJobMatchesReady(c.env.DB, userId, 5);
  const result = await c.env.DB.prepare(
    `SELECT
       j.id, j.company_id, j.title, j.location, j.posted_at, j.first_seen_at, j.salary,
       c.name AS company_name, c.website AS company_domain,
       ujm.score, ujm.reasons_json AS match_reasons_json
     FROM user_job_matches ujm
     JOIN jobs j ON j.id = ujm.job_id
     JOIN companies c ON c.id = j.company_id
     WHERE ujm.user_id = ?
       AND c.enabled = 1
       AND j.closed_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM user_blocked_companies ubc
         WHERE ubc.user_id = ? AND ubc.company_id = j.company_id
       )
     ORDER BY ujm.score DESC, j.first_seen_at DESC
     LIMIT 25`
  ).bind(userId, userId).all<{
    id: string;
    company_id: string;
    title: string;
    location: string;
    posted_at: string | null;
    first_seen_at: string;
    salary: string | null;
    company_name: string;
    company_domain: string;
    score: number;
    match_reasons_json: string;
  }>();
  return c.json({
    jobs: diversifyRankedJobs(result.results ?? [], 5).map((job) => {
      let reasons: string[] = [];
      try {
        const parsed = JSON.parse(job.match_reasons_json);
        reasons = Array.isArray(parsed) ? parsed : [];
      } catch {
        reasons = [];
      }
      const { match_reasons_json: _, ...rest } = job;
      return { ...rest, match_reasons: reasons };
    }),
  });
});

export default preferences;
