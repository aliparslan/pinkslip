import { Hono } from "hono";
import { cors } from "hono/cors";
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
import companyRoutes from "./routes/companies";
import preferenceRoutes from "./routes/preferences";
import pushRoutes from "./routes/push";
import statRoutes from "./routes/stats";
import corpusRoutes from "./routes/corpus";
import profileRoutes from "./routes/profile";
import tailorRoutes from "./routes/tailor";
import runRoutes from "./routes/runs";
import authRoutes, { buildAccountState, completeEmailMagicLink } from "./routes/auth";
import resumeAssetRoutes from "./routes/resume-assets";
import interactionRoutes from "./routes/interactions";
import metricRoutes from "./routes/metrics";
import { runPollCycle } from "./poller";
import {
  defaultUserPreferenceState,
  loadUserPreferenceState,
} from "./user-preferences";
import { resolveAppTailorConfig } from "./tailor/config";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Credentialed CORS must NOT reflect arbitrary origins, or any website could make
// authenticated requests as the signed-in user and read the responses. Allow only
// our own web origin, the native Capacitor shells, and localhost during dev.
const ALLOWED_ORIGINS = new Set([
  "https://pinkslip.alip.dev",
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
    allowHeaders: ["Content-Type", "Authorization", "X-Pinkslip-Client"],
  })
);

// Baseline security headers on Worker responses. The static app shell sets its
// own (richer) headers via packages/client/public/_headers, since Cloudflare Assets
// serves it without invoking the Worker.
app.use("/*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  );
});

function appFeatures(env: Env) {
  const tailoring = resolveAppTailorConfig(env);
  return {
    access_required: Boolean(env.ACCESS_CODE?.trim()),
    tailoring_enabled: Boolean(tailoring),
    tailoring_provider: tailoring?.provider ?? null,
    tailoring_model: tailoring?.model ?? "",
  };
}

app.post("/api/access", async (c) => {
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

// Versioned native bootstrap is intentionally tiny and backwards-compatible.
// The App Store binary owns its UI bundle; this endpoint only establishes the
// opaque bearer session that replaces browser-cookie state inside WKWebView.
app.post("/api/v1/native/session", async (c) => {
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
app.route("/api/corpus", corpusRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api/resume-assets", resumeAssetRoutes);
app.route("/api", tailorRoutes);
app.route("/api/runs", runRoutes);
app.route("/api/interactions", interactionRoutes);
app.route("/api/metrics", metricRoutes);
app.route("/api/auth", authRoutes);
app.get("/auth/email/verify", async (c) =>
  completeEmailMagicLink(c.req.raw, c.env, c.get("userId"), c.get("sessionId"))
);
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    version: ["localhost", "127.0.0.1", "::1"].includes(new URL(c.req.url).hostname)
      ? "local"
      : "production",
    timestamp: new Date().toISOString(),
  })
);
// Company favicon proxy. The app never hits Google's favicon service from the
// user's device (no third party learns which companies they browse); responses
// cache at the edge and in the browser for a day.
app.get("/api/logo", async (c) => {
  const domain = (c.req.query("domain") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{0,252}$/.test(domain) || !domain.includes(".")) {
    return c.json({ error: "Invalid domain" }, 400);
  }
  const upstream = await fetch(
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
    { cf: { cacheEverything: true, cacheTtl: 86400 } }
  );
  if (!upstream.ok || !upstream.body) {
    return c.json({ error: "Logo unavailable" }, 404);
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
});
app.get("/api/me", async (c) => {
  const accountState = await buildAccountState(c.env.DB, c.get("userId"), c.get("sessionState"));
  return c.json({
    ...accountState,
    features: appFeatures(c.env),
  });
});
app.get("/api/bootstrap", async (c) => {
  const sessionState = c.get("sessionState");
  const [accountState, preferences] = await Promise.all([
    buildAccountState(c.env.DB, c.get("userId"), sessionState),
    sessionState === "anonymous"
      ? Promise.resolve(defaultUserPreferenceState())
      : loadUserPreferenceState(c.env.DB, c.get("userId")),
  ]);
  return c.json({
    me: { ...accountState, features: appFeatures(c.env) },
    preferences,
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
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // The rejection is deliberately NOT swallowed. Swallowing it is what let the
    // poll cycle die every 15 minutes for six weeks while Cloudflare reported
    // `outcome: "ok"` with zero exceptions — nothing anywhere went red. Log for
    // context, then rethrow so the invocation is recorded as failed.
    ctx.waitUntil(
      runPollCycle(env)
        .then((result) => {
          console.log(`Poll complete: ${result.companiesPolled} companies, ${result.newJobsFound} new jobs, ${result.notificationsSent} notifications`);
        })
        .catch((err) => {
          console.error("Poll cycle failed:", err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : "");
          throw err;
        })
    );
  },
};
