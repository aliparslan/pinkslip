import { Hono } from "hono";
import { requireFlag } from "../feature-flags";
import { resolveJobId } from "../job-identity";
import { SendError, deliverSendCode, getSend, listSends, queueSend, sendShot } from "../apply/sends";
import { ResumeFileError, applyResumeInfo, applyResumeKey, saveApplyResume } from "../apply/send-files";
import type { Env, Variables } from "../types";

/** Server sends (step 10, phase 1): admin-only while AUTO_APPLY_SEND is
 * "admin". Mounted under /api/v2/apply, behind its sign-in. */
const sends = new Hono<{ Bindings: Env; Variables: Variables }>();

sends.use("/resume", requireFlag("AUTO_APPLY_SEND"));
sends.use("/sends/*", requireFlag("AUTO_APPLY_SEND"));
sends.use("/sends", requireFlag("AUTO_APPLY_SEND"));

sends.onError((error, c) => {
  if (error instanceof SendError) return c.json({ error: error.message, code: error.code, ...error.extra }, error.status);
  if (error instanceof ResumeFileError) return c.json({ error: error.message, code: "invalid_resume" }, 400);
  throw error;
});

const noStorage = { error: "Storage isn't set up here.", code: "storage_unavailable" } as const;

/** The resume PDF a send uploads: the body is the file, `?name=` its name. */
sends.put("/resume", async (c) => {
  if (!c.env.RESUME_BUCKET) return c.json(noStorage, 503);
  const bytes = await c.req.arrayBuffer();
  return c.json(await saveApplyResume(c.env.RESUME_BUCKET, c.get("userId"), bytes, c.req.query("name") ?? "Resume.pdf"));
});

sends.get("/resume", async (c) => {
  if (!c.env.RESUME_BUCKET) return c.json(noStorage, 503);
  const info = await applyResumeInfo(c.env.RESUME_BUCKET, c.get("userId"));
  return info ? c.json(info) : c.json({ error: "No resume uploaded for sends.", code: "not_found" }, 404);
});

sends.delete("/resume", async (c) => {
  if (!c.env.RESUME_BUCKET) return c.json(noStorage, 503);
  await c.env.RESUME_BUCKET.delete(applyResumeKey(c.get("userId")));
  return c.body(null, 204);
});

/** `{ job_id, dry_run? }`. A dry run fills everything and stops before Submit. */
sends.post("/sends", async (c) => {
  const body = await c.req.json<{ job_id?: unknown; dry_run?: unknown }>().catch(() => null);
  if (typeof body?.job_id !== "string" || !body.job_id) return c.json({ error: "job_id is required.", code: "invalid_request" }, 400);
  const jobId = await resolveJobId(c.env.DB, body.job_id);
  return c.json(await queueSend(c.env, c.get("userId"), { jobId, dryRun: body.dry_run === true }), 201);
});

sends.get("/sends", async (c) => c.json({ sends: await listSends(c.env.DB, c.get("userId")) }));

sends.get("/sends/:id", async (c) => {
  const send = await getSend(c.env.DB, c.get("userId"), c.req.param("id"));
  return send ? c.json(send) : c.json({ error: "Not found", code: "not_found" }, 404);
});

/** The filled form, or the confirmation page, as Pinkslip's browser saw it. */
sends.get("/sends/:id/shots/:shot", async (c) => {
  const shot = c.req.param("shot");
  if (shot !== "form" && shot !== "confirmation") return c.json({ error: "Not found", code: "not_found" }, 404);
  const object = await sendShot(c.env, c.get("userId"), c.req.param("id"), shot);
  if (!object) return c.json({ error: "Not found", code: "not_found" }, 404);
  return new Response(object.body, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
});

/** The code Greenhouse emailed, typed by the person when email tracking
 * didn't catch it. */
sends.post("/sends/:id/code", async (c) => {
  const body = await c.req.json<{ code?: unknown }>().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!/^[A-Za-z0-9]{4,12}$/.test(code)) return c.json({ error: "That isn't a code.", code: "invalid_code" }, 400);
  const delivered = await deliverSendCode(c.env, c.get("userId"), code, c.req.param("id"));
  return delivered ? c.body(null, 202) : c.json({ error: "That send isn't waiting for a code.", code: "not_waiting" }, 409);
});

export default sends;
