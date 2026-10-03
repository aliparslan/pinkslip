import { describe, expect, test } from "bun:test";
import { DEFAULT_SEARCH_PROFILE, normalizeSearchProfile } from "../shared/search-profile";
import { notificationJobMatchesCurrentProfile } from "../worker/notification-delivery";
import { parseStoredQualifications } from "../worker/qualification-requirements";
import { classifyJob } from "../worker/job-features";
import { evaluateJobForProfile } from "../worker/user-job-matches";

function match(title: string, description: string, preferences: Record<string, unknown> = {}, location = "Remote - US") {
  const listing = { externalId: "doctoral", title, description, location, postedAt: null, url: "https://example.com/job", salary: null, department: null };
  const profile = normalizeSearchProfile({ ...DEFAULT_SEARCH_PROFILE, roles: ["software_engineering", "machine_learning", "research"], location_ids: [], onboarding_version: 3, onboarding_completed_at: "2026-10-01", ...preferences });
  const features = classifyJob(listing);
  features.qualification_requirements = parseStoredQualifications(JSON.stringify(features.qualification_requirements))!;
  const result = evaluateJobForProfile("doctoral", listing, features, profile);
  expect(notificationJobMatchesCurrentProfile("doctoral", listing, features, profile)).toBe(result.plausible);
  return result;
}
const student = { doctoral_student: true, highest_education: "master", target_levels: ["internship"] };

describe("five-year and doctoral matching", () => {
  test("admits five-year minima, excludes six, and preserves explicit personal ceilings", () => {
    for (const text of ["At least 5 years of experience.", "5+ years of experience required.", "5-7 years of experience required."]) {
      expect(match("Software Engineer", text).plausible).toBe(true);
      expect(match("Software Engineer", text, { max_required_years: 3 }).plausible).toBe(false);
    }
    expect(match("Software Engineer", "6+ years of experience required.").plausible).toBe(false);
  });
  test("requires numeric evidence for senior titles and keeps leadership excluded", () => {
    expect(match("Senior Software Engineer", "5+ years of experience required.").plausible).toBe(true);
    expect(match("Senior Software Engineer", "Build software.").plausible).toBe(false);
    for (const title of ["Staff Software Engineer", "Principal Software Engineer", "Engineering Manager"]) {
      expect(match(title, "PhD required. 1 year of experience required.", { highest_education: "doctorate" }).plausible).toBe(false);
    }
  });
  test("completed doctoral jobs require a completed doctorate", () => {
    for (const education of ["unspecified", "bachelor", "master"]) {
      expect(match("Software Engineer", "PhD required.", { highest_education: education, doctoral_student: true }).plausible).toBe(false);
    }
    expect(match("Software Engineer", "PhD required.", { highest_education: "doctorate" }).plausible).toBe(true);
  });
  test("doctoral enrollment is independent of completed education", () => {
    const text = "Requirements\nCurrently pursuing a PhD in computer science.";
    expect(match("Software Engineer Intern", text, student).plausible).toBe(true);
    expect(match("Software Engineer Intern", text, { highest_education: "doctorate" }).plausible).toBe(false);
    expect(match("Software Engineer Intern", text).plausible).toBe(false);
    expect(match("Software Engineer Intern, PhD", "Build software.", student).plausible).toBe(true);
  });
  test("ordinary internships and incidental PhD mentions do not reach doctoral students", () => {
    for (const text of ["Build software.", "Currently pursuing a bachelor's degree.", "Currently pursuing a master's degree.", "Work with a team of PhD researchers.", "Mentor PhD students.", "PhD preferred.", "Preferred qualifications\nCurrently pursuing a PhD."]) {
      expect(match("Software Engineer Intern", text, student).plausible).toBe(false);
    }
  });
  test("includes explicit mixed cohorts even when an older client requests the former exclusive mode", () => {
    for (const text of ["Requirements\nCurrently pursuing a BS/MS/PhD in computer science.", "Requirements\nCurrently enrolled in a bachelor's, master's or PhD program."]) {
      expect(match("Software Engineer Intern", text, student).plausible).toBe(true);
      expect(match("Software Engineer Intern", text, { ...student, doctoral_internships: "only" }).plausible).toBe(true);
    }
    for (const text of ["Requirements\nCurrently pursuing a PhD.", "Currently pursuing a PhD.", "Currently enrolled in a doctoral program.", "Must be a doctoral student."]) {
      expect(match("Software Engineer Intern", text, { ...student, doctoral_internships: "only" }).plausible).toBe(true);
    }
  });
  test("completed degree by joining takes precedence over enrollment", () => {
    const text = "Requirements\nCurrently pursuing a PhD. PhD degree must be completed before joining.";
    expect(match("Software Engineer Intern, PhD", text, student).plausible).toBe(false);
  });
  test("keeps degree-specific experience routes and country/clearance gates", () => {
    const text = "Requirements\nBachelor's + 5 years OR master's + 3 years OR PhD + 1 year.";
    for (const [education, years] of [["bachelor", 5], ["master", 3], ["doctorate", 1]] as const) {
      expect(match("Software Engineer", text, { highest_education: education }).requiredYears).toBe(years);
      expect(match("Software Engineer", text, { highest_education: education, max_required_years: years - 1 }).plausible).toBe(false);
    }
    expect(match("Software Engineer Intern, PhD", "Currently pursuing a PhD.", student, "London, UK").plausible).toBe(false);
    expect(match("Software Engineer Intern, PhD", "Currently pursuing a PhD. Active Secret clearance required.", student).plausible).toBe(false);
  });
  test("existing users retain their explicit cap and doctoral preferences normalize safely", () => {
    expect(normalizeSearchProfile({ ...DEFAULT_SEARCH_PROFILE, version: 5, max_required_years: 3 })).toMatchObject({ max_required_years: 3, doctoral_student: false });
    expect(normalizeSearchProfile({ version: 5 })).toMatchObject({ max_required_years: 3, doctoral_student: false });
    expect(normalizeSearchProfile({ ...DEFAULT_SEARCH_PROFILE, doctoral_internships: "only" })).toMatchObject({ doctoral_internships: "eligible" });
    expect(normalizeSearchProfile({ ...DEFAULT_SEARCH_PROFILE, doctoral_student: "true", doctoral_internships: "invalid" })).toMatchObject({ doctoral_student: false, doctoral_internships: "eligible" });
  });
  test("graduate vacancies are not internships because a shared application policy mentions them", () => {
    const text = "As a Graduate Quantitative Researcher, build predictive models. Gain insight into how PhD students transition into industry. Requirements: PhD in Computer Science. Expected to graduate by mid-2027 and available to start full-time employment upon graduation. Our global application re-apply policy applies if you interviewed for a quantitative graduate or internship role in the past 8 months.";
    expect(match("Graduate Quantitative Researcher, PhD", text, { ...student, roles: ["research"] }).plausible).toBe(false);
    expect(match("Graduate Quantitative Researcher, PhD", text, { highest_education: "doctorate", roles: ["research"], target_levels: ["new_grad"] }).plausible).toBe(true);
  });

});
