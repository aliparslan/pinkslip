import { Hono } from "hono";
import { requireAuthenticated } from "../auth";
import { requireFlag } from "../feature-flags";
import { resolveJobId } from "../job-identity";
import { recordProductEvent } from "../product-events";
import {
  closeThread,
  discardDraftThread,
  editMessage,
  listThreads,
  loadThread,
  markMessageSent,
  OutreachError,
  startThreadForJob,
} from "../outreach/threads";
import type { Env, Variables } from "../types";

const outreach = new Hono<{ Bindings: Env; Variables: Variables }>();

outreach.use("*", requireAuthenticated, requireFlag("OUTREACH"));

outreach.onError((error, c) => {
  if (error instanceof OutreachError) {
    return c.json({ error: error.message, code: error.code }, error.status);
  }
  throw error;
});

outreach.get("/threads", async (c) => {
  const rawJobId = c.req.query("job_id");
  const jobId = rawJobId ? await resolveJobId(c.env.DB, rawJobId) : undefined;
  return c.json({ threads: await listThreads(c.env.DB, c.get("userId"), { jobId }) });
});

outreach.post("/threads", async (c) => {
  const body = await c.req.json<{ job_id?: unknown }>().catch(() => null);
  if (typeof body?.job_id !== "string" || !body.job_id) {
    return c.json({ error: "Missing job_id", code: "invalid_request" }, 400);
  }
  const userId = c.get("userId");
  const thread = await startThreadForJob(c.env, userId, await resolveJobId(c.env.DB, body.job_id));
  await recordProductEvent(c.env.DB, {
    userId,
    sessionId: c.get("sessionId"),
    name: "outreach_started",
    entityType: thread.job_id ? "job" : "company",
    entityId: thread.job_id ?? thread.company_id,
  }).catch(() => undefined);
  return c.json(thread, 201);
});

outreach.get("/threads/:id", async (c) => {
  const thread = await loadThread(c.env.DB, c.get("userId"), c.req.param("id"));
  return thread ? c.json(thread) : c.json({ error: "Thread not found", code: "not_found" }, 404);
});

outreach.post("/threads/:id/replied", async (c) =>
  c.json(await closeThread(c.env.DB, c.get("userId"), c.req.param("id"), "replied")));

outreach.post("/threads/:id/stop", async (c) =>
  c.json(await closeThread(c.env.DB, c.get("userId"), c.req.param("id"), "stopped")));

outreach.delete("/threads/:id", async (c) => {
  await discardDraftThread(c.env.DB, c.get("userId"), c.req.param("id"));
  return c.body(null, 204);
});

outreach.patch("/messages/:id", async (c) => {
  const body = await c.req.json<{ subject?: unknown; body?: unknown }>().catch(() => null);
  const subject = typeof body?.subject === "string" ? body.subject : undefined;
  const text = typeof body?.body === "string" ? body.body : undefined;
  if (subject === undefined && text === undefined) {
    return c.json({ error: "No fields to update", code: "invalid_request" }, 400);
  }
  if ((subject?.length ?? 0) > 300 || (text?.length ?? 0) > 10_000) {
    return c.json({ error: "That email is too long.", code: "invalid_message" }, 400);
  }
  return c.json(await editMessage(c.env.DB, c.get("userId"), c.req.param("id"), { subject, body: text }));
});

outreach.post("/messages/:id/sent", async (c) => {
  const body = await c.req.json<{ time_zone?: unknown }>().catch(() => null);
  const userId = c.get("userId");
  const thread = await markMessageSent(c.env, userId, c.req.param("id"), body?.time_zone);
  const step = thread.messages.find((message) => message.id === c.req.param("id"))?.step ?? 0;
  await recordProductEvent(c.env.DB, {
    userId,
    sessionId: c.get("sessionId"),
    name: step === 0 ? "outreach_sent" : "outreach_follow_up_sent",
    entityType: thread.job_id ? "job" : "company",
    entityId: thread.job_id ?? thread.company_id,
  }).catch(() => undefined);
  return c.json(thread);
});

export default outreach;
