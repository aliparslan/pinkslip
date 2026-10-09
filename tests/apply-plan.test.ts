import { describe, expect, it } from "bun:test";
import { createEmptyResumeProfile, type ResumeProfile } from "../shared/resume-profile";
import type { FormControl } from "../shared/application-form";
import { applicantFacts, formerEmployerAnswer, fuzzyOption, learnAnswers, planApplication } from "../worker/apply/plan";
import { answerWithJev, acceptedJevAnswer } from "../worker/apply/jev-answers";
import type { JevRunner } from "../worker/jev";
import type { Env } from "../worker/types";
import { sqliteD1 } from "./sqlite-d1";

const empty = createEmptyResumeProfile();
const student: ResumeProfile = {
  ...empty,
  contact: { ...empty.contact, name: "Ali Arslan", email: "ali@example.com", phone: "5125550100", location: "Austin, TX", linkedin: "linkedin.com/in/ali" },
  education: [{
    id: "e",
    institution: "University of Texas at Austin",
    credentials: [{ id: "c", degreeType: "bachelor", fieldsOfStudy: ["Computer Science"] }],
    minors: [],
    location: "Austin, TX",
    startDate: "Aug 2023",
    endDate: "May 2027",
  }],
  experience: [{ id: "x", company: "Ramp", title: "Software Engineer Intern", location: "", startDate: "May 2026", endDate: "Aug 2026", bullets: [] }],
};

const control = (ref: string, kind: FormControl["kind"], label: string, extra: Partial<FormControl> = {}): FormControl => ({
  ref, kind, label, required: true, options: [], searchable: false, value: null, ...extra,
});

/** What the in-page reader returned for Roblox's Greenhouse form. */
const roblox: FormControl[] = [
  control("p1", "text", "First Name"),
  control("p2", "text", "Last Name"),
  control("p3", "text", "Email"),
  control("p4", "combobox", "Country", { options: ["Canada", "United Kingdom", "United States"] }),
  control("p5", "tel", "Phone"),
  control("p6", "combobox", "Location (City)", { required: false, searchable: true }),
  control("p7", "file", "Resume/CV", { required: false }),
  control("p8", "file", "Cover Letter", { required: false }),
  control("p9", "combobox", "School", { searchable: true }),
  control("p10", "combobox", "Degree", { searchable: true }),
  control("p13", "combobox", "At the time of application, are you 18+ years of age?", { options: ["Yes", "No"] }),
  control("p14", "combobox", "Are you legally authorized to work in the US?", { options: ["Yes", "No"] }),
  control("p15", "combobox", "Will you now or in the future require sponsorship for work authorization?", { options: ["Yes", "No"] }),
  control("p16", "text", "Roblox Username", { required: false }),
  control("p17", "combobox", "How did you first hear about this role?", { options: ["LinkedIn", "Roblox Careers Site", "Referral"] }),
  control("p18", "combobox", "Please review and acknowledge Roblox's Job Applicant Privacy Notice", { options: ["I acknowledge that I have read and understood Roblox's Job Applicant Privacy Notice."] }),
  control("p19", "combobox", "Have you ever been employed by Roblox?", { options: ["Yes", "No"] }),
  control("p20", "combobox", "How would you describe your gender identity?", { options: ["Man", "Woman", "I don't wish to answer"] }),
  control("p21", "text", "Preferred First Name", { required: false, value: "Al" }),
];

