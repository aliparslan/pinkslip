/**
 * Phase 1's send engine as a dry run on real forms: the test Worker opens
 * each form in Cloudflare's browser, declines cookies, uploads the resume and
 * waits for the site's autofill; the real planner answers as the sample
 * Jordan Lee, with the job (so former-employer questions know the company);
 * the Worker fills, rechecks and takes a picture. It never submits.
 *   bun scripts/auto-apply-spike/dry-run.ts <postings.json> <out dir>
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { applicationUrl } from "../../worker/apply/forms";
import { planApplication } from "../../worker/apply/plan";
import type { Env } from "../../worker/types";
import { createEmptyResumeProfile, type ResumeProfile } from "../../shared/resume-profile";
import { sqliteD1 } from "../../tests/sqlite-d1";

const [postingsPath, outDir] = process.argv.slice(2);
const WORKER = "http://localhost:8790";
mkdirSync(`${outDir}/shots`, { recursive: true });

const empty = createEmptyResumeProfile();
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

interface Posting { id: string; external_id: string; title: string; company: string; ats: string; slug: string }
const postings = (JSON.parse(readFileSync(postingsPath!, "utf8")) as Posting[]).filter((posting) => posting.ats !== "lever");

const { sqlite, db } = sqliteD1();
const migrations = new URL("../../migrations/", import.meta.url).pathname;
for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(readFileSync(`${migrations}${file}`, "utf8"));
sqlite.run(`INSERT INTO users (id, name) VALUES ('sample', 'Jordan Lee')`);
sqlite.run(`INSERT INTO user_profiles (user_id, data) VALUES ('sample', ?)`, [JSON.stringify(jordan)]);
sqlite.run(`INSERT INTO user_search_profiles (user_id, profile_json, onboarding_completed_at) VALUES ('sample', '{"work_authorization":"authorized"}', '2026-10-01')`);
// The migrations seed most catalog companies already; use theirs.
for (const posting of postings) {
  sqlite.run("INSERT OR IGNORE INTO companies (id, name, ats_type, ats_slug) VALUES (?, ?, ?, ?)", [posting.slug, posting.company, posting.ats, posting.slug]);
  const company = sqlite.query("SELECT id FROM companies WHERE ats_type = ? AND ats_slug = ?").get(posting.ats, posting.slug) as { id: string };
  sqlite.run("INSERT INTO jobs (id, company_id, external_id, title, url) VALUES (?, ?, ?, ?, '')", [posting.id, company.id, posting.external_id, posting.title]);
}
const env = { DB: db } as Env;
const resume = { name: "Jordan_Lee.pdf", base64: Buffer.from(readFileSync(new URL("../../apps/native/assets/fixtures/resume-text.pdf", import.meta.url).pathname)).toString("base64") };
const post = async (path: string, body: unknown) => (await fetch(`${WORKER}${path}`, { method: "POST", body: JSON.stringify(body) })).json() as Promise<Record<string, any>>;

const results = [];
for (const posting of postings) {
  const url = applicationUrl({ ats: posting.ats as "greenhouse" | "ashby", slug: posting.slug, externalId: posting.external_id } as never)!;
  const result: Record<string, unknown> = { ats: posting.ats, company: posting.company, url };
  const started = Date.now();
  try {
    const prepared = await post("/prepare", { url, resume });
    Object.assign(result, { status: prepared.status, blocked: prepared.blocked, kind: prepared.prepared?.kind, prepareMs: prepared.ms, error: prepared.error });
    if (prepared.prepared?.kind === "ready") {
      const ready = prepared.prepared;
      const plan = await planApplication(env, "sample", { jobId: posting.id, controls: ready.planning }, undefined);
      let finished = await post("/finish", { sessionId: prepared.sessionId, url: prepared.url, plan, prepared: ready, resume });
      if (finished.revealed) {
        // Searches that list their options only when opened: plan them with
        // the options, fill those picks, and check the form.
        const again = await planApplication(env, "sample", { jobId: posting.id, controls: finished.revealed }, undefined);
        result.revealed = finished.revealed.map((control: { label: string; options: string[] }) => `${control.label.slice(0, 40)}: ${control.options.slice(0, 6).join(" | ")}`);
        result.picked = again.steps.map((step) => String(step.value));
        finished = await post("/finish", { sessionId: prepared.sessionId, url: prepared.url, plan: { steps: again.steps }, prepared: ready, resume, replanned: true });
      }
      const controls = (finished.filled?.controls ?? []) as Array<{ ref: string; label: string; value: unknown; required: boolean; kind: string }>;
      const outcomes = Object.values((finished.filled?.outcomes ?? {}) as Record<string, string>);
      const consent = controls.filter((control) => control.kind === "checkbox" && !control.required && control.value);
      Object.assign(result, {
        cookies: ready.cookies,
        siteFilled: ready.siteFilled.map((ref: string) => controls.find((control) => control.ref === ref)?.label?.slice(0, 50)),
        controls: controls.length,
        planned: plan.steps.length,
        filled: outcomes.filter((outcome) => outcome === "filled").length,
        fillProblems: outcomes.filter((outcome) => outcome !== "filled").length,
        openRequired: (finished.filled?.open ?? []).map((control: { label: string }) => control.label.slice(0, 90)),
        optionalTicked: consent.map((control) => control.label.slice(0, 80)),
        formerEmployer: controls.filter((control) => /employed|worked (for|at)/i.test(control.label)).map((control) => `${control.label.slice(0, 60)} → ${String(control.value)}`),
        final: controls.map((control) => `${control.ref} ${control.kind} ${control.required ? "REQ" : "   "} ${control.label.slice(0, 60)} = ${JSON.stringify(control.value)?.slice(0, 40)}`),
        errors: finished.filled?.errors ?? [],
        finishMs: finished.ms,
        finishError: finished.error,
      });
      if (finished.screenshot) {
        const file = `${outDir}/shots/${posting.ats}-${posting.company.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.jpg`;
        writeFileSync(file, Buffer.from(finished.screenshot, "base64"));
        result.screenshot = file;
      }
    }
  } catch (error) {
    result.error = String(error);
  }
  result.totalMs = Date.now() - started;
  results.push(result);
  console.log(JSON.stringify(result));
}
writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 2));
