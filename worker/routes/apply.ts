import { Hono } from "hono";
import { requireAuthenticated } from "../auth";
import { requireFlag } from "../feature-flags";
import { resolveJobId } from "../job-identity";
import { ApplyError, prepareApplication, saveApplicationAnswers } from "../apply/prepare";
import { learnAnswers, planApplication } from "../apply/plan";
import type { FormControl, FormControlKind } from "../../shared/application-form";
import type { Env, Variables } from "../types";

const apply = new Hono<{ Bindings: Env; Variables: Variables }>();

apply.use("*", requireAuthenticated, requireFlag("AUTO_APPLY"));

apply.onError((error, c) => {
  if (error instanceof ApplyError) {
    return c.json({ error: error.message, code: error.code }, error.status);
  }
  throw error;
});

apply.get("/jobs/:id", async (c) => {
  const jobId = await resolveJobId(c.env.DB, c.req.param("id"));
  return c.json(await prepareApplication(c.env, c.get("userId"), jobId));
});

apply.put("/jobs/:id/answers", async (c) => {
  const body = await c.req.json<{ answers?: unknown }>().catch(() => null);
  if (!body?.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
    return c.json({ error: "Missing answers", code: "invalid_request" }, 400);
  }
  const jobId = await resolveJobId(c.env.DB, c.req.param("id"));
  return c.json(await saveApplicationAnswers(
    c.env,
    c.get("userId"),
    jobId,
    body.answers as Record<string, unknown>,
  ));
});

const CONTROL_KINDS = new Set<FormControlKind>([
  "text", "textarea", "email", "tel", "url", "number", "date",
  "select", "combobox", "radio", "checkbox", "checkboxes", "buttons", "file",
]);

/** Page data comes from a third-party site, so keep only well-formed controls
 * and cap sizes; a university dropdown alone can list thousands of schools. */
function parseControls(raw: unknown): FormControl[] | null {
  if (!Array.isArray(raw) || raw.length > 300) return null;
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : null);
  const controls: FormControl[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const ref = text(record.ref, 40);
    const label = text(record.label, 2_000);
    const kind = record.kind as FormControlKind;
    if (!ref || label === null || !CONTROL_KINDS.has(kind)) return null;
    const options = Array.isArray(record.options)
      ? record.options.slice(0, 5_000).flatMap((option) => (typeof option === "string" ? [option.slice(0, 300)] : []))
      : [];
    const value = typeof record.value === "string"
      ? record.value.slice(0, 10_000)
      : Array.isArray(record.value)
        ? record.value.slice(0, 100).flatMap((entry) => (typeof entry === "string" ? [entry.slice(0, 300)] : []))
        : null;
    controls.push({ ref, kind, label, required: record.required === true, options, searchable: record.searchable === true, value });
  }
  return controls;
}

apply.post("/plan", async (c) => {
  const body = await c.req.json<{ job_id?: unknown; controls?: unknown }>().catch(() => null);
  const controls = parseControls(body?.controls);
  if (!controls) return c.json({ error: "Invalid form", code: "invalid_request" }, 400);
  const jobId = typeof body?.job_id === "string" && body.job_id ? await resolveJobId(c.env.DB, body.job_id) : null;
  return c.json(await planApplication(c.env, c.get("userId"), { jobId, controls }));
});

/** How a fill went, for measuring which forms work. Kinds and outcomes only;
 * never the answers. */
apply.post("/report", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: "Invalid report", code: "invalid_request" }, 400);
  const host = typeof body.host === "string" ? body.host.slice(0, 100) : "";
  const outcomes = body.outcomes && typeof body.outcomes === "object" ? body.outcomes as Record<string, unknown> : {};
  const counts: Record<string, number> = {};
  for (const value of Object.values(outcomes)) {
    if (typeof value === "string") counts[value.slice(0, 40)] = (counts[value.slice(0, 40)] ?? 0) + 1;
  }
  console.log(JSON.stringify({
    message: "auto-apply pass",
    host,
    page: typeof body.page === "string" ? body.page.slice(0, 200) : "",
    stage: typeof body.stage === "string" ? body.stage.slice(0, 40) : "",
    phase: typeof body.phase === "string" ? body.phase.slice(0, 40) : "",
    by: typeof body.by === "string" ? body.by.slice(0, 10) : "",
    controls: Number(body.controls) || 0,
    steps: Number(body.steps) || 0,
    needs: Number(body.needs) || 0,
    open_required: Array.isArray(body.open_required) ? body.open_required.slice(0, 30).map((label) => String(label).slice(0, 80)) : [],
    resume: body.resume === true,
    fill_ms: Number(body.fill_ms) || 0,
    counts,
    failed: Array.isArray(body.failed) ? body.failed.slice(0, 30).map((item) => String(item).slice(0, 240)) : [],
  }));
  return c.body(null, 204);
});

apply.post("/learn", async (c) => {
  const body = await c.req.json<{ controls?: unknown }>().catch(() => null);
  const controls = parseControls(body?.controls);
  if (!controls) return c.json({ error: "Invalid form", code: "invalid_request" }, 400);
  return c.json({ saved: await learnAnswers(c.env.DB, c.get("userId"), controls) });
});

export default apply;
