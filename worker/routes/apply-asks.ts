import { Hono } from "hono";
import { AUTO_APPLY_MODES, AUTO_APPLY_PAUSES, type AutoApplyMode, type AutoApplyPause } from "../../shared/apply-asks";
import { AskError, answerAsk, loadAutoApplySettings, saveAutoApplySettings } from "../apply/asks";
import { SendError } from "../apply/sends";
import { requireFlag } from "../feature-flags";
import { resolveJobId } from "../job-identity";
import type { Env, Variables } from "../types";

/** Asking as strong matches post (worker/apply/asks.ts): the mode and Pause,
 * and the push's buttons. Open where sends are; mounted under
 * /api/v2/apply, behind its sign-in. */
const asks = new Hono<{ Bindings: Env; Variables: Variables }>();

asks.use("/settings", requireFlag("AUTO_APPLY_SEND"));
asks.use("/asks/*", requireFlag("AUTO_APPLY_SEND"));

asks.onError((error, c) => {
  if (error instanceof AskError) return c.json({ error: error.message, code: error.code }, error.status);
  if (error instanceof SendError) return c.json({ error: error.message, code: error.code, ...error.extra }, error.status);
  throw error;
});

asks.get("/settings", async (c) => c.json(await loadAutoApplySettings(c.env, c.get("userId"))));

/** `{ mode?: "ask" | "auto" | "off", pause?: "day" | "week" | "until_resumed" | null }`; null resumes. */
asks.put("/settings", async (c) => {
  const body = await c.req.json<{ mode?: unknown; pause?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid settings", code: "invalid_request" }, 400);
  if (body.mode !== undefined && !(AUTO_APPLY_MODES as readonly unknown[]).includes(body.mode)) {
    return c.json({ error: "Unknown mode", code: "invalid_request" }, 400);
  }
  if (body.pause !== undefined && body.pause !== null && !(AUTO_APPLY_PAUSES as readonly unknown[]).includes(body.pause)) {
    return c.json({ error: "Unknown pause", code: "invalid_request" }, 400);
  }
  return c.json(await saveAutoApplySettings(c.env, c.get("userId"), {
    ...(body.mode !== undefined ? { mode: body.mode as AutoApplyMode } : {}),
    ...(body.pause !== undefined ? { pause: body.pause as AutoApplyPause | null } : {}),
  }));
});

/** The push's buttons: `{ action: "apply" | "dismiss" }`. */
asks.post("/asks/:jobId", async (c) => {
  const body = await c.req.json<{ action?: unknown }>().catch(() => null);
  if (body?.action !== "apply" && body?.action !== "dismiss") {
    return c.json({ error: "Unknown action", code: "invalid_request" }, 400);
  }
  const jobId = await resolveJobId(c.env.DB, c.req.param("jobId"));
  return c.json(await answerAsk(c.env, c.get("userId"), jobId, body.action));
});

export default asks;
