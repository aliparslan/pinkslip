import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createEmptyResumeProfile, type ResumeProfile } from "../shared/resume-profile";
import type { ApplicationField } from "../shared/application-form";
import {
  answerKey,
  defaultAnswer,
  impliedAnswers,
  prepareFields,
  storageKey,
  storedAnswer,
} from "../worker/apply/answers";
import {
  applicationFormForJob,
  normalizeAshbyForm,
  normalizeGreenhouseForm,
  type AshbyJobPosting,
  type GreenhouseJobPayload,
} from "../worker/apply/forms";
import { prepareApplication, saveApplicationAnswers } from "../worker/apply/prepare";
import applyRoutes from "../worker/routes/apply";
import type { Env, Variables } from "../worker/types";
import { sqliteD1 } from "./sqlite-d1";

const fixture = async <T>(name: string) =>
  JSON.parse(await Bun.file(new URL(`./fixtures/application-forms/${name}.json`, import.meta.url)).text()) as T;

const anthropic = normalizeGreenhouseForm(await fixture<GreenhouseJobPayload>("greenhouse-anthropic"));
const aptos = normalizeGreenhouseForm(await fixture<GreenhouseJobPayload>("greenhouse-aptoslabs"));
const fireworks = normalizeAshbyForm(await fixture<AshbyJobPosting>("ashby-fireworks"));
const onePassword = normalizeAshbyForm(await fixture<AshbyJobPosting>("ashby-survey"));

function byLabel<T extends ApplicationField>(form: { fields: T[] }, start: string): T {
  const found = form.fields.find((field) => field.label.startsWith(start));
  if (!found) throw new Error(`No field starting "${start}"`);
  return found;
}

const student: ResumeProfile = {
  ...createEmptyResumeProfile(),
  contact: {
    ...createEmptyResumeProfile().contact,
    name: "Ali Arslan",
    email: "ali@example.com",
    phone: "555-0100",
    location: "Austin, TX",
    linkedin: "linkedin.com/in/ali",
  },
};

describe("normalizing forms", () => {
  it("reads Greenhouse questions, EEO, and demographic surveys", () => {
    expect(aptos.ats).toBe("greenhouse");
    expect(byLabel(aptos, "First Name")).toMatchObject({ id: "first_name", key: "first_name", section: "about", required: true });
    expect(byLabel(aptos, "Resume/CV")).toMatchObject({ type: "file", key: "resume" });
    expect(byLabel(aptos, "Are you authorized")).toMatchObject({
      type: "select",
      key: "work_authorization",
      options: [{ label: "Yes", value: "1" }, { label: "No", value: "0" }],
    });
    expect(byLabel(aptos, "VeteranStatus")).toMatchObject({ id: "veteran_status", section: "voluntary", key: "veteran" });
    expect(byLabel(aptos, "How would you describe your gender")).toMatchObject({ type: "multiselect", key: "gender" });
  });

  it("reads Ashby fields and its EEO survey", () => {
    expect(fireworks.ats).toBe("ashby");
    expect(byLabel(fireworks, "Legal Name")).toMatchObject({ id: "_systemfield_name", key: "full_name" });
    expect(byLabel(fireworks, "Are you authorized")).toMatchObject({
      type: "boolean",
      key: "work_authorization",
      options: [{ label: "Yes", value: "true" }, { label: "No", value: "false" }],
    });
    expect(byLabel(fireworks, "If offered a position")).toMatchObject({ type: "date", key: "start_date" });
    expect(byLabel(fireworks, "Gender")).toMatchObject({ id: "_systemfield_eeoc_gender", section: "voluntary" });
  });

  it("uses the description when a question has no title", () => {
    expect(byLabel(onePassword, "Do you agree to allow 1Password to contact you")).toMatchObject({ type: "multiselect" });
  });
});

