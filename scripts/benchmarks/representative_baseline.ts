/** Offline projection of the current production parser, with no DB writes. */
import fs from "node:fs";
import { classifyJob, classifyReviewReasons } from "../../worker/job-features";
import { classifyTitleScope } from "../../worker/job-scope";
import { isUsJobLocation } from "../../worker/us-jobs";
import { qualificationYearsForProfile } from "../../worker/qualification-requirements";
import { normalizeSearchProfile } from "../../shared/search-profile";

const root = process.argv[2];
if (!root) throw new Error("Usage: bun scripts/benchmarks/representative_baseline.ts <private dataset directory>");
const jobs = JSON.parse(fs.readFileSync(`${root}/dataset.json`, "utf8"));
const specialties: Record<string, string> = {
  software_engineering: "software_general", forward_deployed: "software_general",
  frontend: "frontend", backend: "backend", full_stack: "full_stack", mobile: "mobile",
  data_engineering: "data_engineering", machine_learning: "machine_learning",
  research: "research", infrastructure: "infrastructure", security: "security",
};
const results = jobs.map((j: any) => {
  const listing = { ...j, description: j.description_text, location: j.location ?? "", postedAt: null, url: j.url ?? "https://example.com/offline-control" };
  const start = performance.now();
  const f = classifyJob(listing);
  const review = classifyReviewReasons(listing, f);
  const scope = classifyTitleScope(j.title, j.department, []);
  const requirements = f.qualification_requirements!;
  const profile = (education: string, student = false) => normalizeSearchProfile({ highest_education: education, doctoral_student: student });
  const encode = (years: number | null | undefined) => years === undefined ? "no_route" : years === null ? "unspecified" : years > 10 ? "11_plus" : String(years);
  const nonDoctoral = qualificationYearsForProfile(requirements, profile("master"), null);
  const cohort = f.seniority !== "internship" ? "not_internship"
    : requirements.doctoral_internship_eligibility !== "other" ? "yes"
    : requirements.doctorate_requirement === "completed" ? "no" : "unknown";
  const choices: Record<string, string> = {
    us_eligibility: isUsJobLocation(listing.location) ? "yes" : "no",
    work_mode: f.work_mode,
    seniority: f.seniority === "manager" ? "management" : f.seniority,
    min_years: nonDoctoral === undefined ? "no_non_doctoral_path" : nonDoctoral === null ? "none_stated" : encode(nonDoctoral),
    job_family: f.role_family === "engineering" ? "software" : f.role_family,
    specialty: !scope.admitted ? "nontechnical" : specialties[f.specialties[0]] ?? "unknown",
    doctorate_gate: f.requires_advanced_degree ? "required" : review.includes("advanced_degree_uncertain") ? "unclear" : "not_required",
    doctorate_status: requirements.doctorate_requirement ?? "none",
    clearance_gate: f.requires_security_clearance ? "required" : "not_required",
    phd_internship_eligibility: cohort,
  };
  for (const [key, education, student] of [["bachelor", "bachelor", false], ["master", "master", false], ["doctorate", "doctorate", false], ["phd_student", "master", true]] as const) {
    choices[`years_${key}`] = encode(qualificationYearsForProfile(requirements, profile(education, student), f.min_years));
  }
  return { id: j.id, provider: "baseline", choices, features: f, review_reasons: review, scope, latency_seconds: (performance.now() - start) / 1000 };
});
fs.writeFileSync(`${root}/baseline-results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ cases: results.length, unsupported_dimensions: ["location_region", "programming_languages"], note: "Raw parser projection; not a measurement of end-to-end catalog decisions." }));
