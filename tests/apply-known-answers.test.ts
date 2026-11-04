import { describe, expect, it } from "bun:test";
import { createEmptyResumeProfile, type ResumeProfile } from "../shared/resume-profile";
import type { FormControl } from "../shared/application-form";
import { placeOption, rangeOption, workStatusOption } from "../worker/apply/answers";
import { planApplication } from "../worker/apply/plan";
import type { Env } from "../worker/types";
import { sqliteD1 } from "./sqlite-d1";

// The questions a tester's sends stopped on (2026-10-29/30), with the
// choices exactly as the forms gave them.
const GRADUATION = ["Earlier than Fall 2026", "Spring 2027", "Summer 2027", "Fall 2027 or later"];
const GPA = ["2.4 or below", "2.5 - 2.7 (out of 4.0)", "2.8 - 3.0 (out of 4.0)", "3.1 - 3.3 (out of 4.0)", "3.4 - 3.5 (out of 4.0)",
  "3.6 or above (out of 4.0)", "80% or above (Canadian Institutions)", "70-79% (Canadian Institutions)"];
const AUTHORISED = [
  "I am authorised to work in the country which this role is located (citizen, permanent resident etc)",
  "My current work authorisation requires sponsorship or renewal now or in the future.",
  "My authorisation to work in this country is unknown",
];
const REGIONS = ["Australia", "Brazil", "England", "India", "Ireland", "EMEA - Other", "APAC - Other",
  "US - California (San Francisco Metro)", "US - California (San Francisco Non-Metro)", "US - Colorado",
  "US - Illinois (Chicago Metro)", "US - Illinois (Chicago Non-Metro)", "US - New York", "US - Texas", "US - Other"];
const PHONE_COUNTRIES = ["United States +1", "Afghanistan +93", "Åland Islands +358", "Albania +355", "American Samoa +1"];

describe("a date or GPA asked as ranges", () => {
  it("puts a graduation date in the one range that holds it", () => {
    expect(rangeOption(GRADUATION, "graduation", "May 2025")).toBe("Earlier than Fall 2026");
    expect(rangeOption(GRADUATION, "graduation", "May 2027")).toBe("Spring 2027");
    expect(rangeOption(GRADUATION, "graduation", "Expected December 2027")).toBe("Fall 2027 or later");
    expect(rangeOption(["Before 2024", "2024", "2025", "2026 or later"], "graduation", "May 2025")).toBe("2025");
    expect(rangeOption(["Dec 2025 - May 2026", "Jun 2026 - Dec 2026"], "graduation", "May 2026")).toBe("Dec 2025 - May 2026");
  });

  it("leaves a date that fits no range, or several, to the person", () => {
    expect(rangeOption(GRADUATION, "graduation", "2027")).toBeNull();
    expect(rangeOption(["2024", "2025"], "graduation", "Present")).toBeNull();
  });

  it("puts a GPA in its range on a 4.0 scale only", () => {
    expect(rangeOption(GPA, "gpa", "3.7")).toBe("3.6 or above (out of 4.0)");
    expect(rangeOption(GPA, "gpa", "3.42/4.0")).toBe("3.4 - 3.5 (out of 4.0)");
    expect(rangeOption(GPA, "gpa", "2.1")).toBe("2.4 or below");
    // Between "3.3" and "3.4", and a 10-point scale.
    expect(rangeOption(GPA, "gpa", "3.35")).toBeNull();
    expect(rangeOption(GPA, "gpa", "8.5/10")).toBeNull();
  });
});

describe("where the applicant lives, as a choice", () => {
  it("picks the state, and the metro for a city named in it", () => {
    expect(placeOption(REGIONS, "Dallas, TX", "United States")).toBe("US - Texas");
    expect(placeOption(REGIONS, "Chicago, IL", "United States")).toBe("US - Illinois (Chicago Metro)");
    expect(placeOption(REGIONS, "Boise, ID", "United States")).toBe("US - Other");
  });

  it("finds the country however it's written", () => {
    expect(placeOption(PHONE_COUNTRIES, "Dallas, TX", "United States")).toBe("United States +1");
    expect(placeOption(["Canada", "USA", "Mexico"], "Austin, Texas", "United States")).toBe("USA");
    expect(placeOption(["Canada", "Mexico"], "Austin, Texas", "United States")).toBeNull();
    // Two Illinois regions and no city to choose between them.
    expect(placeOption(REGIONS, "Illinois", "United States")).toBeNull();
  });
});