async function planDb() {
  const { sqlite, db } = sqliteD1();
  sqlite.run(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'user')`);
  sqlite.run(`CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  sqlite.run(`CREATE TABLE jobs (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, title TEXT NOT NULL, location TEXT NOT NULL DEFAULT '')`);
  sqlite.run(`CREATE TABLE user_profiles (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT, updated_at TEXT)`);
  sqlite.run(`CREATE TABLE user_search_profiles (user_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, onboarding_completed_at TEXT)`);
  sqlite.run(`CREATE TABLE classification_daily_budget (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, reported_cost_usd REAL NOT NULL DEFAULT 0)`);
  sqlite.run(await Bun.file(new URL("../migrations/0085_application_prep.sql", import.meta.url)).text());
  sqlite.run(`INSERT INTO users (id, name) VALUES ('user-1', 'Ali')`);
  sqlite.run(`INSERT INTO companies VALUES ('roblox', 'Roblox')`);
  sqlite.run(`INSERT INTO jobs VALUES ('job-1', 'roblox', 'Software Engineer', 'San Mateo, CA')`);
  sqlite.run(`INSERT INTO user_profiles (user_id, data) VALUES ('user-1', '${JSON.stringify(student).replace(/'/g, "''")}')`);
  sqlite.run(`INSERT INTO user_search_profiles VALUES ('user-1', '{"work_authorization":"authorized"}', '2026-10-01')`);
  return { sqlite, db, env: { DB: db } as Env };
}

/** A fake Jev that answers from a table and records what it was asked. */
function fakeJev(table: Record<string, { choice: string; p: number }>, seen: string[] = []): JevRunner {
  return {
    async run(_model, inputs) {
      const { state, questions } = inputs as { state: string; questions: Record<string, { instructions: string }> };
      seen.push(state);
      const answers = Object.fromEntries(Object.entries(questions).map(([ref, question]) => {
        const entry = Object.entries(table).find(([text]) => question.instructions.includes(text))?.[1]
          ?? { choice: "Not stated", p: 1 };
        return [ref, { choice: entry.choice, probabilities: { [entry.choice]: entry.p } }];
      }));
      return { state: "Completed", result: { answers, usage: { input_tokens: 1000 } } };
    },
  };
}