describe("answer keys", () => {
  it("shares plain sponsorship and authorization questions across employers", () => {
    expect(byLabel(anthropic, "Do you require visa sponsorship").key).toBe("sponsorship");
    expect(byLabel(aptos, "Will you now or in the future require sponsorship").key).toBe("sponsorship");
    expect(byLabel(fireworks, "Will you now or in the future require visa sponsorship").key).toBe("sponsorship");
  });

  it("recognizes common wordings", () => {
    for (const label of [
      "Will you now or in the future require visa sponsorship to obtain work authorization in the country where this job is located?",
      "Will you require Elastic's sponsorship to continue or extend your work authorization status?",
      "Do you now or will you in the future require sponsorship?",
      "Will you, at any point, require employer sponsorship to work in the United States?",
    ]) expect(answerKey("q1", label, "select")).toBe("sponsorship");
    expect(answerKey("q1", "At the time of application, are you 18+ years of age?", "select")).toBe("over_18");
    expect(answerKey("q1", "Legal First Name", "text")).toBe("first_name");
    expect(answerKey("q1", "Please provide your full legal name as it appears on your ID", "text")).toBe("full_name");
  });

  it("keeps a flipped or mixed question to itself", () => {
    // Answering this with a saved "no sponsorship needed" would say "not authorized".
    expect(byLabel(onePassword, "This role requires you to already be legally authorized").key).toMatch(/^q:/);
    expect(answerKey("q1", "Are you authorized to work in the US without sponsorship?", "select")).toMatch(/^q:/);
    expect(answerKey("q1", "Do you not require sponsorship?", "select")).toMatch(/^q:/);
  });

  it("matches yes/no keys only on choices and resume keys only on free text", () => {
    expect(byLabel(anthropic, "What is the address from which you plan on working").key).toMatch(/^q:/);
    expect(byLabel(anthropic, "Are you open to relocation").key).toBe("relocation");
    expect(answerKey("q1", "School", "select")).toBe("q:school");
    expect(answerKey("q1", "School", "text")).toBe("school");
  });

  it("separates the voluntary survey questions", () => {
    expect(byLabel(aptos, "Do you identify as transgender").key).toBe("transgender");
    expect(byLabel(onePassword, "Do you identify as a member of the LGBTQ").key).toBe("orientation");
    expect(byLabel(onePassword, "Which option best describes your gender").key).toBe("gender");
  });

  it("gives an untitled question its own key", () => {
    expect(answerKey("abc-123", "", "text")).toBe("field:abc-123");
    expect(byLabel(onePassword, "Other website").key).toBe("q:other website");
  });
});

function choice(label: string, options: string[], type: ApplicationField["type"] = "select"): ApplicationField {
  return {
    id: "q",
    label,
    type,
    required: true,
    options: options.map((option, index) => ({ label: option, value: String(index) })),
    section: "questions",
    key: answerKey("q", label, type),
  };
}

describe("default answers", () => {
  it("picks the only option", () => {
    expect(defaultAnswer(choice("Please read the arbitration agreement below", ["I will read the arbitration agreement below."])))
      .toBe("I will read the arbitration agreement below.");
    expect(defaultAnswer(choice("Do you agree to allow us to contact you?", ["I agree"], "multiselect"))).toEqual(["I agree"]);
  });

  it("says a job board found the role, never an internal or referral source", () => {
    expect(defaultAnswer(choice("How did you hear about this opportunity?", [
      "Alphabet's Internal Job Board (Grow)",
      "Employee referral",
      "Waymo Careers Page",
      "Other",
    ]))).toBe("Waymo Careers Page");
    expect(defaultAnswer(choice("Where did you first hear about this role?", ["LinkedIn", "Other job boards", "Friend"])))
      .toBe("Other job boards");
    expect(defaultAnswer({ ...choice("How did you hear about us?", []), type: "text", options: [] })).toBe("Job board");
  });

  it("acknowledges notices and routine consents", () => {
    expect(defaultAnswer(choice("Please review and acknowledge Roblox's Job Applicant Privacy Notice", [
      "I acknowledge that I have read and understood Roblox's Job Applicant Privacy Notice",
    ]))).toMatch(/^I acknowledge/);
    expect(defaultAnswer(choice("Candidate Privacy Statement", ["I acknowledge the above statement.", "I do not acknowledge"])))
      .toBe("I acknowledge the above statement.");
    expect(defaultAnswer(choice("Do you consent to this interview being recorded?", ["Yes, I consent", "No"])))
      .toBe("Yes, I consent");
  });

  it("never answers a factual or legal question for the user", () => {
    expect(defaultAnswer(choice(
      "Are you subject to any active non-compete, non-solicitation, or other agreement that would restrict your work?",
      ["Yes", "No"],
    ))).toBeNull();
    expect(defaultAnswer(choice(
      "1. Please confirm that you are either: (a) a U.S. citizen; (b) a U.S. permanent resident; or (c) a protected individual",
      ["Yes", "No"],
    ))).toBeNull();
    expect(defaultAnswer(choice("Have you ever interviewed at Anthropic before?", ["Yes", "No"]))).toBeNull();
    expect(defaultAnswer(choice("Do you require visa sponsorship?", ["Yes", "No"]))).toBeNull();
  });

  it("fills the real Anthropic formalities and leaves its real questions", () => {
    const fields = prepareFields(anthropic.fields, student, new Map());
    expect(byLabel({ fields }, "Agreement to Arbitrate")).toMatchObject({ source: "default" });
    expect(byLabel({ fields }, "Have you ever interviewed at Anthropic").answer).toBeNull();
    expect(byLabel({ fields }, "Why Anthropic").answer).toBeNull();
  });
});

