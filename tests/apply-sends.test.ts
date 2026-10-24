import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createGuestSession } from "@worker/auth";
import worker from "@worker/index";
import { handleInboundEmail } from "@worker/email/handler";
import { getOrCreateInbox } from "@worker/inbox";
import type { OpenedPage } from "@worker/apply/browser";
import {
  CLOSE_POPOVERS_BODY,
  CODE_PROMPT_BODY,
  DECLINE_COOKIES_BODY,
  FILL_FORM_FUNCTION,
  FORM_ERRORS_BODY,
  PAGE_TEXT_BODY,
  READ_FORM_BODY,
  SUBMIT_FORM_BODY,
} from "@worker/apply/page-scripts";
import { PageNavigated, enterCode, fillPlan, prepareForm, recheck, submit } from "@worker/apply/send-engine";
import { applyResumeKey, loadResume, saveApplyResume } from "@worker/apply/send-files";
import {
  SendError,
  describeSent,
  enterSendCode,
  expireSendCode,
  failSend,
  greenhouseCode,
  isGreenhouseCodeEmail,
  jobFromLink,
  queueSend,
  runSend,
} from "@worker/apply/sends";
import type { Env } from "@worker/types";
import type { ApplyPlan, FormControl } from "../shared/application-form";
import { sqliteD1 } from "./sqlite-d1";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;
const databases: Database[] = [];
const realFetch = globalThis.fetch;
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  globalThis.fetch = realFetch;
});

const control = (ref: string, kind: FormControl["kind"], label: string, extra: Partial<FormControl> = {}): FormControl => ({
  ref, kind, label, required: true, options: [], searchable: false, value: null, ...extra,
});

type SubmitStatus = "submitted" | "captcha" | "invalid" | "no_button" | "unknown";
const FILL_PREFIX = `return JSON.stringify(await (${FILL_FORM_FUNCTION})(`;

/** A form page that answers the engine's scripts the way a real form would. */
function fakePage(options: {
  controls: FormControl[];
  /** What the site writes into the form after reading the uploaded resume. */
  onUpload?: Record<string, string>;
  /** Fields whose first fill doesn't take (a search the site clears). */
  flaky?: string[];
  submits?: SubmitStatus[];
  asksForCode?: boolean;
  status?: number;
  /** Typing the code sends the form, and the page navigates mid-script. */
  codeNavigates?: boolean;
  /** Options a search box lists once opened. */
  revealed?: string[];
  /** Searches that match nothing typed (their options load only when opened). */
  unmatched?: string[];
  /** Fields the reader stops seeing after the fill (an open list hid them). */
  hiddenAfterFill?: string[];
  /** Validation messages on screen right now. */
  errors?: () => string[];
  /** The site writes these once this many reads have happened (Ashby's late autofill). */
  late?: { afterReads: number; values: Record<string, string> };
}) {
  const controls = options.controls.map((entry) => ({ ...entry }));
  const calls: string[] = [];
  const typed: string[] = [];
  const flaky = new Set(options.flaky ?? []);
  const submits = [...(options.submits ?? ["submitted"])];
  let submitted = false;
  let asksForCode = false;
  let closed = false;
  const page: OpenedPage & { calls: string[]; typed: string[]; closed: () => boolean; controls: FormControl[] } = {
    calls,
    typed,
    controls,
    closed: () => closed,
    status: options.status ?? 200,
    blocked: false,
    sessionId: "session-1",
    async run(body) {
      if (body === READ_FORM_BODY) {
        calls.push("read");
        if (options.late && calls.filter((call) => call === "read").length === options.late.afterReads) {
          for (const [ref, value] of Object.entries(options.late.values)) {
            const field = controls.find((entry) => entry.ref === ref);
            if (field) field.value = value;
          }
        }
        const filledOnce = calls.some((call) => call.startsWith("fill ") && call !== "fill p3");
        const shown = controls.filter((entry) => !(filledOnce && options.hiddenAfterFill?.includes(entry.ref)));
        return JSON.stringify({ submitted, controls: submitted ? [] : shown.map((entry) => ({ ...entry })) });
      }
      if (body === DECLINE_COOKIES_BODY) { calls.push("cookies"); return "declined"; }
      if (body === PAGE_TEXT_BODY) return "Thank you for applying to Acme!";
      if (body === FORM_ERRORS_BODY) return JSON.stringify(options.errors?.() ?? []);
      if (body === CLOSE_POPOVERS_BODY) { calls.push("close"); return "closed"; }
      if (body.includes("[role=option]")) { calls.push("peek"); return JSON.stringify(options.revealed ?? []); }
      if (body === CODE_PROMPT_BODY) return JSON.stringify({ asks: asksForCode, boxes: asksForCode ? 8 : 0 });
      if (body.includes("const code =")) {
        calls.push("code fallback");
        // Reddit's: the code's last letter sends the form and the page moves on.
        if (options.codeNavigates) { asksForCode = false; submitted = true; throw new PageNavigated("Execution context was destroyed"); }
        return "8";
      }
      if (body === SUBMIT_FORM_BODY) {
        calls.push("submit");
        if (asksForCode && typed.length > 0) { asksForCode = false; submitted = true; return JSON.stringify({ status: "submitted", errors: [], url: "https://acme.example/thanks" }); }
        const status = submits.shift() ?? "unknown";
        if (status === "unknown" && options.asksForCode && !asksForCode && typed.length === 0) asksForCode = true;
        if (status === "submitted") submitted = true;
        return JSON.stringify({ status, errors: status === "invalid" ? ["Phone"] : [], url: "https://acme.example/thanks" });
      }
      if (body.startsWith(FILL_PREFIX)) {
        const request = JSON.parse(body.slice(FILL_PREFIX.length, -3)) as { steps: Array<{ ref: string; kind: string; value: string | string[] }>; resume: { name: string } | null };
        const outcomes: Record<string, string> = {};
        for (const step of request.steps) {
          const target = controls.find((entry) => entry.ref === step.ref);
          if (!target) { outcomes[step.ref] = "missing"; continue; }
          calls.push(`fill ${step.ref}`);
          if (step.kind === "file") {
            target.value = request.resume?.name ?? null;
            for (const [ref, value] of Object.entries(options.onUpload ?? {})) {
              const field = controls.find((entry) => entry.ref === ref);
              if (field) field.value = value;
            }
          } else if (flaky.has(step.ref)) {
            flaky.delete(step.ref);
          } else if (options.unmatched?.includes(step.ref) && !(options.revealed ?? []).includes(String(step.value))) {
            outcomes[step.ref] = "no_match";
            continue;
          } else {
            target.value = step.kind === "checkbox" ? "checked" : Array.isArray(step.value) ? step.value.join(", ") : step.value;
          }
          outcomes[step.ref] = "filled";
        }
        return JSON.stringify({ outcomes });
      }
      throw new Error(`Unexpected script: ${body.slice(0, 60)}`);
    },
    async type(selector, text) { typed.push(`${selector} ${text}`); },
    async screenshot() { return new Uint8Array([0xff, 0xd8, 0xff]); },
    url: () => "https://job-boards.greenhouse.io/embed/job_app?for=acme&token=123",
    async wait() {},
    async close() { closed = true; },
    detach() { calls.push("detach"); },
  };
  return page;
}

