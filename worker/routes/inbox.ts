import { Hono } from "hono";
import {
  FORWARDING_PROVIDERS,
  forwardingProviderNames,
  forwardingSteps,
  INBOUND_EMAIL_STATUSES,
  type ForwardingProvider,
  type InboundEmailStatus,
} from "../../shared/email-tracking";
import { getPrimaryIdentity, requireAuthenticated } from "../auth";
import { sendForwardingStepsEmail } from "../email";
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

/** "Email me these steps": the setup steps, sent to the account's email. */
inbox.post("/steps-email", async (c) => {
  const body = await c.req.json<{ provider?: unknown; scope?: unknown }>().catch(() => ({}) as { provider?: unknown; scope?: unknown });
  if (!(FORWARDING_PROVIDERS as readonly unknown[]).includes(body.provider)) return c.json({ error: "Unknown provider" }, 400);
  if (body.scope !== undefined && body.scope !== "everything" && body.scope !== "job") return c.json({ error: "Unknown scope" }, 400);
  const provider = body.provider as ForwardingProvider;
  const identity = await getPrimaryIdentity(c.env.DB, c.get("userId"));
  if (!identity?.email) return c.json({ error: "This account has no email address" }, 409);
  const { address } = await getOrCreateInbox(c.env.DB, c.get("userId"));
  await sendForwardingStepsEmail(c.env, {
    to: identity.email,
    address,
    providerName: forwardingProviderNames[provider],
    steps: forwardingSteps(provider, body.scope === "job" ? "job" : "everything", address),
  });
  return c.json({ ok: true, to: identity.email });
});

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
