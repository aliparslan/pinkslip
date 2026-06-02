import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./types";
import { authMiddleware, buildCookie, COOKIE_NAMES } from "./auth";
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
import authRoutes from "./routes/auth";
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

app.use("/api/*", authMiddleware);

app.route("/api/jobs", jobRoutes);
app.route("/api/companies", companyRoutes);
app.route("/api/preferences", preferenceRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/stats", statRoutes);
app.route("/api/applications", applicationRoutes);
app.route("/api/events", eventRoutes);
app.route("/api/corpus", corpusRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api", tailorRoutes);
app.route("/api/runs", runRoutes);
app.route("/api/auth", authRoutes);
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    version: "local",
    timestamp: new Date().toISOString(),
  })
);
app.get("/api/me", async (c) => {
  const userId = c.get("userId");
  const user = await c.env.DB.prepare("SELECT id, name, created_at FROM users WHERE id = ?")
    .bind(userId).first();
  const geminiEnabled = Boolean(c.env.GEMINI_API_KEY?.trim());
  const anthropicEnabled = Boolean(c.env.ANTHROPIC_API_KEY?.trim());
  const tailoringProvider = geminiEnabled ? "gemini" : anthropicEnabled ? "anthropic" : null;
  return c.json({
    user,
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
  const user = await c.env.DB.prepare("SELECT id, name, created_at FROM users WHERE id = ?")
    .bind(userId).first();
  return c.json({ user });
});
app.post("/api/poll", async (c) => {
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