const RESUME = { name: "Ali_Arslan_Resume.pdf", base64: "JVBERi0=" };

describe("the send engine", () => {
  it("declines cookies, uploads the resume first and lets Pinkslip's answers replace the site's guesses", async () => {
    const page = fakePage({
      controls: [
        control("p1", "text", "First Name"),
        control("p2", "combobox", "Location", { searchable: true }),
        control("p3", "file", "Resume/CV"),
        control("p4", "text", "Current Company", { required: false }),
      ],
      // Lever put the location from the PDF, and the company it read.
      onUpload: { p2: "Austin, TX", p4: "Ramp" },
    });
    const prepared = await prepareForm(page, RESUME);
    expect(page.calls.slice(0, 3)).toEqual(["cookies", "read", "fill p3"]);
    if (prepared.kind !== "ready") throw new Error("no form");
    expect(prepared.resumeRef).toBe("p3");
    expect(prepared.siteFilled.sort()).toEqual(["p2", "p4"]);
    // Planned as empty, so Pinkslip's location wins where it has one.
    expect(prepared.planning.find((entry) => entry.ref === "p2")?.value).toBeNull();
    expect(prepared.controls.find((entry) => entry.ref === "p2")?.value).toBe("Austin, TX");
  });

  it("fills the plan, tries an empty search once more, and lists what's still required", async () => {
    const page = fakePage({
      controls: [
        control("p1", "text", "First Name"),
        control("p2", "combobox", "Location", { searchable: true }),
        control("p3", "file", "Resume/CV"),
        control("p5", "textarea", "Why Acme?"),
      ],
      flaky: ["p2"],
    });
    const prepared = await prepareForm(page, RESUME);
    if (prepared.kind !== "ready") throw new Error("no form");
    const filled = await fillPlan(page, {
      steps: [
        { ref: "p1", kind: "text", value: "Ali" },
        { ref: "p2", kind: "combobox", value: "New York, NY", pick: true },
        { ref: "p3", kind: "file", value: "resume" },
      ],
    }, prepared, RESUME);
    // The resume went first and isn't uploaded twice.
    expect(page.calls.filter((call) => call === "fill p3")).toHaveLength(1);
    expect(page.calls.filter((call) => call === "fill p2")).toHaveLength(2);
    expect(filled.controls.find((entry) => entry.ref === "p2")?.value).toBe("New York, NY");
    expect(filled.open.map((entry) => entry.label)).toEqual(["Why Acme?"]);
  });

  it("fills again when the site's autofill lands after the fill", async () => {
    const page = fakePage({
      controls: [control("p1", "text", "First Name"), control("p3", "file", "Resume/CV")],
      // Reads: before upload, three to settle, after the fill, then the recheck.
      late: { afterReads: 6, values: { p1: "Taylor" } },
    });
    const prepared = await prepareForm(page, RESUME);
    if (prepared.kind !== "ready") throw new Error("no form");
    const plan = { steps: [{ ref: "p1", kind: "text" as const, value: "Ali" }] };
    const filled = await fillPlan(page, plan, prepared, RESUME);
    const checked = await recheck(page, plan, prepared, RESUME, filled);
    expect(page.calls.filter((call) => call === "fill p1")).toHaveLength(2);
    expect(checked.controls.find((entry) => entry.ref === "p1")?.value).toBe("Ali");
  });

  it("opens a search that lists its options only when opened, and asks the planner again", async () => {
    const page = fakePage({
      controls: [control("p1", "combobox", "How did you hear about us?", { searchable: true }), control("p3", "file", "Resume/CV")],
      unmatched: ["p1"],
      revealed: ["LinkedIn", "Company Website", "Other"],
    });
    const prepared = await prepareForm(page, RESUME);
    if (prepared.kind !== "ready") throw new Error("no form");
    const asked: FormControl[][] = [];
    const filled = await fillPlan(page, { steps: [{ ref: "p1", kind: "combobox", value: "Job board", pick: true }] }, prepared, RESUME, async (controls) => {
      asked.push(controls);
      return { steps: [{ ref: "p1", kind: "combobox", value: "Company Website" }] };
    });
    expect(asked[0]![0]).toMatchObject({ ref: "p1", options: ["LinkedIn", "Company Website", "Other"], searchable: false });
    expect(filled.controls.find((entry) => entry.ref === "p1")?.value).toBe("Company Website");
    expect(filled.open).toEqual([]);
  });

  it("counts a required question the fill made disappear as unanswered", async () => {
    const page = fakePage({
      controls: [control("p1", "text", "First Name"), control("p2", "buttons", "Open to 5 days in office?", { options: ["Yes", "No"] }), control("p3", "file", "Resume/CV")],
      hiddenAfterFill: ["p2"],
    });
    const prepared = await prepareForm(page, RESUME);
    if (prepared.kind !== "ready") throw new Error("no form");
    const filled = await fillPlan(page, { steps: [{ ref: "p1", kind: "text", value: "Ali" }] }, prepared, RESUME);
    expect(filled.open.map((entry) => entry.label)).toEqual(["Open to 5 days in office?"]);
    expect(page.calls).toContain("close");
  });

  it("notices Greenhouse asking for its emailed code, and enters it", async () => {
    const page = fakePage({ controls: [control("p1", "text", "First Name", { value: "Ali" })], submits: ["unknown"], asksForCode: true });
    expect(await submit(page)).toEqual({ status: "code_needed" });
    const entered = await enterCode(page, "Ab12Cd34");
    expect(page.typed).toEqual(['[data-pinkslip-code="0"] Ab12Cd34']);
    expect(entered).toEqual({ status: "submitted", url: "https://acme.example/thanks", text: "Thank you for applying to Acme!" });
  });

  it("reads the confirmation when the code's last letter sends the form", async () => {
    const page = fakePage({ controls: [control("p1", "text", "First Name", { value: "Ali" })], submits: ["unknown"], asksForCode: true, codeNavigates: true });
    expect(await submit(page)).toEqual({ status: "code_needed" });
    expect(await enterCode(page, "OGRULIke")).toEqual({ status: "submitted", url: "https://job-boards.greenhouse.io/embed/job_app?for=acme&token=123", text: "Thank you for applying to Acme!" });
  });

  it("lists the resume in what was sent when the site hides its file input", () => {
    const prepared = {
      kind: "ready" as const,
      controls: [control("p1", "text", "First Name"), control("p3", "file", "Resume/CV")],
      planning: [], siteFilled: [], resumeRef: "p3", cookies: false,
    };
    const sent = describeSent([control("p1", "text", "First Name", { value: "Alip" })], prepared, { steps: [{ ref: "p1", kind: "text", value: "Alip" }], inferred: [] }, "Alip_Arslan_resume.pdf");
    expect(sent).toEqual([
      { label: "First Name", value: "Alip", by: "pinkslip" },
      { label: "Resume/CV", value: "Alip_Arslan_resume.pdf", by: "pinkslip" },
    ]);
  });

  it("reports a captcha on Submit as it is", async () => {
    const page = fakePage({ controls: [control("p1", "text", "First Name", { value: "Ali" })], submits: ["captcha"] });
    expect(await submit(page)).toEqual({ status: "captcha", url: "https://acme.example/thanks" });
  });
});

