import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { matchedRoutes } from "hono/route";
import type { Env, Variables } from "./types";
import {
  ACCESS_COOKIE_MAX_AGE,
  accessGrantValue,
  authMiddleware,
  buildCookie,
  COOKIE_NAMES,
  createGuestSession,
  requireAdmin,
} from "./auth";
import jobRoutes from "./routes/jobs";
import publicJobRoutes from "./routes/public-jobs";
import applicationRoutes from "./routes/applications";
import inboxRoutes from "./routes/inbox";
import { handleInboundEmail } from "./email/handler";
import companyRoutes from "./routes/companies";
import preferenceRoutes from "./routes/preferences";
import pushRoutes from "./routes/push";
import statRoutes from "./routes/stats";
import profileRoutes from "./routes/profile";
import tailorRoutes from "./routes/tailor";
import runRoutes from "./routes/runs";
import authRoutes, { buildAccountState, completeEmailMagicLink } from "./routes/auth";
import { appleWebConfig } from "./apple-web";
import resumeImportRoutes from "./routes/resume-import";
import interactionRoutes from "./routes/interactions";
import metricRoutes from "./routes/metrics";
import recruiterRoutes from "./routes/recruiters";
import outreachRoutes from "./routes/outreach";
import applyRoutes from "./routes/apply";
import errorRoutes from "./routes/errors";
import notificationRoutes from "./routes/notifications";
import todayRoutes from "./routes/today";
import { alertNewErrors, describeThrown, recordError } from "./errors";
import {
  HEALTH_CRON_SCHEDULE,
  loadHealthState,
  runHealthChecks,
  SITE_ORIGIN,
  type HealthCheckDeps,
} from "./health-checks";
import { flagEnabled } from "./feature-flags";
import { queueSavedJobClosings, runNotificationScheduler } from "./notification-scheduler";
import { runClassificationShadow } from "./classification-shadow";
import {
  NOTIFICATION_CRON_SCHEDULE,
  runNotificationCycle,
  runPollCycle,
} from "./poller";
import {
  dispatchDueSources,
  handleSourcePollBatch,
  SOURCE_DISPATCH_CRON_SCHEDULE,
  SOURCE_POLL_PRIORITY_QUEUE_NAME,
  SOURCE_POLL_QUEUE_NAME,
  type SourcePollMessage,
} from "./source-polling";
import { runPollingWatchdog } from "./polling-watchdog";
import {
  handleNotifyBatch,
  NOTIFY_QUEUE_NAME,
  type NotifyMessage,
} from "./notification-queue";
import {
  defaultUserPreferenceState,
  loadUserPreferenceState,
} from "./user-preferences";
import { resolveAppTailorConfig } from "./tailor/config";
import { LEGAL_STYLES, privacyPolicyPage, supportPage } from "./legal";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Credentialed CORS must NOT reflect arbitrary origins, or any website could make
// authenticated requests as the signed-in user and read the responses. Allow only
// our own web origin, the native Capacitor shells, and localhost during dev.
const ALLOWED_ORIGINS = new Set([
  "https://pinkslip.alip.dev",
  "https://pinkslip.work",
  "capacitor://localhost",
  "ionic://localhost",
]);
function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
app.use(
  "/*",
  cors({
    origin: (origin) => (origin && isAllowedOrigin(origin) ? origin : null),
    credentials: true,
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Pinkslip-Client",
      "X-Pinkslip-Build",
    ],
  })
);

// Baseline security headers on API responses. Web pages come from the
// pinkslip-web Worker, which sets its own page policy.
app.use("/*", async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  await next();
  if (pathname.startsWith("/api/")) c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  c.header(
    "Content-Security-Policy",
    pathname === "/privacy" || pathname === "/support"
      ? "default-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
      : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  );
});

