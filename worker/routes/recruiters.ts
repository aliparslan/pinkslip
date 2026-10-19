import { Hono } from "hono";
import { ACTUAL_ROLES, WORKS_THERE_ANSWERS, type RecruiterRun } from "../../shared/recruiter-review";
import { requireAdmin } from "../auth";
import { hasTable } from "../db-schema";
import { serperSearch, sourceCompany } from "../outreach/sourcing/source-company";
import {
  companiesToSource,
  labelCandidate,
  recruiterReview,
  saveSourcing,
  saveSourcingError,
  type CandidateLabels,
} from "../outreach/sourcing/store";
import { syncCandidateContact, syncCompanyCandidates } from "../outreach/contacts";
import type { Env, Variables } from "../types";

/** Admin review of recruiter sourcing: run it on a few catalog companies and
 * label who it found. Someone labelled "works there: yes" (and not "not a
 * recruiter") is listed on their company's People, at the guessed address;
 * nobody else reaches users. See docs/recruiter-contacts-sourcing.md. */
const recruiters = new Hono<{ Bindings: Env; Variables: Variables }>();

recruiters.use("*", requireAdmin);

const MAX_COMPANIES_PER_RUN = 10;

recruiters.get("/", async (c) => {
  if (!await hasTable(c.env.DB, "recruiter_candidates")) return c.json({ available: false });
  return c.json({ available: true, can_run: Boolean(c.env.SERPER_API_KEY), ...await recruiterReview(c.env.DB) });
});

/** Sources a few random companies that haven't been, one after another.
 * Each uses four search credits. */
recruiters.post("/run", async (c) => {
  const key = c.env.SERPER_API_KEY;
  if (!key) return c.json({ error: "SERPER_API_KEY isn't set." }, 503);
  const body = await c.req.json<{ count?: unknown }>().catch(() => ({}) as { count?: unknown });
  const count = typeof body.count === "number" && Number.isInteger(body.count)
    ? Math.min(Math.max(body.count, 1), MAX_COMPANIES_PER_RUN)
    : 5;
  const search = serperSearch(key);
  const runs: RecruiterRun[] = [];
  for (const company of await companiesToSource(c.env.DB, count)) {
    const now = new Date().toISOString();
    try {
      const result = await sourceCompany(company.name, company.site, search);
      await saveSourcing(c.env.DB, company, result, now);
      // A recruiter already on People keeps up with a changed guess.
      await syncCompanyCandidates(c.env.DB, company.id);
      const kept = result.people.filter((row) => row.reason === null).length;
      runs.push({ company: company.name, kept, left_out: result.people.length - kept, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await saveSourcingError(c.env.DB, company, message, now);
      runs.push({ company: company.name, kept: 0, left_out: 0, error: message });
    }
  }
  return c.json({ runs });
});

recruiters.put("/candidates/:id", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const labels: CandidateLabels = {};
  if ("works_there" in body) {
    if (body.works_there !== null && !(WORKS_THERE_ANSWERS as readonly unknown[]).includes(body.works_there)) {
      return c.json({ error: "works_there must be yes, no, unsure or null" }, 400);
    }
    labels.works_there = body.works_there as CandidateLabels["works_there"];
  }
  if ("actual_role" in body) {
    if (body.actual_role !== null && !(ACTUAL_ROLES as readonly unknown[]).includes(body.actual_role)) {
      return c.json({ error: "actual_role must be early_career, other_recruiter, not_recruiter or null" }, 400);
    }
    labels.actual_role = body.actual_role as CandidateLabels["actual_role"];
  }
  const candidate = await labelCandidate(c.env.DB, c.req.param("id"), labels, new Date().toISOString());
  if (!candidate) return c.json({ error: "Not found" }, 404);
  // "Works there: yes" lists them on their company's People (owner, 2026-10-19).
  await syncCandidateContact(c.env.DB, candidate.id);
  return c.json(candidate);
});

export default recruiters;