describe("Greenhouse's emailed code", () => {
  it("is recognised by sender and subject, and read from the text", () => {
    expect(isGreenhouseCodeEmail("no-reply@us.greenhouse-mail.io", "Security code for your application to Acme")).toBe(true);
    expect(isGreenhouseCodeEmail("no-reply@greenhouse.io", "Your application to Acme")).toBe(false);
    expect(isGreenhouseCodeEmail("someone@greenhouse.io.evil.com", "Security code")).toBe(false);
    expect(greenhouseCode("Security code for your application to Acme\nCopy and paste this code into the security code field on your application: Xk3Lp9Qa\nhttps://track.example/abc123def"))
      .toBe("Xk3Lp9Qa");
    expect(greenhouseCode("Call 5125550100 about your code: 48213907")).toBe("48213907");
    expect(greenhouseCode("No code here, just words")).toBeNull();
    // Reddit's, the first real send: letters only.
    expect(greenhouseCode("Copy and paste this code into the security code field on your application: OGRULIke")).toBe("OGRULIke");
    expect(greenhouseCode("Your code is below.\nOGRULIke\nThanks", "Security code for your application to DoorDash")).toBe("OGRULIke");
    expect(greenhouseCode("The code for DoorDash is below.\nOGRULIke", "Security code for your application to DoorDash")).toBe("OGRULIke");
  });
});