describe("filling answers", () => {
  it("fills contact details from the resume", () => {
    const fields = prepareFields(fireworks.fields, student, new Map());
    expect(byLabel({ fields }, "Legal Name")).toMatchObject({ answer: "Ali Arslan", source: "resume" });
    expect(byLabel({ fields }, "Preferred Name")).toMatchObject({ answer: "Ali", source: "resume" });
    expect(byLabel({ fields }, "Resume")).toMatchObject({ answer: "Your resume", source: "resume" });
    expect(byLabel({ fields }, "Why are you interested")).toMatchObject({ answer: null, source: null });
  });

  it("declines voluntary questions by default, in each form's own words", () => {
    const greenhouse = prepareFields(anthropic.fields, student, new Map());
    expect(byLabel({ fields: greenhouse }, "Gender").answer).toBe("Decline To Self Identify");
    expect(byLabel({ fields: greenhouse }, "VeteranStatus").answer).toBe("I don't wish to answer");
    const ashby = prepareFields(fireworks.fields, student, new Map());
    expect(byLabel({ fields: ashby }, "Gender")).toMatchObject({ answer: "Decline to self-identify", source: "default" });
  });

  it("carries a saved yes/no between a Greenhouse select and an Ashby checkbox", () => {
    const greenhouseQuestion = byLabel(aptos, "Will you now or in the future require sponsorship");
    const saved = new Map([[greenhouseQuestion.key, storedAnswer(greenhouseQuestion, "No")]]);
    expect(saved.get("sponsorship")).toBe("no");
    const ashby = prepareFields(fireworks.fields, student, saved);
    expect(byLabel({ fields: ashby }, "Will you now or in the future require visa sponsorship"))
      .toMatchObject({ answer: "No", source: "saved" });
  });

  it("matches gender across forms that word it differently", () => {
    const greenhouseGender = byLabel(aptos, "Gender");
    const saved = new Map([["gender", storedAnswer(greenhouseGender, "Male")]]);
    const fields = prepareFields(aptos.fields, student, saved);
    expect(byLabel({ fields }, "How would you describe your gender").answer).toEqual(["Man"]);
  });

  it("answers work authorization from job preferences, below anything saved", () => {
    const question = (fields: ReturnType<typeof prepareFields>, start: string) =>
      byLabel({ fields }, start);
    const authorized = prepareFields(aptos.fields, student, new Map(), impliedAnswers("authorized"));
    expect(question(authorized, "Are you authorized")).toMatchObject({ answer: "Yes", source: "profile" });
    expect(question(authorized, "Will you now or in the future require sponsorship")).toMatchObject({ answer: "No", source: "profile" });

    const needsSponsorship = prepareFields(aptos.fields, student, new Map(), impliedAnswers("sponsorship"));
    expect(question(needsSponsorship, "Are you authorized").answer).toBeNull();
    expect(question(needsSponsorship, "Will you now or in the future require sponsorship").answer).toBe("Yes");

    const overridden = prepareFields(aptos.fields, student, new Map([["sponsorship", "yes"]]), impliedAnswers("authorized"));
    expect(question(overridden, "Will you now or in the future require sponsorship")).toMatchObject({ answer: "Yes", source: "saved" });
    expect(impliedAnswers("not_sure").size).toBe(0);
  });

  it("only fills a date field with a date", () => {
    const startDate = byLabel(fireworks, "If offered a position");
    expect(prepareFields([startDate], student, new Map([["start_date", "May 2027"]]))[0].answer).toBeNull();
    expect(prepareFields([startDate], student, new Map([["start_date", "2027-05-17"]]))[0].answer).toBe("2027-05-17");
  });
});