// Send browser page visits on the old hostname to the new site while retaining
// the requested path and query. API clients stay on the old host during the
// transition so older native builds continue to work.
app.use("/*", async (c, next) => {
  const requestUrl = new URL(c.req.url);
  const acceptsHtml = c.req.header("accept")?.includes("text/html") ?? false;
  if (
    requestUrl.hostname === "pinkslip.alip.dev"
    && (c.req.method === "GET" || c.req.method === "HEAD")
    && acceptsHtml
    && !requestUrl.pathname.startsWith("/api/")
  ) {
    requestUrl.protocol = "https:";
    requestUrl.hostname = "pinkslip.work";
    requestUrl.port = "";
    requestUrl.searchParams.set("ps_moved", "1");
    return c.redirect(requestUrl.toString(), 308);
  }
  await next();
});

function appFeatures(env: Env, account: { is_admin: boolean; session: { state: string } }) {
  const tailoring = resolveAppTailorConfig(env);
  return {
    access_required: Boolean(env.ACCESS_CODE?.trim()),
    outreach_enabled: account.session.state === "authenticated" && flagEnabled(env.OUTREACH, account.is_admin),
    auto_apply_enabled: account.session.state === "authenticated" && flagEnabled(env.AUTO_APPLY, account.is_admin),
    auto_submit_enabled: account.session.state === "authenticated" && flagEnabled(env.AUTO_APPLY_SUBMIT, account.is_admin),
    web_apple_sign_in_enabled: Boolean(appleWebConfig(env)),
    tailoring_enabled: Boolean(tailoring),
    tailoring_provider: tailoring?.provider ?? null,
    tailoring_model: tailoring?.model ?? "",
  };
}

app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/v2/")) {
    await next();
    return;
  }
  return c.json({
    error: "Update Pinkslip to continue.",
    code: "client_update_required",
    required_api_version: 2,
  }, 426);
});