// ─── Sends, with the database ────────────────────────────────────────────────

function memoryBucket() {
  const objects = new Map<string, { bytes: Uint8Array; customMetadata?: Record<string, string>; httpMetadata?: { contentDisposition?: string }; uploaded: Date }>();
  const bucket = {
    objects,
    async put(key: string, value: ArrayBuffer | Uint8Array, options?: { customMetadata?: Record<string, string>; httpMetadata?: { contentDisposition?: string } }) {
      objects.set(key, { bytes: value instanceof Uint8Array ? value : new Uint8Array(value), customMetadata: options?.customMetadata, httpMetadata: options?.httpMetadata, uploaded: new Date() });
    },
    async head(key: string) {
      const object = objects.get(key);
      return object ? { size: object.bytes.byteLength, customMetadata: object.customMetadata, uploaded: object.uploaded } : null;
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        customMetadata: object.customMetadata,
        httpMetadata: object.httpMetadata,
        body: new Response(object.bytes).body,
        arrayBuffer: async () => object.bytes.slice().buffer,
      };
    },
    async delete(keys: string | string[]) { for (const key of [keys].flat()) objects.delete(key); },
    async list({ prefix }: { prefix: string }) {
      return { objects: [...objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })), truncated: false };
    },
  };
  return bucket;
}

const PDF = new TextEncoder().encode("%PDF-1.7 resume").buffer as ArrayBuffer;

function setup() {
  const { sqlite, db } = sqliteD1();
  databases.push(sqlite);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
  }
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.run("INSERT INTO users (id, time_zone, role) VALUES ('u1', 'America/New_York', 'admin')");
  sqlite.run(`INSERT INTO companies (id, name, ats_type, ats_slug) VALUES ('acme', 'Acme', 'greenhouse', 'acme'), ('lev', 'Leverco', 'lever', 'leverco')`);
  sqlite.run(`INSERT INTO jobs (id, company_id, external_id, title, url, location) VALUES
    ('j1', 'acme', '123', 'Software Engineer', 'https://job-boards.greenhouse.io/acme/jobs/123', 'New York, NY'),
    ('j2', 'acme', '124', 'Data Engineer', 'https://job-boards.greenhouse.io/acme/jobs/124', 'New York, NY'),
    ('j3', 'lev', 'abc', 'Analyst', 'https://jobs.lever.co/leverco/abc', 'Remote')`);
  const bucket = memoryBucket();
  const created: Array<{ id?: string; params?: unknown }> = [];
  const events: Array<{ id: string; type: string; payload: unknown }> = [];
  const mail: Array<{ to: string; text?: string }> = [];
  const env = {
    DB: db,
    RESUME_BUCKET: bucket,
    BROWSER: {},
    AUTO_APPLY: "on",
    AUTO_APPLY_SEND: "admin",
    EMAIL: { send: async (message: { to: string; text?: string }) => { mail.push(message); } },
    EMAIL_FROM_ADDRESS: "login@pinkslip.work",
    APPLY_SEND: {
      create: async (options: { id?: string; params?: unknown }) => { created.push(options); return { id: options.id }; },
      get: async (id: string) => ({ sendEvent: async (event: { type: string; payload: unknown }) => { events.push({ id, ...event }); } }),
    },
  } as unknown as Env;
  const greenhouseUp = (async () => Response.json({ questions: [] })) as unknown as typeof fetch;
  const greenhouseGone = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
  const ledger = () => sqlite.query("SELECT ref_id, released_at FROM usage_ledger").all() as Array<{ ref_id: string; released_at: string | null }>;
  const row = (id: string) => sqlite.query("SELECT * FROM apply_sends WHERE id = ?").get(id) as Record<string, unknown>;
  return { sqlite, db, env, bucket, created, events, mail, greenhouseUp, greenhouseGone, ledger, row };
}