async function applyDb() {
  const { sqlite, db } = sqliteD1();
  sqlite.run(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'user')`);
  sqlite.run(`CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL, ats_type TEXT NOT NULL, source_type TEXT, ats_slug TEXT NOT NULL)`);
  sqlite.run(`CREATE TABLE jobs (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, external_id TEXT NOT NULL, title TEXT NOT NULL)`);
  sqlite.run(`CREATE TABLE user_profiles (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT, updated_at TEXT)`);
  sqlite.run(`CREATE TABLE user_search_profiles (user_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, onboarding_completed_at TEXT)`);
  sqlite.run(await Bun.file(new URL("../migrations/0085_application_prep.sql", import.meta.url)).text());
  sqlite.run(`INSERT INTO users (id) VALUES ('user-1')`);
  sqlite.run(`INSERT INTO companies VALUES
    ('aptos', 'Aptos Labs', 'greenhouse', NULL, 'aptoslabs'),
    ('fireworks', 'Fireworks', 'ashby', NULL, 'fireworks'),
    ('acme', 'Acme', 'custom', 'workday', 'acme')`);
  sqlite.run(`INSERT INTO jobs VALUES
    ('gh-job', 'aptos', '4720881005', 'Engineer'),
    ('ashby-job', 'fireworks', 'a610c272', 'Engineer'),
    ('wd-job', 'acme', 'R1', 'Engineer')`);
  sqlite.run(`INSERT INTO user_profiles (user_id, data) VALUES ('user-1', '${JSON.stringify(student).replace(/'/g, "''")}')`);
  return { sqlite, db, env: { DB: db } as Env };
}

function fakeAts(calls: string[] = []) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("greenhouse.io")) return Response.json(await fixture("greenhouse-aptoslabs"));
    if (url.includes("ashbyhq.com")) return Response.json({ data: { jobPosting: await fixture("ashby-fireworks") } });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

