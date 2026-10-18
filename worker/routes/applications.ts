import { Hono, type Context } from "hono";
import {
  APPLICATION_NOTES_MAX_LENGTH,
  isApplicationStage,
  MANUAL_APPLICATION_LIMITS,
  normalizeStageDate,
  type ApplicationStage,
} from "../../shared/application-stages";
import {
  createManualApplication,
  deleteApplication,
  getApplicationDetail,
  listApplications,
  setEventDate,
  trackJob,
  updateApplication,
} from "../applications";
import { DEFAULT_TIME_ZONE, localDate, validTimeZone, zonedTime } from "../local-time";
import { resolveJobId } from "../job-identity";
import { recordProductEvent } from "../product-events";
import type { Env, Variables } from "../types";

/** A user's applications: one per tracked Pinkslip job, with its stage, notes
 * and timeline. Today's apps still use the saved/applied flags on
 * `PATCH /jobs/:id`; these routes are the stage-aware surface for Tracker. */
const applications = new Hono<{ Bindings: Env; Variables: Variables }>();

applications.get("/", async (c) => {
  const stage = c.req.query("stage");
  if (stage !== undefined && !isApplicationStage(stage)) {
    return c.json({ error: "Unknown stage" }, 400);
  }
  return c.json({ applications: await listApplications(c.env.DB, c.get("userId"), stage) });
});

/** Tracks a job at a stage, creating its application if needed. Without a
 * `job_id`, `company` and `title` (and an optional `url`) add an application
 * for a job that isn't in Pinkslip. */
applications.post("/", async (c) => {
  type Body = { job_id?: unknown; stage?: unknown; company?: unknown; title?: unknown; url?: unknown };
  const body = await c.req.json<Body>().catch(() => ({}) as Body);
  if (!isApplicationStage(body.stage)) return c.json({ error: "Unknown stage" }, 400);
  const userId = c.get("userId");
  if (body.job_id === undefined && (body.company !== undefined || body.title !== undefined)) {
    const company = typeof body.company === "string" ? body.company.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!company || company.length > MANUAL_APPLICATION_LIMITS.company) {
      return c.json({ error: `Company is required, at most ${MANUAL_APPLICATION_LIMITS.company} characters` }, 400);
    }
    if (!title || title.length > MANUAL_APPLICATION_LIMITS.title) {
      return c.json({ error: `Title is required, at most ${MANUAL_APPLICATION_LIMITS.title} characters` }, 400);
    }
    if (url && (url.length > MANUAL_APPLICATION_LIMITS.url || !/^https?:\/\/[^\s]+$/i.test(url))) {
      return c.json({ error: "The link must start with http:// or https://" }, 400);
    }
    const detail = await createManualApplication(c.env.DB, userId, { company, title, url, stage: body.stage });
    await recordStageChange(c, detail.id, detail.stage);
    return c.json(detail, 201);
  }
  if (typeof body.job_id !== "string" || body.job_id === "") {
    return c.json({ error: "job_id is required" }, 400);
  }
  const jobId = await resolveJobId(c.env.DB, body.job_id);
  const detail = await trackJob(c.env.DB, userId, jobId, body.stage);
  if (!detail) return c.json({ error: "Not found" }, 404);
  await recordStageChange(c, detail.id, detail.stage);
  return c.json(detail);
});

applications.get("/:id", async (c) => {
  const detail = await getApplicationDetail(c.env.DB, c.get("userId"), c.req.param("id"));
  return detail ? c.json(detail) : c.json({ error: "Not found" }, 404);
});

/** Changes the stage, its date or the notes. A `stage_date` sent with a new
 * `stage` is the new stage's; `stage_date: null` clears it. */
applications.patch("/:id", async (c) => {
  type Body = { stage?: unknown; stage_date?: unknown; notes?: unknown };
  const body = await c.req.json<Body>().catch(() => ({}) as Body);
  if (body.stage === undefined && body.stage_date === undefined && body.notes === undefined) {
    return c.json({ error: "No fields to update" }, 400);
  }
  if (body.stage !== undefined && !isApplicationStage(body.stage)) {
    return c.json({ error: "Unknown stage" }, 400);
  }
  const stageDate = typeof body.stage_date === "string" ? normalizeStageDate(body.stage_date) ?? false
    : body.stage_date === null || body.stage_date === undefined ? body.stage_date
    : false;
  if (stageDate === false) {
    return c.json({ error: "stage_date must be a day (YYYY-MM-DD), a date and time, or null" }, 400);
  }
  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > APPLICATION_NOTES_MAX_LENGTH)) {
    return c.json({ error: `Notes must be text of at most ${APPLICATION_NOTES_MAX_LENGTH} characters` }, 400);
  }
  const result = await updateApplication(c.env.DB, c.get("userId"), c.req.param("id"), {
    stage: body.stage as ApplicationStage | undefined,
    stage_date: stageDate,
    notes: body.notes as string | undefined,
  });
  if ("error" in result) {
    return result.error === "not_found"
      ? c.json({ error: "Not found" }, 404)
      : c.json({ error: "Only Applied, Assessment, Interview and Offer take a date" }, 400);
  }
  if (result.detail.stage !== result.previousStage) {
    await recordStageChange(c, result.detail.id, result.detail.stage);
  }
  return c.json(result.detail);
});

/**
 * Moves one timeline step to when it happened: `occurred_at` is a day
 * ("2026-10-02", taken as midday where the person is) or an instant.
 */
applications.patch("/:id/events/:eventId", async (c) => {
  const body = await c.req.json<{ occurred_at?: unknown }>().catch(() => ({}) as { occurred_at?: unknown });
  const value = typeof body.occurred_at === "string" ? normalizeStageDate(body.occurred_at) : null;
  if (!value) return c.json({ error: "occurred_at must be a day (YYYY-MM-DD) or a date and time" }, 400);
  let occurredAt = value;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) {
    const user = await c.env.DB.prepare("SELECT time_zone FROM users WHERE id = ?")
      .bind(c.get("userId")).first<{ time_zone: string | null }>();
    const zone = validTimeZone(user?.time_zone, DEFAULT_TIME_ZONE);
    occurredAt = zonedTime(Number(day[1]), Number(day[2]), Number(day[3]), 12, zone).toISOString();
    // Today, before midday: now.
    if (localDate(new Date(), zone) === value && Date.parse(occurredAt) > Date.now()) occurredAt = new Date().toISOString();
  }
  const result = await setEventDate(c.env.DB, c.get("userId"), c.req.param("id"), c.req.param("eventId"), occurredAt);
  if ("error" in result) {
    return result.error === "not_found"
      ? c.json({ error: "Not found" }, 404)
      : c.json({ error: "A step can't be dated in the future" }, 400);
  }
  return c.json(result.detail);
});

applications.delete("/:id", async (c) => {
  const detail = await getApplicationDetail(c.env.DB, c.get("userId"), c.req.param("id"));
  if (!detail) return c.json({ error: "Not found" }, 404);
  await deleteApplication(c.env.DB, detail.id);
  return c.body(null, 204);
});

async function recordStageChange(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  applicationId: string,
  stage: ApplicationStage
) {
  await recordProductEvent(c.env.DB, {
    userId: c.get("userId"),
    sessionId: c.get("sessionId"),
    name: "application_stage_set",
    entityType: "application",
    entityId: applicationId,
    properties: { status: stage },
  }).catch(() => undefined);
}

export default applications;