describe("planning a page", () => {
  it("fills Roblox from the resume, preferences, rules, and Jev", async () => {
    const { env, sqlite } = await planDb();
    const seen: string[] = [];
    const plan = await planApplication(env, "user-1", { jobId: "job-1", controls: roblox }, fakeJev({
      "employed by Roblox": { choice: "No", p: 0.95 },
    }, seen));
    const step = (ref: string) => plan.steps.find((item) => item.ref === ref);

    expect(step("p1")?.value).toBe("Ali");
    expect(step("p4")?.value).toBe("United States");
    expect(step("p6")).toEqual({ ref: "p6", kind: "combobox", value: "Austin, TX", pick: true });
    expect(step("p7")?.value).toBe("resume");
    expect(step("p8")).toBeUndefined();
    expect(step("p9")).toMatchObject({ value: "University of Texas at Austin", pick: true });
    expect(step("p10")).toMatchObject({ value: "Bachelor's", pick: true });
    expect(step("p14")?.value).toBe("Yes");
    expect(step("p15")?.value).toBe("No");
    expect(step("p17")?.value).toBe("Roblox Careers Site");
    expect(step("p18")?.value).toMatch(/^I acknowledge/);
    expect(step("p19")?.value).toBe("No");
    expect(step("p20")?.value).toBe("I don't wish to answer");
    // A field the user already filled is never touched.
    expect(step("p21")).toBeUndefined();

    // Roblox isn't on the resume, so that one never reaches Jev.
    expect(plan.inferred).toEqual([]);
    expect(seen[0]).not.toContain("employed by Roblox");
    // 18+ isn't in the profile and Jev said "Not stated", so it's asked once.
    expect(plan.needs.map((need) => need.ref)).toEqual(["p13"]);
    expect(seen[0]).toContain("Every employer the applicant has worked for: Software Engineer Intern at Ramp");
    expect(seen[0]).toContain("Applying to: Software Engineer at Roblox (San Mateo, CA).");
    expect(plan.cost_usd).toBeCloseTo(0.000042, 9);
    expect(sqlite.query("SELECT calls, reported_cost_usd FROM classification_daily_budget").get())
      .toEqual({ calls: 0, reported_cost_usd: 0.000042 });
  });

  it("leaves a doubtful Jev answer to the user", async () => {
    const { env } = await planDb();
    const plan = await planApplication(env, "user-1", {
      jobId: "job-1",
      controls: [control("q", "radio", "This role requires 3 days a week in San Mateo. Are you able to do this?", { options: ["Yes", "No"] })],
    }, fakeJev({ "San Mateo": { choice: "No", p: 0.6 } }));
    expect(plan.steps).toEqual([]);
    expect(plan.needs.map((need) => need.ref)).toEqual(["q"]);
  });

  it("asks about legal status only once the facts settle it, and works without Jev", async () => {
    const { env } = await planDb();
    const controls = [control("q", "radio", "Please confirm that you are a U.S. citizen or permanent resident", { options: ["Yes", "No"] })];
    // The profile doesn't say, so Jev answers "Not stated" and the user is asked.
    const plan = await planApplication(env, "user-1", { jobId: null, controls }, fakeJev({}));
    expect(plan.needs.map((need) => need.ref)).toEqual(["q"]);
    const offline = await planApplication(env, "user-1", { jobId: null, controls: roblox }, undefined);
    expect(offline.needs.map((need) => need.ref)).toContain("p19");
  });

  it("checks consent boxes, leaves marketing ones, and ticks a statement only if it's true", async () => {
    const { env } = await planDb();
    const plan = await planApplication(env, "user-1", {
      jobId: null,
      controls: [
        control("c1", "checkbox", "I consent to the processing of my personal data as described in the Privacy Notice"),
        control("c2", "checkbox", "Send me news about future roles", { required: false }),
        control("c3", "checkbox", "I certify that I am 18 years of age or older"),
        control("c4", "checkbox", "I certify that I am a U.S. citizen"),
      ],
    }, fakeJev({ "18 years": { choice: "Yes", p: 0.9 }, "citizen": { choice: "Not stated", p: 1 } }));
    expect(plan.steps).toEqual([
      { ref: "c1", kind: "checkbox", value: "checked" },
      { ref: "c3", kind: "checkbox", value: "checked" },
    ]);
    expect(plan.needs.map((need) => need.ref)).toEqual(["c4"]);
  });

  it("answers whether the applicant worked at the company from the resume", () => {
    const affirm = control("q", "combobox", "Have you previously been employed at Affirm for any length of time?", {
      options: [
        "I have not previously been employed at Affirm",
        "I have been employed at Affirm as a full-time employee",
        "I have been employed at Affirm as an intern",
      ],
    });
    expect(formerEmployerAnswer(affirm, student, "Affirm")).toBe("I have not previously been employed at Affirm");
    const yesNo = (label: string, kind: FormControl["kind"] = "radio") =>
      control("q", kind, label, kind === "text" ? {} : { options: ["Yes", "No", "I prefer not to say"] });
    expect(formerEmployerAnswer(yesNo("Have you ever worked at MongoDB before?"), student, "MongoDB")).toBe("No");
    expect(formerEmployerAnswer(yesNo("Are you a current or former employee of Roblox?"), student, "Roblox")).toBe("No");
    expect(formerEmployerAnswer(yesNo("Have you ever been employed by us?", "text"), student, "Roblox")).toBe("No");
    // Ramp is on the resume: which kind of employment is Jev's to say.
    expect(formerEmployerAnswer(yesNo("Have you ever worked at Ramp?"), student, "Ramp")).toBeNull();
    // Not about the applicant's own employment there.
    expect(formerEmployerAnswer(yesNo("Have you worked with Roblox products before?"), student, "Roblox")).toBeNull();
    expect(formerEmployerAnswer(yesNo("Do you have a relative employed by Roblox?"), student, "Roblox")).toBeNull();
    expect(formerEmployerAnswer(yesNo("Have you previously applied to Roblox?"), student, "Roblox")).toBeNull();
    expect(formerEmployerAnswer(yesNo("If you worked at Roblox, list dates", "text"), student, "Roblox")).toBeNull();
    // No resume, no employer list to go on.
    expect(formerEmployerAnswer(yesNo("Have you ever worked at Roblox?"), empty, "Roblox")).toBeNull();
  });

  it("answers a state question from the location", async () => {
    const { env } = await planDb();
    const plan = await planApplication(env, "user-1", {
      jobId: null,
      controls: [control("s", "combobox", "Which U.S. State or Canadian Province do you reside in?", { options: ["Ontario", "Texas", "Utah"] })],
    }, fakeJev({}));
    expect(plan.steps).toEqual([{ ref: "s", kind: "combobox", value: "Texas" }]);
  });

  it("matches resume facts against long dropdowns", () => {
    const schools = ["Texas A&M University", "The University of Texas at Austin", "University of Texas at Dallas"];
    expect(fuzzyOption(schools, "University of Texas at Austin")).toBe("The University of Texas at Austin");
    expect(fuzzyOption(["Associate's Degree", "Bachelor's Degree", "Master's Degree"], "Bachelor's")).toBe("Bachelor's Degree");
    expect(fuzzyOption(["Canada", "United States"], "")).toBeNull();
  });
});