describe("preparing a job", () => {
  it("fetches the form once and serves it from cache", async () => {
    const { db, env } = await applyDb();
    const calls: string[] = [];
    const first = await prepareApplication(env, "user-1", "gh-job", fakeAts(calls));
    expect(first.supported).toBe(true);
    expect(first.ats).toBe("greenhouse");
    expect(first.apply_url).toBe("https://job-boards.greenhouse.io/embed/job_app?for=aptoslabs&token=4720881005");
    expect(calls).toEqual(["https://boards-api.greenhouse.io/v1/boards/aptoslabs/jobs/4720881005?questions=true"]);
    // Work authorization and sponsorship are unanswered; the resume covers the rest.
    expect(first.missing_required).toBe(2);
    await prepareApplication(env, "user-1", "gh-job", fakeAts(calls));
    expect(calls).toHaveLength(1);

    // After 12 hours it refetches, and falls back to the old copy if the ATS is down.
    const down = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    const later = new Date(Date.now() + 13 * 60 * 60 * 1000);
    const stale = await applicationFormForJob(db, "gh-job", { ats: "greenhouse", slug: "aptoslabs", externalId: "4720881005" }, down, later);
    expect(stale?.fields.length).toBe(first.fields.length);
  });

  it("says when a job's form isn't supported", async () => {
    const { env } = await applyDb();
    expect(await prepareApplication(env, "user-1", "wd-job", fakeAts())).toEqual({
      job_id: "wd-job",
      supported: false,
      ats: null,
      apply_url: null,
      fields: [],
      missing_required: 0,
    });
  });

  it("saves answers once and reuses them on another employer's form", async () => {
    const { env, sqlite } = await applyDb();
    const greenhouse = await prepareApplication(env, "user-1", "gh-job", fakeAts());
    const authorization = byLabel({ fields: greenhouse.fields }, "Are you authorized");
    const sponsorship = byLabel({ fields: greenhouse.fields }, "Will you now or in the future require sponsorship");

    const saved = await saveApplicationAnswers(env, "user-1", "gh-job", {
      [authorization.id]: "Yes",
      [sponsorship.id]: "No",
      resume: "ignored",
      unknown_field: "ignored",
    }, fakeAts());
    expect(saved.missing_required).toBe(0);
    expect(sqlite.query("SELECT answer_key, value_json FROM application_answers ORDER BY answer_key").all()).toEqual([
      { answer_key: "sponsorship", value_json: "\"no\"" },
      { answer_key: "work_authorization", value_json: "\"yes\"" },
    ]);

    const ashby = await prepareApplication(env, "user-1", "ashby-job", fakeAts());
    expect(ashby.apply_url).toBe("https://jobs.ashbyhq.com/fireworks/a610c272/application");
    expect(byLabel({ fields: ashby.fields }, "Are you authorized")).toMatchObject({ answer: "Yes", source: "saved" });
    expect(byLabel({ fields: ashby.fields }, "Will you now or in the future require visa sponsorship"))
      .toMatchObject({ answer: "No", source: "saved" });

    const cleared = await saveApplicationAnswers(env, "user-1", "gh-job", { [sponsorship.id]: null }, fakeAts());
    expect(cleared.missing_required).toBe(1);
  });

  it("trusts job preferences once the user has chosen them", async () => {
    const { env, sqlite } = await applyDb();
    // "authorized" is the default, so before onboarding it says nothing.
    sqlite.run(`INSERT INTO user_search_profiles VALUES ('user-1', '{"work_authorization":"authorized"}', NULL)`);
    expect((await prepareApplication(env, "user-1", "gh-job", fakeAts())).missing_required).toBe(2);
    sqlite.run(`UPDATE user_search_profiles SET onboarding_completed_at = '2026-10-01'`);
    expect((await prepareApplication(env, "user-1", "gh-job", fakeAts())).missing_required).toBe(0);

    // Any other value was picked on purpose, onboarding or not.
    sqlite.run(`UPDATE user_search_profiles SET onboarding_completed_at = NULL, profile_json = '{"work_authorization":"sponsorship"}'`);
    const prepared = await prepareApplication(env, "user-1", "gh-job", fakeAts());
    expect(byLabel({ fields: prepared.fields }, "Will you now or in the future require sponsorship"))
      .toMatchObject({ answer: "Yes", source: "profile" });
  });

  it("keeps a non-yes/no pick on a shared question to that form", () => {
    const waymo: ApplicationField = {
      id: "q9",
      label: "Work Authorization",
      type: "select",
      required: true,
      options: [{ label: "I am authorized to work in the US", value: "1" }, { label: "I need sponsorship", value: "2" }],
      section: "questions",
      key: "work_authorization",
    };
    const stored = storedAnswer(waymo, "I am authorized to work in the US");
    expect(storageKey(waymo, stored)).toBe("q:work authorization");
    expect(storageKey(byLabel(aptos, "Are you authorized"), "yes")).toBe("work_authorization");
    const saved = new Map([["q:work authorization", stored], ["work_authorization", "yes"]]);
    expect(prepareFields([waymo], student, saved)[0]).toMatchObject({ answer: "I am authorized to work in the US", source: "saved" });
  });

  it("rejects an answer of the wrong shape", async () => {
    const { env } = await applyDb();
    await expect(saveApplicationAnswers(env, "user-1", "gh-job", { first_name: 42 }, fakeAts()))
      .rejects.toMatchObject({ code: "invalid_answer" });
  });
});

describe("routes", () => {
  it("hides the feature while its flag is off", async () => {
    const { env } = await applyDb();
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.use("*", async (c, next) => {
      c.set("userId", "user-1");
      c.set("sessionId", null);
      c.set("sessionState", "authenticated");
      c.set("authTransport", "native");
      await next();
    });
    app.route("/apply", applyRoutes);
    const call = (environment: Env) => (app.fetch as unknown as (request: Request, env: Env) => Promise<Response>)(
      new Request("https://pinkslip.test/apply/jobs/wd-job"),
      environment,
    );
    expect((await call(env)).status).toBe(404);
    const enabled = await call({ ...env, AUTO_APPLY: "on" });
    expect(enabled.status).toBe(200);
    expect(await enabled.json()).toMatchObject({ supported: false });
  });
});
