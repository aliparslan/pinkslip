import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import jobRoutes from "./routes/jobs";
import companyRoutes from "./routes/companies";
import preferenceRoutes from "./routes/preferences";
import pushRoutes from "./routes/push";
import statRoutes from "./routes/stats";
import { runPollCycle } from "./poller";

const app = new Hono<{ Bindings: Env }>();
app.use("/*", cors());

app.route("/api/jobs", jobRoutes);
app.route("/api/companies", companyRoutes);
app.route("/api/preferences", preferenceRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/stats", statRoutes);
app.get("/api/health", (c) => c.json({ ok: true }));

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
