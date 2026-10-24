/**
 * Phase 0 of auto-apply: for each posting, the test Worker opens and reads
 * the form, the real planner (worker/apply/plan.ts) answers it as the sample
 * Jordan Lee from a local database, and the Worker fills it and takes a
 * picture. It never submits.
 *   bun scripts/auto-apply-spike/run.ts <postings.json> <out dir>
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { applicationUrl } from "../../worker/apply/forms";
import { planApplication } from "../../worker/apply/plan";
import type { Env } from "../../worker/types";
import { createEmptyResumeProfile, type ResumeProfile } from "../../shared/resume-profile";
import { sqliteD1 } from "../../tests/sqlite-d1";

const [postingsPath, outDir] = process.argv.slice(2);
const WORKER = "http://localhost:8790";
mkdirSync(`${outDir}/shots`, { recursive: true });

const empty = createEmptyResumeProfile();
/** The sample person (docs/design-system.md): a recent grad, personal email. */
const jordan: ResumeProfile = {
  ...empty,
  contact: { ...empty.contact, name: "Jordan Lee", email: "jordan@lee.dev", phone: "2125550147", location: "New York, NY", linkedin: "linkedin.com/in/jordanlee" },
  education: [{
    id: "e", institution: "New York University",
    credentials: [{ id: "c", degreeType: "bachelor", fieldsOfStudy: ["Computer Science"] }],
    minors: [], location: "New York, NY", startDate: "Sep 2022", endDate: "May 2026",
  }],
  experience: [{ id: "x", company: "Ramp", title: "Software Engineer Intern", location: "New York, NY", startDate: "Jun 2025", endDate: "Aug 2025", bullets: [] }],
  skills: [{ category: "Languages", items: "TypeScript, Python, SQL" }],
};

const { sqlite, db } = sqliteD1();
const migrations = new URL("../../migrations/", import.meta.url).pathname;
for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(readFileSync(`${migrations}${file}`, "utf8"));
sqlite.run(`INSERT INTO users (id, name) VALUES ('sample', 'Jordan Lee')`);
sqlite.run(`INSERT INTO user_profiles (user_id, data) VALUES ('sample', ?)`, [JSON.stringify(jordan)]);
sqlite.run(`INSERT INTO user_search_profiles (user_id, profile_json, onboarding_completed_at) VALUES ('sample', '{"work_authorization":"authorized"}', '2026-10-01')`);
const env = { DB: db } as Env;
const resume = { name: "Jordan_Lee.pdf", base64: Buffer.from(readFileSync(new URL("../../apps/native/assets/fixtures/resume-text.pdf", import.meta.url).pathname)).toString("base64") };

interface Posting { id: string; external_id: string; title: string; url: string; company: string; ats: string; slug: string }
const postings = JSON.parse(readFileSync(postingsPath!, "utf8")) as Posting[];
const post = async (path: string, body: unknown) => (await fetch(`${WORKER}${path}`, { method: "POST", body: JSON.stringify(body) })).json() as Promise<Record<string, any>>;

const results = [];
for (const posting of postings) {
  const url = posting.ats === "lever"
    ? `https://jobs.lever.co/${posting.slug}/${posting.external_id}/apply`
    : applicationUrl({ ats: posting.ats as "greenhouse" | "ashby", slug: posting.slug, externalId: posting.external_id } as never);
  const started = Date.now();
  const result: Record<string, unknown> = { ats: posting.ats, company: posting.company, title: posting.title, url };
  try {
    const read = await post("/read", { url });
    const controls = (read.read?.controls ?? []) as Array<{ ref: string; kind: string; label: string; required: boolean }>;
    Object.assign(result, {
      status: read.status, finalUrl: read.finalUrl, title_tag: read.title, blocked: read.blocked, checks: read.checks,
      loadMs: read.loadMs, controls: controls.length, required: controls.filter((control) => control.required).length,
      alreadySubmitted: read.read?.submitted ?? null, readError: read.error,
    });
    if (controls.length && read.sessionId) {
      const plan = await planApplication(env, "sample", { jobId: null, controls: controls as never });
      const fill = await post("/fill", { sessionId: read.sessionId, url: read.finalUrl, request: { steps: plan.steps, resume } });
      const outcomes = Object.values((fill.report?.outcomes ?? {}) as Record<string, string>);
      Object.assign(result, {
        planned: plan.steps.length,
        needs: plan.needs.length,
        needsRequired: plan.needs.filter((need) => need.required).length,
        needLabels: plan.needs.filter((need) => need.required).map((need) => need.label.slice(0, 80)),
        filled: outcomes.filter((outcome) => outcome === "filled").length,
        fillProblems: outcomes.filter((outcome) => outcome !== "filled").length,
        fillMs: fill.fillMs, fillError: fill.error,
      });
      if (fill.screenshot) {
        const file = `${outDir}/shots/${posting.ats}-${posting.company.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.jpg`;
        writeFileSync(file, Buffer.from(fill.screenshot, "base64"));
        result.screenshot = file;
      }
    }
  } catch (error) {
    result.error = String(error);
  }
  result.totalMs = Date.now() - started;
  results.push(result);
  console.log(JSON.stringify({ ats: result.ats, company: result.company, status: result.status, blocked: result.blocked, checks: result.checks, controls: result.controls, filled: result.filled, needsRequired: result.needsRequired, ms: result.totalMs, error: result.error ?? result.readError ?? result.fillError ?? null }));
}
writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 1));
