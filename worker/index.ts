import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./types";
import { authMiddleware } from "./auth";
import jobRoutes from "./routes/jobs";
import companyRoutes from "./routes/companies";
import preferenceRoutes from "./routes/preferences";
import pushRoutes from "./routes/push";
import statRoutes from "./routes/stats";
import applicationRoutes from "./routes/applications";
import eventRoutes from "./routes/events";
import { runPollCycle, pollCompany, loadPreferencesForPoll } from "./poller";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use("/*", cors({ origin: (origin) => origin || "*", credentials: true }));
app.use("/api/*", authMiddleware);

app.route("/api/jobs", jobRoutes);
app.route("/api/companies", companyRoutes);
app.route("/api/preferences", preferenceRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/stats", statRoutes);
app.route("/api/applications", applicationRoutes);
app.route("/api/events", eventRoutes);
app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/me", async (c) => {
  const userId = c.get("userId");
  const user = await c.env.DB.prepare("SELECT id, name, created_at FROM users WHERE id = ?")
    .bind(userId).first();
  return c.json({ user });
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
  const db = c.env.DB;

  const q = limit > 0
    ? db.prepare("SELECT * FROM companies WHERE enabled = 1 AND ats_type != 'custom' LIMIT ?").bind(limit)
    : db.prepare("SELECT * FROM companies WHERE enabled = 1 AND ats_type != 'custom'");

  const companies = (await q.all<import("./types").CompanyRow>()).results ?? [];
  const prefs = await loadPreferencesForPoll(db);

  let totalNew = 0;
  const log: string[] = [];
  for (const company of companies) {
    try {
      const newJobs = await pollCompany(company, db, prefs);
      totalNew += newJobs.length;
      log.push(`${company.name}: ${newJobs.length} new`);
    } catch (e: any) {
      log.push(`${company.name}: ERROR ${e.message}`);
    }
  }

  return c.json({ companiesPolled: companies.length, newJobsFound: totalNew, log });
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runPollCycle(env).then((result) => {
        console.log(`Poll complete: ${result.companiesPolled} companies, ${result.newJobsFound} new jobs, ${result.notificationsSent} notifications`);
      })
    );
  },
};
