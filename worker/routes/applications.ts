import { Hono, type Context } from "hono";
import {
  APPLICATION_NOTES_MAX_LENGTH,
  isApplicationStage,
  type ApplicationStage,
} from "../../shared/application-stages";
import {
  deleteApplication,
  getApplicationDetail,
  listApplications,
  trackJob,
  updateApplication,
} from "../applications";
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

/** Tracks a job at a stage, creating its application if needed. */
applications.post("/", async (c) => {
  const body = await c.req.json<{ job_id?: unknown; stage?: unknown }>().catch(() => ({}) as { job_id?: unknown; stage?: unknown });
  if (typeof body.job_id !== "string" || body.job_id === "") {
    return c.json({ error: "job_id is required" }, 400);
  }
  if (!isApplicationStage(body.stage)) return c.json({ error: "Unknown stage" }, 400);
  const userId = c.get("userId");
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

applications.patch("/:id", async (c) => {
  const body = await c.req.json<{ stage?: unknown; notes?: unknown }>().catch(() => ({}) as { stage?: unknown; notes?: unknown });
  if (body.stage === undefined && body.notes === undefined) {
    return c.json({ error: "No fields to update" }, 400);
  }
  if (body.stage !== undefined && !isApplicationStage(body.stage)) {
    return c.json({ error: "Unknown stage" }, 400);
  }
  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > APPLICATION_NOTES_MAX_LENGTH)) {
    return c.json({ error: `Notes must be text of at most ${APPLICATION_NOTES_MAX_LENGTH} characters` }, 400);
  }
  const result = await updateApplication(c.env.DB, c.get("userId"), c.req.param("id"), {
    stage: body.stage as ApplicationStage | undefined,
    notes: body.notes as string | undefined,
  });
  if (!result) return c.json({ error: "Not found" }, 404);
  if (result.detail.stage !== result.previousStage) {
    await recordStageChange(c, result.detail.id, result.detail.stage);
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