describe("learning", () => {
  it("saves what the user typed so the question fills itself next time", async () => {
    const { env } = await planDb();
    const answered = control("p13", "combobox", "At the time of application, are you 18+ years of age?", { options: ["Yes", "No"], value: "Yes" });
    expect(await learnAnswers(env.DB, "user-1", [answered, control("p1", "text", "First Name", { value: "Ali" })])).toBe(1);
    const plan = await planApplication(env, "user-1", { jobId: null, controls: roblox }, fakeJev({}));
    expect(plan.steps.find((step) => step.ref === "p13")?.value).toBe("Yes");
  });

  it("reuses a remembered answer on another form's wording and options", async () => {
    const { env } = await planDb();
    const affirm = control("p12", "combobox", "Pronouns", {
      options: ["He/him/his", "She/her/hers", "They/them/theirs", "I prefer not to say"],
      value: "He/him/his",
    });
    expect(await learnAnswers(env.DB, "user-1", [affirm])).toBe(1);
    const plan = await planApplication(env, "user-1", {
      jobId: null,
      controls: [control("q", "radio", "What are your pronouns?", { options: ["He/Him", "She/Her", "They/Them"] })],
    }, fakeJev({}));
    expect(plan.steps).toEqual([{ ref: "q", kind: "radio", value: "He/Him" }]);
  });
});

describe("Jev answers", () => {
  it("adds Not stated and rejects choices that aren't options", async () => {
    let sent: unknown;
    const ai: JevRunner = {
      async run(_model, inputs) {
        sent = inputs;
        return { state: "Completed", result: {
          answers: { a: { choice: "Maybe", probabilities: { Maybe: 1 } }, b: { choice: "No", probabilities: { No: 0.9 } } },
          usage: { input_tokens: 500 },
        } };
      },
    };
    const result = await answerWithJev(ai, "facts", { a: { label: "A?", options: ["Yes", "No"] }, b: { label: "B?", options: ["Yes", "No"] } });
    expect(Object.keys((sent as { questions: { a: { criteria: object } } }).questions.a.criteria)).toEqual(["Yes", "No", "Not stated"]);
    expect(result.answers).toEqual({ b: { choice: "No", probability: 0.9 } });
    expect(acceptedJevAnswer({ choice: "Not stated", probability: 1 })).toBeNull();
    expect(acceptedJevAnswer({ choice: "No", probability: 0.74 })).toBeNull();
    expect(acceptedJevAnswer({ choice: "No", probability: 0.75 })).toBe("No");
  });

  it("writes the applicant's facts plainly", () => {
    const facts = applicantFacts({ profile: student, name: "", workAuthorization: "sponsorship", answered: [{ label: "Willing to relocate?", value: "yes" }], job: null });
    expect(facts).toContain("Work authorization: Needs visa sponsorship to work in the US.");
    expect(facts).toContain("- Willing to relocate?: yes");
  });
});