const plan = (steps: ApplyPlan["steps"], inferred: ApplyPlan["inferred"] = []) => async () => ({ steps, needs: [], inferred });
const deps = (page: OpenedPage, steps: ApplyPlan["steps"] = [], inferred: ApplyPlan["inferred"] = []) => ({
  open: async () => page,
  reconnect: async () => page,
  plan: plan(steps, inferred),
  now: () => new Date("2026-10-24T15:00:00Z"),
});

async function rejected(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "resolved";
  } catch (error) {
    return error instanceof SendError ? error.code : String(error);
  }
}

describe("queueing a send", () => {
  it("checks the job, the resume and the posting, and never sends the same job twice", async () => {
    const { env, sqlite, bucket, created, greenhouseUp, greenhouseGone, ledger } = setup();
    const queue = (jobId: string, dryRun = false, fetcher = greenhouseUp) => queueSend(env, "u1", { jobId, dryRun }, { fetcher });

    expect(await rejected(queue("missing"))).toBe("not_found");
    expect(await rejected(queue("j3"))).toBe("unsupported");
    expect(await rejected(queue("j1"))).toBe("no_resume");
    await saveApplyResume(bucket as unknown as R2Bucket, "u1", PDF, "Ali Arslan Resume");
    expect(await rejected(queue("j1", false, greenhouseGone))).toBe("gone");
    expect(ledger()).toEqual([]);

    const send = await queue("j1");
    expect(send).toMatchObject({ job_id: "j1", company: "Acme", status: "queued", dry_run: false, ats: "greenhouse" });
    expect(send.url).toBe("https://job-boards.greenhouse.io/embed/job_app?for=acme&token=123");
    expect(created).toEqual([{ id: send.id, params: { send_id: send.id } }]);
    expect(ledger()).toEqual([{ ref_id: "j1", released_at: null }]);
    expect(await rejected(queue("j1"))).toBe("already_sent");
    // A dry run of the same job is fine and takes nothing from the plan.
    expect((await queue("j1", true)).dry_run).toBe(true);
    expect(ledger()).toHaveLength(1);

    sqlite.run("INSERT INTO user_blocked_companies (user_id, company_id, blocked_at) VALUES ('u1', 'acme', '2026-10-24')");
    expect(await rejected(queue("j2"))).toBe("hidden_company");
  });

  it("stops at the plan's allowance", async () => {
    const { env, sqlite, bucket, greenhouseUp } = setup();
    await saveApplyResume(bucket as unknown as R2Bucket, "u1", PDF, "Resume.pdf");
    for (let index = 0; index < 3; index += 1) {
      sqlite.run("INSERT INTO usage_ledger (id, user_id, kind, ref_id, created_at) VALUES (?, 'u1', 'auto_apply_send', 'x', ?)", [`l${index}`, "2026-10-24T14:00:00Z"]);
    }
    const error = await queueSend(env, "u1", { jobId: "j1", dryRun: false }, { fetcher: greenhouseUp, now: new Date("2026-10-24T15:00:00Z") }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SendError);
    expect((error as SendError).extra).toMatchObject({ limit: 3 });
  });

  it("names a resume put there with wrangler after the person", async () => {
    const { bucket } = setup();
    await bucket.put(applyResumeKey("u1"), new Uint8Array([37, 80, 68, 70]));
    expect((await loadResume(bucket as unknown as R2Bucket, "u1", "Ali Arslan"))?.name).toBe("Ali_Arslan_Resume.pdf");
    expect((await loadResume(bucket as unknown as R2Bucket, "u1"))?.name).toBe("Resume.pdf");
    // The script keeps the file's own name as the content disposition.
    await bucket.put(applyResumeKey("u1"), new Uint8Array([37, 80, 68, 70]), { httpMetadata: { contentDisposition: 'attachment; filename="Alip_Arslan_resume.pdf"' } });
    expect((await loadResume(bucket as unknown as R2Bucket, "u1", "Alip"))?.name).toBe("Alip_Arslan_resume.pdf");
  });

  it("refuses a resume that isn't a PDF", async () => {
    const { bucket } = setup();
    expect(saveApplyResume(bucket as unknown as R2Bucket, "u1", new TextEncoder().encode("hello").buffer as ArrayBuffer, "x")).rejects.toThrow("must be a PDF");
  });
});