app.post("/api/v2/access", async (c) => {
  const accessCode = c.env.ACCESS_CODE?.trim();
  if (!accessCode) {
    return c.json({ ok: true, required: false });
  }

  const requestIp = (
    c.req.header("cf-connecting-ip")
    ?? c.req.header("x-forwarded-for")?.split(",")[0]
    ?? "unknown"
  ).trim();
  const recentFailures = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM access_attempts
     WHERE request_ip = ?
       AND datetime(attempted_at) > datetime('now', '-15 minutes')`
  ).bind(requestIp).first<{ count: number }>().catch(() => ({ count: 0 }));
  if ((recentFailures?.count ?? 0) >= 10) {
    return c.json(
      { error: "Too many attempts. Try again later.", code: "access_rate_limited" },
      429,
      { "Retry-After": "900" }
    );
  }

  const body = await c.req.json<{ code?: string }>().catch(() => null);
  const submittedCode = body?.code?.trim() ?? "";
  if (submittedCode !== accessCode) {
    await c.env.DB.prepare(
      "INSERT INTO access_attempts (id, request_ip, attempted_at) VALUES (?, ?, ?)"
    ).bind(crypto.randomUUID(), requestIp, new Date().toISOString()).run().catch(() => undefined);
    return c.json({ error: "Invalid access code", code: "access_denied" }, 401);
  }

  await c.env.DB.prepare("DELETE FROM access_attempts WHERE request_ip = ?")
    .bind(requestIp)
    .run()
    .catch(() => undefined);
  c.header(
    "Set-Cookie",
    buildCookie(
      COOKIE_NAMES.access,
      await accessGrantValue(accessCode),
      c.req.url,
      ACCESS_COOKIE_MAX_AGE
    ),
    { append: true }
  );

  if (c.req.header("x-pinkslip-client") === "ios") {
    const session = await createGuestSession(c.env.DB);
    return c.json({
      ok: true,
      required: true,
      native_token: session.id,
      expires_at: session.expires_at,
    });
  }

  return c.json({ ok: true, required: true });
});

app.post("/api/v2/native/session", async (c) => {
  if (c.req.header("x-pinkslip-client") !== "ios") {
    return c.json({ error: "Native client required", code: "native_client_required" }, 400);
  }
  if (c.env.ACCESS_CODE?.trim()) {
    return c.json({ error: "Access required", code: "access_required" }, 401);
  }
  const session = await createGuestSession(c.env.DB);
  return c.json({
    token: session.id,
    expires_at: session.expires_at,
    session: { state: session.state },
  }, 201);
});

// Apple fetches this directly from /.well-known/ and does NOT follow redirects,
// so both paths must serve the JSON body itself (no redirect). `paths` lists
// what the iOS app can show: the magic-link route and job pages (a shared job
// link opens in the app when it's installed).
function appleAppSiteAssociation(env: Env) {
  const teamId = env.APPLE_TEAM_ID?.trim() || env.APNS_TEAM_ID?.trim();
  const appId = env.APPLE_APP_ID?.trim() || env.APNS_BUNDLE_ID?.trim() || "dev.alip.pinkslip";
  return {
    applinks: {
      apps: [],
      details: teamId ? [{ appID: `${teamId}.${appId}`, paths: ["/auth/email/verify*", "/jobs/*"] }] : [],
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
app.get("/legal.css", () => new Response(LEGAL_STYLES, {
  headers: {
    "content-type": "text/css; charset=utf-8",
    "cache-control": "public, max-age=86400",
  },
}));
app.get("/privacy", () => new Response(privacyPolicyPage(), {
  headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=3600",
  },
}));
app.get("/support", () => new Response(supportPage(), {
  headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=3600",
  },
}));

// Only this explicit, read-only projection is public, including behind the
// invite gate. All existing personal and administrative endpoints keep auth.
app.route("/api/v2/public", publicJobRoutes);
// Company favicon proxy. The app never hits Google's favicon service from the
// user's device (no third party learns which companies they browse); responses
// cache at the edge and in the browser for a day. Favicons carry nothing
// personal, so, like the public catalog, they need no access code or session.
app.get("/api/v2/logo", async (c) => {
  const domain = (c.req.query("domain") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{0,252}$/.test(domain) || !domain.includes(".")) {
    return c.json({ error: "Invalid domain" }, 400);
  }
  const upstream = await fetch(
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
    { cf: { cacheEverything: true, cacheTtl: 86400 } }
  );
  // Google answers unknown domains with a 404 and a generic globe; the client
  // shows initials instead. Misses are cached too, so a company without a
  // favicon doesn't send every row view upstream.
  if (!upstream.ok || !upstream.body) {
    return c.json({ error: "Logo unavailable" }, 404, { "cache-control": "public, max-age=86400" });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/png",
      "cache-control": "public, max-age=604800, stale-while-revalidate=86400",
    },
  });
});
app.use("/api/v2/*", authMiddleware);
app.use("/auth/email/verify", authMiddleware);

// Ahead of the tailoring routes, whose "/api/v2/*" middleware would
// otherwise run for every error report.
app.route("/api/v2/errors", errorRoutes);
app.route("/api/v2/jobs", jobRoutes);
app.route("/api/v2/companies", companyRoutes);
app.route("/api/v2/preferences", preferenceRoutes);
app.route("/api/v2/push", pushRoutes);
app.route("/api/v2/notifications", notificationRoutes);
app.route("/api/v2/today", todayRoutes);
app.route("/api/v2/stats", statRoutes);
app.route("/api/v2/profile", profileRoutes);
app.route("/api/v2/resume-import", resumeImportRoutes);
app.route("/api/v2", tailorRoutes);
app.route("/api/v2/runs", runRoutes);
app.route("/api/v2/interactions", interactionRoutes);
app.route("/api/v2/metrics", metricRoutes);
app.route("/api/v2/recruiters", recruiterRoutes);
app.route("/api/v2/outreach", outreachRoutes);
app.route("/api/v2/apply", applyRoutes);
app.route("/api/v2/applications", applicationRoutes);
app.route("/api/v2/inbox", inboxRoutes);
app.route("/api/v2/auth", authRoutes);
app.get("/auth/email/verify", async (c) =>
  completeEmailMagicLink(c.req.raw, c.env, c.get("userId"), c.get("sessionId"))
);
app.get("/api/v2/health", (c) =>
  c.json({
    ok: true,
    version: ["localhost", "127.0.0.1", "::1"].includes(new URL(c.req.url).hostname)
      ? "local"
      : "production",
    timestamp: new Date().toISOString(),
  })
);
app.get("/api/v2/me", async (c) => {
  const accountState = await buildAccountState(c.env.DB, c.get("userId"), c.get("sessionState"));
  return c.json({
    ...accountState,
    features: appFeatures(c.env, accountState),
  });
});
app.get("/api/v2/bootstrap", async (c) => {
  const sessionState = c.get("sessionState");
  const [accountState, preferences] = await Promise.all([
    buildAccountState(c.env.DB, c.get("userId"), sessionState),
    sessionState === "anonymous"
      ? Promise.resolve(defaultUserPreferenceState())
      : loadUserPreferenceState(c.env.DB, c.get("userId")),
  ]);
  return c.json({
    me: { ...accountState, features: appFeatures(c.env, accountState) },
    preferences,
  });
});
app.patch("/api/v2/me", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ name?: string }>();
  if (body.name !== undefined) {
    await c.env.DB.prepare("UPDATE users SET name = ? WHERE id = ?")
      .bind(body.name, userId).run();
  }
  const accountState = await buildAccountState(c.env.DB, userId, c.get("sessionState"));
  return c.json(accountState);
});
app.post("/api/v2/poll", requireAdmin, async (c) => {
  const limit = Number(c.req.query("limit") ?? "0");
  const result = await runPollCycle(c.env, {
    scope: "manual",
    limit: limit > 0 ? limit : null,
    // Notification matching has its own fresh-isolate cron. Keeping it out of
    // this already-heavier manual poll avoids recreating the memory failure.
    sendNotifications: false,
  });

  return c.json({
    companiesPolled: result.companiesPolled,
    newJobsFound: result.newJobsFound,
    log: result.log,
  });
});

/** The checks call this Worker's own API in-process, as the app would. */
function healthCheckDeps(env: Env, ctx: Parameters<typeof app.fetch>[2]): HealthCheckDeps {
  return {
    fetchApi: async (path, init) => app.fetch(new Request(new URL(path, SITE_ORIGIN), init), env, ctx),
  };
}

app.get("/api/v2/runs/health", requireAdmin, async (c) =>
  c.json({ health: await loadHealthState(c.env.DB) })
);
/** Runs the 15-minute checks now, alerts included, and returns what they found. */
app.post("/api/v2/runs/health", requireAdmin, async (c) =>
  c.json({ health: await runHealthChecks(c.env, healthCheckDeps(c.env, c.executionCtx)) })
);

/** The handler's pattern ("/api/v2/jobs/:id"), so ids don't split one fault into many. */
function routePattern(c: Context): string {
  const handler = matchedRoutes(c).filter((route) => !route.path.endsWith("*")).at(-1);
  return handler?.path ?? c.req.path;
}

app.onError((error, c) => {
  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  const thrown = describeThrown(error);
  console.error("Unhandled request error", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    message: thrown.message,
    stack: thrown.stack ?? undefined,
  });
  const recorded = recordError(c.env.DB, {
    source: "api",
    ...thrown,
    route: `${c.req.method} ${routePattern(c)}`,
    requestId,
    build: c.req.header("x-pinkslip-build") ?? null,
  });
  try {
    c.executionCtx.waitUntil(recorded);
  } catch {
    // No execution context (tests): the write still runs on its own.
  }
  return c.json(
    {
      error: `Something went wrong while loading ${c.req.header("x-pinkslip-client") === "ios" ? "Pinkslip" : "pinkslip"}. Please try again.`,
      code: "internal_error",
      request_id: requestId,
    },
    500
  );
});

app.notFound((c) => c.json({ error: "Not found", code: "not_found" }, 404));

export type ScheduledCycle = "notifications" | "poll" | "dispatch" | "health";

export function scheduledCycle(cron: string): ScheduledCycle {
  if (cron === SOURCE_DISPATCH_CRON_SCHEDULE) return "dispatch";
  if (cron === HEALTH_CRON_SCHEDULE) return "health";
  return cron === NOTIFICATION_CRON_SCHEDULE ? "notifications" : "poll";
}

async function runScheduledCycle(cycle: ScheduledCycle, env: Env, ctx: ExecutionContext): Promise<void> {
  if (cycle === "health") {
    const health = await runHealthChecks(env, healthCheckDeps(env, ctx));
    console.log(`Health checks: ${health.results.map((result) => `${result.name} ${result.ok ? "ok" : `failed (${result.detail})`}`).join(", ")}`);
    return;
  }
  if (cycle === "dispatch") {
    // The watchdog runs even when dispatch fails; that is when it matters most.
    // Scheduled notifications (follow-ups, the daily new-jobs alert, saved
    // jobs closing) ride the same every-minute tick so they land on time, and
    // new kinds of errors reach admins within a minute.
    const [dispatch, watchdog, reminders, newErrors] = await Promise.allSettled([
      dispatchDueSources(env),
      runPollingWatchdog(env),
      runNotificationScheduler(env),
      alertNewErrors(env),
    ]);
    if (reminders.status === "fulfilled") {
      const { followUps, reminders: dateReminders, digests, delivered } = reminders.value;
      if (followUps + dateReminders + digests + delivered.sent + delivered.held + delivered.failed > 0) {
        console.log(`Notifications: ${followUps} follow-ups and ${dateReminders} date reminders queued, ${digests} daily alerts, ${delivered.sent} sent, ${delivered.held} held for the daily cap, ${delivered.skipped} skipped, ${delivered.failed} failed`);
      }
    }
    if (dispatch.status === "fulfilled") {
      const total = dispatch.value.reduce((sum, result) => sum + result.dispatched, 0);
      if (total > 0) {
        console.log(`Source dispatch: ${dispatch.value.map((result) => `tier ${result.tier} ${result.dispatched}`).join(", ")}`);
      }
    }
    if (dispatch.status === "rejected") throw dispatch.reason;
    if (watchdog.status === "rejected") throw watchdog.reason;
    if (reminders.status === "rejected") throw reminders.reason;
    if (newErrors.status === "rejected") throw newErrors.reason;
    return;
  }
  if (cycle === "notifications") {
    const result = await runNotificationCycle(env);
    console.log(`Notification matching complete: ${result.matchesProcessed} jobs, ${result.notificationsSent} notifications`);
    const closings = await queueSavedJobClosings(env);
    if (closings > 0) console.log(`Saved jobs closed: ${closings} notifications queued`);
    await runClassificationShadow(env).catch(() => console.error("Classification shadow cycle failed"));
    return;
  }
  const result = await runPollCycle(env, { sendNotifications: false });
  console.log(`Poll complete: ${result.companiesPolled} companies, ${result.newJobsFound} new jobs`);
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // The rejection is deliberately NOT swallowed. Swallowing it is what let the
    // poll cycle die every 15 minutes for six weeks while Cloudflare reported
    // `outcome: "ok"` with zero exceptions — nothing anywhere went red. Log for
    // context, then rethrow so the invocation is recorded as failed.
    const cycle = scheduledCycle(event.cron);
    ctx.waitUntil(
      runScheduledCycle(cycle, env, ctx).catch(async (err) => {
        console.error(`${cycle} cycle failed:`, err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : "");
        await recordError(env.DB, { source: "cron", route: cycle, ...describeThrown(err) });
        throw err;
      })
    );
  },
  /** Mail forwarded to inbox+<tag>@pinkslip.work (docs/email-tracking.md).
   * Failures are logged and the message dropped: throwing would bounce it back
   * to the user's mail provider, which can disable their forwarding. */
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    try {
      await handleInboundEmail(message, env);
    } catch (error) {
      console.error("Inbound email failed:", error instanceof Error ? error.message : String(error));
      await recordError(env.DB, { source: "email", route: "inbound", ...describeThrown(error) });
    }
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    try {
      switch (batch.queue) {
        case SOURCE_POLL_PRIORITY_QUEUE_NAME:
        case SOURCE_POLL_QUEUE_NAME:
          await handleSourcePollBatch(batch as MessageBatch<SourcePollMessage>, env);
          return;
        case NOTIFY_QUEUE_NAME:
          await handleNotifyBatch(batch as MessageBatch<NotifyMessage>, env);
          return;
        default:
          console.error(`Unhandled queue ${batch.queue}; retrying ${batch.messages.length} message(s)`);
          batch.retryAll();
      }
    } catch (error) {
      // Rethrown so the queue retries the batch, as before.
      await recordError(env.DB, { source: "queue", route: batch.queue, ...describeThrown(error) });
      throw error;
    }
  },
};