describe("work authorization said in sentences", () => {
  it("picks the plain statement of authorization for a US role", () => {
    const label = "Are you authorised to work in the country in which this role is located? (Fin sponsors immigration for some roles so we encourage you to still apply if you require sponsorship)";
    expect(workStatusOption(label, AUTHORISED, true, true)).toBe(AUTHORISED[0]);
    expect(workStatusOption("Will you require visa sponsorship?", [
      "Yes, I will require sponsorship now or in the future",
      "No, I will not require sponsorship",
    ], true, true)).toBe("No, I will not require sponsorship");
  });

  it("answers nothing for a role abroad, an unknown status, plain yes/no, or a choice that claims a status", () => {
    expect(workStatusOption("Are you authorised to work in this country?", AUTHORISED, true, false)).toBeNull();
    expect(workStatusOption("Are you authorised to work in this country?", AUTHORISED, false, true)).toBeNull();
    expect(workStatusOption("Are you authorized to work in the US?", ["Yes", "No"], true, true)).toBeNull();
    expect(workStatusOption("What is your work authorization status?", [
      "I am a U.S. citizen", "I am a permanent resident", "I am authorized to work on a visa",
    ], true, true)).toBeNull();
  });
});

const empty = createEmptyResumeProfile();
/** A made-up new grad whose resume, like the tester's, has no city. */
const graduate: ResumeProfile = {
  ...empty,
  contact: { ...empty.contact, name: "Jordan Lee", email: "jordan@example.com", phone: "5550102030" },
  education: [{
    id: "e", institution: "Example State University", credentials: [{ id: "c", degreeType: "bachelor", fieldsOfStudy: ["Computer Science"] }],
    minors: [], location: "Springfield, IL", startDate: "", endDate: "May 2025",
  }],
  experience: [{ id: "x", company: "Northwind Bank", title: "Software Engineer", location: "Dallas, TX", startDate: "Aug 2025", endDate: "Present", bullets: [] }],
};

async function planDb() {
  const { sqlite, db } = sqliteD1();
  sqlite.run(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'user')`);
  sqlite.run(`CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  sqlite.run(`CREATE TABLE jobs (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, title TEXT NOT NULL, location TEXT NOT NULL DEFAULT '')`);
  sqlite.run(`CREATE TABLE user_profiles (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT, updated_at TEXT)`);
  sqlite.run(`CREATE TABLE user_search_profiles (user_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, onboarding_completed_at TEXT)`);
  sqlite.run(`CREATE TABLE classification_daily_budget (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, reported_cost_usd REAL NOT NULL DEFAULT 0)`);
  sqlite.run(await Bun.file(new URL("../migrations/0085_application_prep.sql", import.meta.url)).text());
  sqlite.run(`INSERT INTO users (id, name) VALUES ('user-1', 'Jordan')`);
  sqlite.run(`INSERT INTO companies VALUES ('acme', 'Acme')`);
  sqlite.run(`INSERT INTO jobs VALUES ('job-1', 'acme', 'Software Engineer', 'Chicago, Illinois')`);
  sqlite.run(`INSERT INTO user_profiles (user_id, data) VALUES ('user-1', '${JSON.stringify(graduate).replace(/'/g, "''")}')`);
  sqlite.run(`INSERT INTO user_search_profiles VALUES ('user-1', '{"work_authorization":"authorized"}', '2026-10-01')`);
  // What the applicant typed when earlier sends stopped.
  sqlite.run(`INSERT INTO application_answers (user_id, answer_key, label, value_json, updated_at) VALUES
    ('user-1', 'location', 'If located in the US, in what city and state do you reside?', '"Dallas, TX"', '2026-10-29T18:08:00Z'),
    ('user-1', 'gpa', 'What is your GPA?', '"3.7"', '2026-10-29T18:10:00Z')`);
  return { env: { DB: db } as Env };
}

const control = (ref: string, kind: FormControl["kind"], label: string, options: string[] = []): FormControl => ({
  ref, kind, label, required: true, options, searchable: false, value: null,
});

describe("a send that used to stop on these", () => {
  it("fills them from the resume, the person's earlier answers and their work authorization", async () => {
    const { env } = await planDb();
    const plan = await planApplication(env, "user-1", { jobId: "job-1", controls: [
      control("p1", "combobox", "What is your graduation date?", GRADUATION),
      control("p2", "combobox", "What is your GPA", GPA),
      control("p3", "combobox", "Are you authorised to work in the country in which this role is located? (Fin sponsors immigration for some roles so we encourage you to still apply if you require sponsorship)", AUTHORISED),
      control("p4", "combobox", "Current Location", REGIONS),
      control("p5", "combobox", "Country", PHONE_COUNTRIES),
      control("p6", "combobox", "Are you willing to relocate?", ["Yes", "No"]),
    ] }, undefined);

    const value = (ref: string) => plan.steps.find((step) => step.ref === ref)?.value;
    expect(value("p1")).toBe("Earlier than Fall 2026");
    expect(value("p2")).toBe("3.6 or above (out of 4.0)");
    expect(value("p3")).toBe(AUTHORISED[0]);
    expect(value("p4")).toBe("US - Texas");
    expect(value("p5")).toBe("United States +1");
    // Never answered before, so it still waits for the person.
    expect(plan.needs.map((need) => need.ref)).toEqual(["p6"]);
  });
});
