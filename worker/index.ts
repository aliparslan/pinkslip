import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./types";
import { authMiddleware, buildCookie, COOKIE_NAMES, requireAdmin } from "./auth";
import jobRoutes from "./routes/jobs";
import companyRoutes from "./routes/companies";
import preferenceRoutes from "./routes/preferences";
import pushRoutes from "./routes/push";
import statRoutes from "./routes/stats";
import applicationRoutes from "./routes/applications";
import eventRoutes from "./routes/events";
import corpusRoutes from "./routes/corpus";
import profileRoutes from "./routes/profile";
import tailorRoutes from "./routes/tailor";
import runRoutes from "./routes/runs";
import authRoutes, { buildAccountState, completeEmailMagicLink } from "./routes/auth";
import resumeAssetRoutes from "./routes/resume-assets";
import { runPollCycle } from "./poller";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("/*", cors({ origin: (origin) => origin || "*", credentials: true }));

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

app.post("/api/access", async (c) => {
  const accessCode = c.env.ACCESS_CODE?.trim();
  if (!accessCode) {
    return c.json({ ok: true, required: false });
  }

  const body = await c.req.json<{ code?: string }>().catch(() => null);
  const submittedCode = body?.code?.trim() ?? "";
  if (submittedCode !== accessCode) {
    return c.json({ error: "Invalid access code", code: "access_denied" }, 401);
  }

  c.header(
    "Set-Cookie",
    buildCookie(COOKIE_NAMES.access, accessCode, c.req.url),
    { append: true }
  );

  return c.json({ ok: true, required: true });
});

// Apple fetches this directly from /.well-known/ and does NOT follow redirects,
// so both paths must serve the JSON body itself (no redirect). Keep `paths`
// scoped to the magic-link route so only those links open the app.
function appleAppSiteAssociation(env: Env) {
  const teamId = env.APPLE_TEAM_ID?.trim() || env.APNS_TEAM_ID?.trim();
  const appId = env.APPLE_APP_ID?.trim() || env.APNS_BUNDLE_ID?.trim() || "dev.alip.pinkslip";
  return {
    applinks: {
      apps: [],
      details: teamId ? [{ appID: `${teamId}.${appId}`, paths: ["/auth/email/verify*"] }] : [],
    },
  };
}

const serveAasa = (c: { env: Env }) =>
  new Response(JSON.stringify(appleAppSiteAssociation(c.env)), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

app.get("/apple-app-site-association", (c) => serveAasa(c));
app.get("/.well-known/apple-app-site-association", (c) => serveAasa(c));

app.use("/api/*", authMiddleware);
app.use("/auth/email/verify", authMiddleware);

app.route("/api/jobs", jobRoutes);
app.route("/api/companies", companyRoutes);
app.route("/api/preferences", preferenceRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/stats", statRoutes);
app.route("/api/applications", applicationRoutes);
app.route("/api/events", eventRoutes);
app.route("/api/corpus", corpusRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api/resume-assets", resumeAssetRoutes);
app.route("/api", tailorRoutes);
app.route("/api/runs", runRoutes);
app.route("/api/auth", authRoutes);
app.get("/auth/email/verify", async (c) =>
  completeEmailMagicLink(c.req.raw, c.env, c.get("userId"), c.get("sessionId"))
);
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    version: "local",
    timestamp: new Date().toISOString(),
  })
);
app.get("/api/me", async (c) => {
  const geminiEnabled = Boolean(c.env.GEMINI_API_KEY?.trim());
  const anthropicEnabled = Boolean(c.env.ANTHROPIC_API_KEY?.trim());
  const tailoringProvider = geminiEnabled ? "gemini" : anthropicEnabled ? "anthropic" : null;
  const accountState = await buildAccountState(c.env.DB, c.get("userId"), c.get("sessionState"));
  return c.json({
    ...accountState,
    features: {
      access_required: Boolean(c.env.ACCESS_CODE?.trim()),
      tailoring_enabled: geminiEnabled || anthropicEnabled,
      tailoring_provider: tailoringProvider,
      tailoring_model: tailoringProvider === "anthropic"
        ? c.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL
        : c.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    },
  });
});
app.patch("/api/me", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ name?: string }>();
  if (body.name !== undefined) {
    await c.env.DB.prepare("UPDATE users SET name = ? WHERE id = ?")
      .bind(body.name, userId).run();
  }
  const accountState = await buildAccountState(c.env.DB, userId, c.get("sessionState"));
  return c.json(accountState);
});
app.post("/api/poll", requireAdmin, async (c) => {
  const limit = Number(c.req.query("limit") ?? "0");
  const result = await runPollCycle(c.env, {
    scope: "manual",
    limit: limit > 0 ? limit : null,
    sendNotifications: true,
  });

  return c.json({
    companiesPolled: result.companiesPolled,
    newJobsFound: result.newJobsFound,
    log: result.log,
  });
});

app.onError((error, c) => {
  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  console.error("Unhandled request error", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return c.json(
    {
      error: "Something went wrong while loading pinkslip. Please try again.",
      code: "internal_error",
      request_id: requestId,
    },
    500
  );
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runPollCycle(env)
        .then((result) => {
          console.log(`Poll complete: ${result.companiesPolled} companies, ${result.newJobsFound} new jobs, ${result.notificationsSent} notifications`);
        })
        .catch((err) => {
          console.error("Poll cycle failed:", err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : "");
        })
    );
  },
};
