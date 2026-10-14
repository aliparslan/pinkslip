import { Hono } from "hono";
import { INBOUND_EMAIL_STATUSES, type InboundEmailStatus } from "../../shared/email-tracking";
import { requireAuthenticated } from "../auth";
import {
  assignInboundEmail,
  dismissInboundEmail,
  listInboundEmails,
  undoInboundEmail,
  type InboundEmailAction,
} from "../email/process";
import { getOrCreateInbox, rotateInbox } from "../inbox";
import type { Env, Variables } from "../types";

/** Email tracking: the user's forwarding address and what their forwarded
 * mail reported. See docs/email-tracking.md. */
const inbox = new Hono<{ Bindings: Env; Variables: Variables }>();

inbox.use("*", requireAuthenticated);

inbox.get("/", async (c) => c.json(await getOrCreateInbox(c.env.DB, c.get("userId"))));

inbox.post("/rotate", async (c) => c.json(await rotateInbox(c.env.DB, c.get("userId"))));

inbox.get("/emails", async (c) => {
  const status = c.req.query("status");
  if (status !== undefined && !(INBOUND_EMAIL_STATUSES as readonly string[]).includes(status)) {
    return c.json({ error: "Unknown status" }, 400);
  }
  return c.json({ emails: await listInboundEmails(c.env.DB, c.get("userId"), status as InboundEmailStatus | undefined) });
});

function respond(c: { json: (body: unknown, status?: 200 | 400 | 404 | 409) => Response }, result: InboundEmailAction) {
  return result.ok ? c.json({ ok: true }) : c.json({ error: result.error }, result.status);
}

inbox.post("/emails/:id/assign", async (c) => {
  const body = await c.req.json<{ application_ids?: unknown; application_id?: unknown }>()
    .catch(() => ({}) as { application_ids?: unknown; application_id?: unknown });
  // One pick or several; application_id is the older one-pick form.
  const ids = Array.isArray(body.application_ids) ? body.application_ids
    : typeof body.application_id === "string" ? [body.application_id] : null;
  if (!ids || ids.length === 0 || !ids.every((id): id is string => typeof id === "string")) {
    return c.json({ error: "application_ids is required" }, 400);
  }
  return respond(c, await assignInboundEmail(c.env.DB, c.get("userId"), c.req.param("id"), ids));
});

inbox.post("/emails/:id/dismiss", async (c) =>
  respond(c, await dismissInboundEmail(c.env.DB, c.get("userId"), c.req.param("id"))));

inbox.post("/emails/:id/undo", async (c) => {
  // With application_id, only that application's step is undone.
  const body = await c.req.json<{ application_id?: unknown }>().catch(() => ({}) as { application_id?: unknown });
  if (body.application_id !== undefined && typeof body.application_id !== "string") {
    return c.json({ error: "application_id must be a string" }, 400);
  }
  return respond(c, await undoInboundEmail(c.env.DB, c.get("userId"), c.req.param("id"), body.application_id));
});

export default inbox;
