import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { DEFAULT_SEARCH_PROFILE, normalizeSearchProfile } from "../shared/search-profile";
import { classifyJob, parseExperienceRequirement, parseQualificationRequirements, storedJobFeaturesFromRow, type StoredJobFeatureColumns } from "../worker/job-features";
import { evaluateJobForProfile } from "../worker/user-job-matches";
import { parseStoredQualifications } from "../worker/qualification-requirements";

function matched(description: string, preferences: Record<string, unknown> = {}) {
  const listing = { externalId: "q", title: "Software Engineer", location: "Remote - US", url: "https://example.com/q", department: "Engineering", postedAt: null, salary: null, description };
  return evaluateJobForProfile("q", listing, classifyJob(listing), normalizeSearchProfile({ ...DEFAULT_SEARCH_PROFILE, location_ids: [], ...preferences })).plausible;
}

describe("education and experience preferences", () => {
  test("migrates v4 without resetting confirmed role or stage selections", () => {
    const profile = normalizeSearchProfile({ ...DEFAULT_SEARCH_PROFILE, version: 4, roles: ["software_engineering"], target_levels: ["new_grad"], highest_education: undefined, max_required_years: undefined });
    expect(profile.roles).toEqual(["software_engineering"]);
    expect(profile.target_levels).toEqual(["new_grad"]);
    expect(profile.highest_education).toBe("unspecified");
    expect(profile.max_required_years).toBe(3);
  });
  test("validates education, preserves follow-my-experience and clamps the public ceiling", () => {
    expect(normalizeSearchProfile({ highest_education: "invented", max_required_years: 20, include_unspecified_experience: "false" })).toMatchObject({ highest_education: "unspecified", max_required_years: 3, include_unspecified_experience: true });
    expect(normalizeSearchProfile({ years_experience: 0, max_required_years: null })).toMatchObject({ years_experience: 0, max_required_years: null });
  });
  test("actual years filter when requested, while an explicit stretch remains independent", () => {
    const description = "At least 2 years of experience building software.";
    expect(matched(description, { years_experience: 1, max_required_years: null })).toBe(false);
    expect(matched(description, { years_experience: 2, max_required_years: null })).toBe(true);
    expect(matched(description, { years_experience: 0, max_required_years: 3 })).toBe(true);
    expect(matched("At least 4 years of experience.", { years_experience: 20, max_required_years: null })).toBe(false);
  });
  test("zero means zero and unspecified years are separately controllable", () => {
    expect(matched("At least 1 year of experience.", { max_required_years: 0 })).toBe(false);
    expect(matched("0-2 years of experience.", { max_required_years: 0, include_unspecified_experience: false })).toBe(true);
    expect(matched("Build useful software.", { include_unspecified_experience: false })).toBe(false);
    expect(matched("Build useful software.")).toBe(true);
  });
  test("filters mandatory degrees only when education is selected", () => {
    const description = "<h2>Requirements</h2><li>Bachelor's degree in computer science.</li>";
    expect(matched(description, { highest_education: "none" })).toBe(false);
    expect(matched(description, { highest_education: "associate" })).toBe(false);
    expect(matched(description, { highest_education: "bachelor" })).toBe(true);
    expect(matched(description, { highest_education: "master" })).toBe(true);
    expect(matched(description)).toBe(true);
  });
  test("does not treat a preferred degree or team biography as mandatory", () => {
    for (const description of ["Master's degree preferred.", "<h2>Nice-to-haves</h2><li>Master's degree</li>", "Work with a team of PhD and master's graduates.", "Our company was founded by PhD researchers.", "No degree is required."]) {
      expect(matched(description, { highest_education: "none" })).toBe(true);
    }
  });
  test("unknown education remains included and degree enrollment is not a completed credential", () => {
    expect(matched("Build useful software.", { highest_education: "none" })).toBe(true);
    expect(parseQualificationRequirements("<h2>Requirements</h2><li>Currently pursuing a bachelor's degree.</li>").groups).toEqual([]);
  });
  test("keeps bachelor's + 4 and master's + 2 routes linked", () => {
    const description = "<h2>Basic qualifications</h2><li>Bachelor's degree and 4 years of experience OR master's degree and 2 years of experience.</li>";
    expect(parseExperienceRequirement("Software Engineer", description)).toEqual({ min: 2, max: null });
    expect(matched(description, { highest_education: "bachelor", max_required_years: 3 })).toBe(false);
    expect(matched(description, { highest_education: "master", years_experience: 1, max_required_years: null })).toBe(false);
    expect(matched(description, { highest_education: "master", years_experience: 2, max_required_years: null })).toBe(true);
    expect(matched(description, { highest_education: "doctorate", max_required_years: 2 })).toBe(true);
  });
  test("recognizes abbreviated and dotted degree routes", () => {
    const description = "<h2>Requirements</h2><li>B.S. + 4 years OR M.S. + 2 years.</li>";
    expect(matched(description, { highest_education: "bachelor" })).toBe(false);
    expect(matched(description, { highest_education: "master", max_required_years: 2 })).toBe(true);
  });
  test("independent required bullets still apply to every alternative", () => {
    const description = "<h2>Requirements</h2><li>Bachelor's + 3 years OR master's + 1 year.</li><li>At least 2 years of experience with Python.</li>";
    expect(parseExperienceRequirement("Software Engineer", description).min).toBe(2);
    expect(matched(description, { highest_education: "master", max_required_years: 1 })).toBe(false);
    expect(matched(description, { highest_education: "master", max_required_years: 2 })).toBe(true);
    expect(matched(description, { highest_education: "bachelor", max_required_years: 2 })).toBe(false);
  });
  test("does not split fields of study into qualification alternatives", () => {
    const description = "Bachelor's degree in computer science or engineering and 2 years of experience required.";
    expect(matched(description, { highest_education: "none" })).toBe(false);
    expect(matched(description, { highest_education: "bachelor", max_required_years: 2 })).toBe(true);
    expect(parseQualificationRequirements(description).groups[0]).toHaveLength(1);
  });
  test("allows an explicit equivalent-experience route without inventing extra years", () => {
    const description = "<h2>Requirements</h2><li>Bachelor's degree or equivalent practical experience.</li><li>At least 2 years of experience.</li>";
    expect(matched(description, { highest_education: "none", max_required_years: 2 })).toBe(true);
    expect(matched(description, { highest_education: "none", max_required_years: 1 })).toBe(false);
  });
  test("respects quantified equivalent-experience alternatives", () => {
    const description = "<h2>Requirements</h2><li>Master's degree + 1 year OR 3 years of equivalent experience.</li>";
    expect(matched(description, { highest_education: "bachelor", max_required_years: 2 })).toBe(false);
    expect(matched(description, { highest_education: "bachelor", max_required_years: 3 })).toBe(true);
    expect(matched(description, { highest_education: "master", max_required_years: 1 })).toBe(true);
  });
  test("doctorate alternatives do not erase the non-doctoral experience requirement", () => {
    const description = "<h2>Requirements</h2><li>Master's degree and 3 years of experience OR PhD.</li>";
    expect(parseExperienceRequirement("Software Engineer", description).min).toBe(3);
    expect(matched(description, { highest_education: "master", max_required_years: 2 })).toBe(false);
    expect(matched(description, { highest_education: "master", max_required_years: 3 })).toBe(true);
    expect(matched("PhD required.", { highest_education: "doctorate" })).toBe(false);
  });
  test("preferred section years do not affect eligibility, later required section does", () => {
    const description = "<h2>Preferred qualifications</h2><li>Master's degree and 7+ years of experience.</li><h2>Required qualifications</h2><li>2+ years of experience.</li>";
    expect(parseExperienceRequirement("Software Engineer", description).min).toBe(2);
    expect(matched(description, { highest_education: "none", max_required_years: 2 })).toBe(true);
  });
  test("a preferred credential in the same bullet does not erase required qualifications", () => {
    const description = "<h2>Requirements</h2><li>Bachelor's degree required, master's preferred.</li><li>At least 2 years of experience, PhD preferred.</li>";
    expect(matched(description, { highest_education: "none", max_required_years: 3 })).toBe(false);
    expect(matched(description, { highest_education: "bachelor", max_required_years: 1 })).toBe(false);
    expect(matched(description, { highest_education: "bachelor", max_required_years: 2 })).toBe(true);
  });
  test("respects plain-text section boundaries and common undotted degree spellings", () => {
    const description = "Requirements\nBachelors degree and 2 years of experience\nPreferred qualifications\nMasters degree and 5 years of experience";
    expect(parseExperienceRequirement("Software Engineer", description).min).toBe(2);
    expect(matched(description, { highest_education: "none" })).toBe(false);
    expect(matched(description, { highest_education: "bachelor", max_required_years: 2 })).toBe(true);
  });
  test("does not infer numeric requirements from incidental early-career copy", () => {
    expect(parseQualificationRequirements("Our early career talent program includes new grads and mentorship.").groups).toEqual([]);
    expect(parseExperienceRequirement("Software Engineer Intern", "Early-career talent program.").min).toBe(0);
  });
  test("a preference in parentheses scopes its own qualification", () => {
    expect(parseExperienceRequirement("Software Engineer", "Bring 7+ years of consulting experience with public sector customers (US federal preferred).").min).toBe(7);
    expect(matched("Bachelor's degree (Master's a plus) in CS required.", { highest_education: "none" })).toBe(false);
    expect(matched("Bachelor's degree (Master's a plus) in CS required.", { highest_education: "bachelor" })).toBe(true);
  });
  test("shared degree lists inherit years without losing an independent experience route", () => {
    const description = "Master's/PhD in CS + 1 year industry experience, OR 3+ years industry experience.";
    expect(parseExperienceRequirement("Software Engineer", description).min).toBe(1);
    expect(matched(description, { highest_education: "bachelor", max_required_years: 1 })).toBe(false);
    expect(matched(description, { highest_education: "master", max_required_years: 1 })).toBe(true);
    expect(matched(description, { highest_education: "bachelor", max_required_years: 3 })).toBe(true);
  });
  test("ideally headings are preferred and must-have skills reset that section", () => {
    expect(parseExperienceRequirement("Software Engineer", "Ideally you'd have:\n4+ years of full-time engineering experience").min).toBeNull();
    expect(parseExperienceRequirement("Software Engineer", "Desirable Skills, Knowledge, and Experience\n7+ years of experience\nMust-Have Skills\n2+ years of professional experience").min).toBe(2);
  });
  test("cached pathway facts survive storage without needing the description", () => {
    const requirements = parseQualificationRequirements("<h2>Requirements</h2><li>Bachelor's + 3 years OR master's + 1 year.</li>");
    expect(parseStoredQualifications(JSON.stringify(requirements))).toEqual(requirements);
    expect(parseStoredQualifications('{"groups": [[{"education":"alien","min_years":0,"max_years":null}]],"experience_specified":true}')).toBeNull();
    expect(parseStoredQualifications("invalid")).toBeNull();
    expect(storedJobFeaturesFromRow({ qualification_requirements_json: JSON.stringify(requirements), specialties_json: "[]", countries_json: "[]", metro_areas_json: "[]" } as StoredJobFeatureColumns).qualification_requirements).toEqual(requirements);
  });
  test("migration adds facts and invalidates matches even for zero-match profiles", () => {
    const db = new Database(":memory:");
    try {
      db.exec("CREATE TABLE job_features (job_id TEXT); CREATE TABLE user_job_matches (user_id TEXT); CREATE TABLE user_search_profiles (user_id TEXT, match_cursor_seen_at TEXT); INSERT INTO user_search_profiles VALUES ('empty', '2026-01-01'); INSERT INTO user_job_matches VALUES ('other');");
      db.exec(readFileSync(`${import.meta.dir}/../migrations/0079_qualification_requirements.sql`, "utf8"));
      expect(db.query("SELECT COUNT(*) AS count FROM user_job_matches").get()).toEqual({ count: 0 });
      expect(db.query("SELECT match_cursor_seen_at FROM user_search_profiles").get()).toEqual({ match_cursor_seen_at: null });
      db.query("INSERT INTO job_features (job_id, qualification_requirements_json) VALUES (?, ?)").run("job", JSON.stringify(parseQualificationRequirements("Bachelor's degree required.")));
    } finally { db.close(); }
  });
});