describe("running a send", () => {
  const form = () => [
    control("p1", "text", "First Name"),
    control("p3", "file", "Resume/CV"),
    control("p5", "combobox", "Are you authorized to work in the US?", { options: ["Yes", "No"] }),
  ];
  const steps: ApplyPlan["steps"] = [
    { ref: "p1", kind: "text", value: "Ali" },
    { ref: "p3", kind: "file", value: "resume" },
    { ref: "p5", kind: "combobox", value: "Yes" },
  ];

  async function queued(context: ReturnType<typeof setup>, dryRun = false) {
    await saveApplyResume(context.bucket as unknown as R2Bucket, "u1", PDF, "Ali Arslan Resume");
    return queueSend(context.env, "u1", { jobId: "j1", dryRun }, { fetcher: context.greenhouseUp });
  }

  it("submits, keeps the pictures and what was sent, and tracks the application", async () => {
    const context = setup();
    const send = await queued(context);
    const page = fakePage({ controls: form() });
    expect(await runSend(context.env, send.id, deps(page, steps, [{ ref: "p5", label: "Authorized?", answer: "Yes", confidence: 0.95 }]))).toEqual({ outcome: "submitted" });
    expect(page.closed()).toBe(true);
    const row = context.row(send.id);
    expect(row.status).toBe("submitted");
    expect(row.confirmation_text).toBe("Thank you for applying to Acme!");
    expect(JSON.parse(String(row.sent_json))).toEqual([
      { label: "First Name", value: "Ali", by: "pinkslip" },
      { label: "Resume/CV", value: "Ali Arslan Resume.pdf", by: "pinkslip" },
      { label: "Are you authorized to work in the US?", value: "Yes", by: "jev" },
    ]);
    expect([...context.bucket.objects.keys()].sort()).toEqual([
      applyResumeKey("u1"),
      `apply/u1/sends/${send.id}/confirmation.jpg`,
      `apply/u1/sends/${send.id}/form.jpg`,
    ]);
    expect(context.ledger()).toEqual([{ ref_id: "j1", released_at: null }]);
    const application = context.sqlite.query("SELECT a.stage, e.source FROM applications a JOIN application_events e ON e.application_id = a.id WHERE a.job_id = 'j1'").get();
    expect(application).toEqual({ stage: "applied", source: "auto_apply" });
    const activity = context.sqlite.query("SELECT source FROM activity WHERE kind = 'stage_moved'").get();
    expect(activity).toEqual({ source: "auto_apply" });
    // Running it again changes nothing.
    expect(await runSend(context.env, send.id, deps(fakePage({ controls: form() }), steps))).toEqual({ outcome: "submitted" });
  });

  it("stops before Submit when a required question is empty, and gives the send back", async () => {
    const context = setup();
    const send = await queued(context);
    const page = fakePage({ controls: form() });
    expect(await runSend(context.env, send.id, deps(page, steps.slice(0, 2)))).toEqual({ outcome: "needs_you" });
    expect(page.calls).not.toContain("submit");
    expect(JSON.parse(String(context.row(send.id).needs_json))).toEqual([{ label: "Are you authorized to work in the US?", kind: "combobox" }]);
    expect(context.ledger()[0]!.released_at).not.toBeNull();
    expect(context.sqlite.query("SELECT COUNT(*) AS count FROM applications").get()).toEqual({ count: 0 });
  });

  it("stops before Submit when the form shows its own validation error", async () => {
    const context = setup();
    const send = await queued(context);
    const page = fakePage({ controls: form(), errors: () => ["School is required to save this entry"] });
    expect(await runSend(context.env, send.id, deps(page, steps))).toEqual({ outcome: "needs_you" });
    expect(page.calls).not.toContain("submit");
    expect(JSON.parse(String(context.row(send.id).needs_json))).toEqual([{ label: "School is required to save this entry", kind: "error" }]);
  });

  it("counts a Submit the form refused with messages as refused, not unconfirmed", async () => {
    const context = setup();
    const send = await queued(context);
    let pressed = false;
    const page = fakePage({ controls: form(), submits: ["unknown"], errors: () => (pressed ? ["Please select an option"] : []) });
    const run = page.run.bind(page);
    page.run = async (body) => { if (body === SUBMIT_FORM_BODY) pressed = true; return run(body); };
    expect(await runSend(context.env, send.id, deps(page, steps))).toEqual({ outcome: "needs_you" });
    expect(context.ledger()[0]!.released_at).not.toBeNull();
  });

  it("does everything but press Submit in a dry run", async () => {
    const context = setup();
    const send = await queued(context, true);
    const page = fakePage({ controls: form() });
    expect(await runSend(context.env, send.id, deps(page, steps))).toEqual({ outcome: "ready" });
    expect(page.calls).not.toContain("submit");
    expect(context.row(send.id).form_shot_key).toBe(`apply/u1/sends/${send.id}/form.jpg`);
  });

  it("gives the send back when a captcha stops it or the form refuses it", async () => {
    for (const [status, outcome] of [["captcha", "blocked"], ["invalid", "needs_you"], ["no_button", "failed"]] as const) {
      const context = setup();
      const send = await queued(context);
      expect(await runSend(context.env, send.id, deps(fakePage({ controls: form(), submits: [status] }), steps))).toEqual({ outcome });
      expect(context.ledger()[0]!.released_at).not.toBeNull();
    }
  });

  it("keeps the send used when Submit was pressed but nothing confirmed it", async () => {
    const context = setup();
    const send = await queued(context);
    expect(await runSend(context.env, send.id, deps(fakePage({ controls: form(), submits: ["unknown"] }), steps))).toEqual({ outcome: "unconfirmed" });
    expect(context.ledger()[0]!.released_at).toBeNull();
    expect(context.row(send.id).proof_shot_key).toBe(`apply/u1/sends/${send.id}/confirmation.jpg`);
  });

  it("never submits twice after dying while submitting", async () => {
    const context = setup();
    const send = await queued(context);
    context.sqlite.run("UPDATE apply_sends SET status = 'submitting' WHERE id = ?", [send.id]);
    const page = fakePage({ controls: form() });
    expect(await runSend(context.env, send.id, deps(page, steps))).toEqual({ outcome: "unconfirmed" });
    expect(page.calls).toEqual([]);
    expect(context.ledger()[0]!.released_at).toBeNull();
    // A failure before Submit gives it back.
    const other = setup();
    const second = await queued(other);
    other.sqlite.run("UPDATE apply_sends SET status = 'running' WHERE id = ?", [second.id]);
    expect(await failSend(other.env, second.id, "browser crashed")).toEqual({ outcome: "failed" });
    expect(other.ledger()[0]!.released_at).not.toBeNull();
  });

  it("waits for Greenhouse's code with the browser kept, then enters it", async () => {
    const context = setup();
    const send = await queued(context);
    const page = fakePage({ controls: form(), submits: ["unknown"], asksForCode: true });
    expect(await runSend(context.env, send.id, deps(page, steps))).toEqual({ outcome: "code_needed", session_id: "session-1" });
    expect(page.calls).toContain("detach");
    expect(page.closed()).toBe(false);
    expect(context.row(send.id)).toMatchObject({ status: "code_needed", browser_session: "session-1" });
    expect(await enterSendCode(context.env, send.id, "Ab12Cd34", deps(page, steps))).toEqual({ outcome: "submitted" });
    expect(page.closed()).toBe(true);
    expect(context.row(send.id)).toMatchObject({ status: "submitted", browser_session: null });
  });

  it("gives up when the code doesn't come, and gives the send back", async () => {
    const context = setup();
    const send = await queued(context);
    const page = fakePage({ controls: form(), submits: ["unknown"], asksForCode: true });
    await runSend(context.env, send.id, deps(page, steps));
    expect(await expireSendCode(context.env, send.id, deps(page, steps))).toEqual({ outcome: "needs_you" });
    expect(context.ledger()[0]!.released_at).not.toBeNull();
  });

  it("hands a Greenhouse code email to the send waiting for it", async () => {
    const context = setup();
    const send = await queued(context);
    await runSend(context.env, send.id, deps(fakePage({ controls: form(), submits: ["unknown"], asksForCode: true }), steps));
    const inbox = await getOrCreateInbox(context.db, "u1");
    const raw = [
      "From: Greenhouse <no-reply@us.greenhouse-mail.io>",
      "To: ali@example.com",
      "Subject: Security code for your application to Acme",
      "Message-ID: <code-1@greenhouse>",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Copy and paste this code into the security code field on your application: Xk3Lp9Qa",
    ].join("\r\n");
    const bytes = new TextEncoder().encode(raw);
    const headers = new Headers();
    for (const line of raw.split("\r\n\r\n")[0]!.split("\r\n")) headers.append(line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim());
    await handleInboundEmail({ from: "ali@example.com", to: inbox.address, headers, raw: new Response(bytes).body!, rawSize: bytes.length } as unknown as ForwardableEmailMessage, context.env);
    expect(context.events).toEqual([{ id: send.id, type: "code", payload: { code: "Xk3Lp9Qa" } }]);
  });
});

describe("finding a job from a link", () => {
  it("takes Pinkslip ids and Greenhouse or Ashby posting links", async () => {
    const { db, sqlite } = setup();
    sqlite.run("INSERT INTO companies (id, name, ats_type, ats_slug) VALUES ('ash', 'Ashco', 'ashby', 'ashco')");
    sqlite.run("INSERT INTO jobs (id, company_id, external_id, title, url) VALUES ('00000000-0000-4000-8000-000000000009', 'ash', 'f3b2c1d0-1111-4222-8333-444455556666', 'PM', 'https://jobs.ashbyhq.com/ashco/x')");
    expect(await jobFromLink(db, "https://job-boards.greenhouse.io/acme/jobs/124")).toBe("j2");
    expect(await jobFromLink(db, "https://job-boards.greenhouse.io/embed/job_app?for=acme&token=123")).toBe("j1");
    expect(await jobFromLink(db, "https://jobs.ashbyhq.com/ashco/f3b2c1d0-1111-4222-8333-444455556666/application")).toBe("00000000-0000-4000-8000-000000000009");
    expect(await jobFromLink(db, "https://pinkslip.work/jobs/00000000-0000-4000-8000-000000000009")).toBe("00000000-0000-4000-8000-000000000009");
    expect(await jobFromLink(db, "https://example.com/careers/1")).toBeNull();
  });
});

describe("send routes", () => {
  async function signedIn(context: ReturnType<typeof setup>, email: string, role: "user" | "admin") {
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const call = (token: string) => (path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://pinkslip.work${path}`, {
      method: "POST",
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-pinkslip-client": "ios", ...init.headers },
    }), context.env, ctx);
    const session = await createGuestSession(context.db);
    const start = call(session.id);
    await start("/api/v2/auth/email/code/start", { body: JSON.stringify({ email }) });
    const code = context.mail.at(-1)?.text?.match(/code is (\d{6})/)?.[1] ?? "";
    const { native_token: token } = await (await start("/api/v2/auth/email/code/verify", { body: JSON.stringify({ email, code }) })).json() as { native_token: string };
    const userId = (context.sqlite.query("SELECT user_id FROM auth_identities WHERE provider_subject = ?").get(email) as { user_id: string }).user_id;
    if (role === "admin") context.sqlite.run("UPDATE users SET role = 'admin' WHERE id = ?", [userId]);
    return { userId, call: call(token) };
  }

  it("are admin-only, take the resume, start a send and show it", async () => {
    const context = setup();
    globalThis.fetch = context.greenhouseUp;
    const user = await signedIn(context, "someone@example.com", "user");
    expect((await user.call("/api/v2/apply/sends", { body: JSON.stringify({ job_id: "j1" }) })).status).toBe(404);
    expect((await user.call("/api/v2/apply/resume", { method: "PUT", body: PDF })).status).toBe(404);

    const admin = await signedIn(context, "owner@example.com", "admin");
    const bad = await admin.call("/api/v2/apply/resume?name=cv", { method: "PUT", body: "not a pdf", headers: { "content-type": "application/pdf" } });
    expect(bad.status).toBe(400);
    const uploaded = await admin.call("/api/v2/apply/resume?name=Ali%20Arslan", { method: "PUT", body: PDF, headers: { "content-type": "application/pdf" } });
    expect(await uploaded.json()).toMatchObject({ name: "Ali Arslan.pdf" });
    expect(await (await admin.call("/api/v2/apply/resume", { method: "GET" })).json()).toMatchObject({ name: "Ali Arslan.pdf" });

    const started = await admin.call("/api/v2/apply/sends", { body: JSON.stringify({ job_id: "j1", dry_run: true }) });
    expect(started.status).toBe(201);
    const send = await started.json() as { id: string; dry_run: boolean };
    expect(send.dry_run).toBe(true);
    expect(context.created.map((entry) => entry.id)).toEqual([send.id]);
    const listed = await (await admin.call("/api/v2/apply/sends", { method: "GET" })).json() as { sends: Array<{ id: string }> };
    expect(listed.sends.map((entry) => entry.id)).toEqual([send.id]);
    expect((await admin.call(`/api/v2/apply/sends/${send.id}/shots/form`, { method: "GET" })).status).toBe(404);
    expect((await admin.call(`/api/v2/apply/sends/${send.id}/code`, { body: JSON.stringify({ code: "Ab12Cd34" }) })).status).toBe(409);
    // Someone else's send isn't theirs to see.
    expect((await user.call(`/api/v2/apply/sends/${send.id}`, { method: "GET" })).status).toBe(404);
    expect((await admin.call("/api/v2/apply/sends", { body: JSON.stringify({ job_id: "j3" }) })).status).toBe(400);
  });
});
