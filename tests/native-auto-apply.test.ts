import { describe, expect, test } from "bun:test";
import { createApiClient } from "../packages/core/src/api";
import type { ApplyPlan, FormControl } from "../shared/application-form";
import { runAutoApply, type ApplicationBrowserSession, type FillProgress } from "../apps/native/src/platform/autofill/auto-apply-loop";
import { READ_DROPDOWNS_BODY, READ_FORM_BODY, READ_WORKDAY_FORM_BODY, SUBMIT_FORM_BODY } from "../apps/native/src/platform/autofill/scripts.generated";
import { assistedStartUrl } from "../apps/native/src/platform/autofill/workday";

const email = (): FormControl => ({ ref: "email", kind: "email", label: "Email", required: true, options: [], searchable: false, value: null });
const plan: ApplyPlan = { steps: [{ ref: "email", kind: "email", value: "avery@example.com" }], needs: [], inferred: [] };
const deferred = <T>() => Promise.withResolvers<T>();
const WORKDAY = "https://nvidia.wd5.myworkdayjobs.com/site/job/place/title/apply/applyManually";
async function until(condition: () => boolean) {
  const deadline = Date.now() + 6_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Application flow did not reach the expected state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function harness(options: { autoSubmit?: boolean; delayed?: boolean; planning?: () => Promise<ApplyPlan>; url?: string; step?: string; controls?: FormControl[]; workdayPages?: boolean } = {}) {
  let events: Parameters<ApplicationBrowserSession["open"]>[1];
  let controls = options.controls ?? (options.delayed ? [] : [email()]);
  let step = options.step ?? null;
  let peeks = 0;
  let submitted = false;
  let submittedCalls = 0;
  let fills = 0;
  let submits = 0;
  let plans = 0;
  let reads = 0;
  let cleaned = false;
  let submitStatus = "submitted";
  const statuses: string[] = [];
  const progress: FillProgress[] = [];
  const learned: unknown[] = [];
  const api = createApiClient({ baseUrl: "https://pinkslip.test/api/v2", fetch: (async (input, init) => {
    const path = String(input);
    if (path.endsWith("/apply/plan")) { plans += 1; return Response.json(await (options.planning?.() ?? Promise.resolve(plan))); }
    if (path.endsWith("/apply/learn")) learned.push(JSON.parse(String(init?.body)));
    return Response.json({});
  }) as typeof fetch });
  const browser: ApplicationBrowserSession = {
    open: async (_url, handlers) => { events = handlers; return () => { cleaned = true; }; },
    setStatus: async (status) => { statuses.push(status); },
    setProgress: async (update) => { progress.push(update); },
    run: async (body) => {
      if (body === READ_FORM_BODY) { reads += 1; return JSON.stringify({ submitted, controls, step: null }); }
      if (body === READ_WORKDAY_FORM_BODY) { reads += 1; return JSON.stringify({ submitted, controls, step }); }
      if (body === READ_DROPDOWNS_BODY) { peeks += 1; return ""; }
      if (body === SUBMIT_FORM_BODY) {
        submits += 1;
        submitted = submitStatus === "submitted";
        return JSON.stringify({ status: submitStatus, errors: [], url: "https://jobs.test/confirmation" });
      }
      fills += 1;
      controls = controls.map((control) => ({ ...control, value: "avery@example.com" }));
      return JSON.stringify({ outcomes: { email: "filled" } });
    },
  };
  const result = runAutoApply(api, browser, { jobId: "job-1", url: options.url ?? "https://jobs.test/1", autoSubmit: options.autoSubmit ?? false, workdayPages: options.workdayPages,
    onSubmitted: () => { submittedCalls += 1; } }, async () => null);
  return {
    result, statuses, learned, progress,
    load: (url = "https://jobs.test/1") => events.onLoaded(url),
    navigating: () => events.onNavigating(),
    refill: () => events.onRefill(),
    close: () => events.onFinished(),
    revealForm: () => { controls = [email()]; },
    manualSubmit: () => { submitted = true; controls = []; },
    correctEmail: () => { controls = [{ ...email(), value: "corrected@example.com" }]; },
    setSubmitStatus: (status: string) => { submitStatus = status; },
    showStep: (next: string) => { step = next; controls = [email()]; },
    setControls: (next: FormControl[]) => { controls = next; },
    get peeks() { return peeks; },
    get fills() { return fills; }, get plans() { return plans; }, get reads() { return reads; },
    get submits() { return submits; }, get submittedCalls() { return submittedCalls; }, get cleaned() { return cleaned; },
  };
}

describe("native application session", () => {
  test("reports the fill bar's numbers: filling, then the form with what Pinkslip filled", async () => {
    const flow = harness();
    try {
      flow.load();
      await until(() => flow.statuses.includes("Ready to submit"));
      expect(flow.progress[0]).toEqual({ phase: "filling", done: 0, of: 1 });
      expect(flow.progress.find((update) => update.phase === "form")).toEqual({ phase: "form", filled: 1, total: 1, open: [], byPinkslip: ["email"], blanks: [] });
    } finally { flow.close(); }
    await flow.result;
  });

  test("fills each page of a multi-page form as it appears, with no navigation", async () => {
    const flow = harness({ url: WORKDAY, workdayPages: true, step: "current step 1 of 2" });
    try {
      flow.load();
      await until(() => flow.statuses.includes("Ready for the next page"));
      expect(flow.plans).toBe(1);
      flow.showStep("current step 2 of 2");
      await until(() => flow.fills === 2);
      expect(flow.plans).toBe(2);
      await until(() => flow.statuses.includes("Ready to submit"));
    } finally { flow.close(); }
    await flow.result;
  });

  test("leaves a sign-in provider's page alone", async () => {
    const flow = harness({ url: WORKDAY, workdayPages: true });
    try {
      flow.load("https://accounts.google.com/v3/signin/identifier");
      await until(() => flow.statuses.includes("Sign in to start filling"));
      await new Promise((resolve) => setTimeout(resolve, 2_300));
      expect(flow.reads).toBe(0);
      expect(flow.plans).toBe(0);
      flow.load(WORKDAY);
      await until(() => flow.plans === 1);
    } finally { flow.close(); }
    await flow.result;
  });

  test("fills nothing on a plain http page, even from Fill again", async () => {
    const flow = harness();
    try {
      flow.load("http://jobs.test/1");
      await until(() => flow.statuses.includes("This page isn't secure. Fill it by hand."));
      flow.refill();
      await new Promise((resolve) => setTimeout(resolve, 2_300));
      expect([flow.reads, flow.plans, flow.fills]).toEqual([0, 0, 0]);
      flow.load("https://jobs.test/1");
      await until(() => flow.fills === 1);
    } finally { flow.close(); }
    await flow.result;
  });

  test("stays on the first page until Workday's pages are switched on", async () => {
    const flow = harness({ url: WORKDAY, step: "current step 1 of 2" });
    try {
      flow.load();
      await until(() => flow.statuses.includes("Ready to submit"));
      flow.showStep("current step 2 of 2");
      const reads = flow.reads;
      await until(() => flow.reads > reads + 1);
      expect(flow.plans).toBe(1);
    } finally { flow.close(); }
    await flow.result;
  });

  test("never submits on Workday, even with submitting on", async () => {
    const flow = harness({ autoSubmit: true, url: WORKDAY });
    try {
      flow.load();
      await until(() => flow.statuses.includes("Ready to submit"));
      expect(flow.fills).toBe(1);
      expect(flow.submits).toBe(0);
    } finally { flow.close(); }
    await flow.result;
  });

  test("opens dropdowns for their options before asking for a plan", async () => {
    const dropdown: FormControl = { ref: "state", kind: "select", label: "State", required: false, options: [], searchable: false, value: null };
    let peeksAtPlan = -1;
    const flow: ReturnType<typeof harness> = harness({ url: WORKDAY, workdayPages: true, controls: [dropdown], planning: async () => { peeksAtPlan = flow.peeks; return { steps: [], needs: [], inferred: [] }; } });
    try {
      flow.load();
      await until(() => flow.plans === 1);
      expect(peeksAtPlan).toBe(1);
    } finally { flow.close(); }
    await flow.result;
  });

  test("doesn't keep a date someone typed as an answer", async () => {
    const date: FormControl = { ref: "from", kind: "date", label: "Work experience: start date month", required: true, options: [], searchable: false, value: null };
    const flow = harness({ controls: [date], planning: async () => ({ steps: [], needs: [{ ref: "from", label: date.label, kind: "date", options: [], required: true }], inferred: [] }) });
    try {
      flow.load();
      await until(() => flow.plans === 1);
      flow.setControls([{ ...date, value: "06" }]);
      const reads = flow.reads;
      await until(() => flow.reads > reads + 1);
      expect(flow.learned).toEqual([]);
    } finally { flow.close(); }
    await flow.result;
  });

  test("fills without submitting when the separate submit gate is off", async () => {
    const flow = harness();
    try {
      flow.load();
      await until(() => flow.statuses.includes("Ready to submit"));
      expect(flow.fills).toBe(1);
      expect(flow.submits).toBe(0);
      expect(flow.submittedCalls).toBe(0);
    } finally { flow.close(); }
    expect(await flow.result).toBe("closed");
  });

  test("finds a form that mounts after the initial page read", async () => {
    const flow = harness({ delayed: true });
    try {
      flow.load();
      await until(() => flow.statuses.includes("Open the application form to fill it"));
      flow.revealForm();
      await until(() => flow.fills === 1);
      expect(flow.plans).toBe(1);
      expect(flow.submits).toBe(0);
    } finally { flow.close(); }
    await flow.result;
  });

  test("ignores a plan that returns after the person closes the sheet", async () => {
    const planning = deferred<ApplyPlan>();
    const flow = harness({ autoSubmit: true, planning: () => planning.promise });
    flow.load();
    await until(() => flow.plans === 1);
    flow.close();
    expect(await flow.result).toBe("closed");
    planning.resolve(plan);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(flow.fills).toBe(0);
    expect(flow.submits).toBe(0);
    expect(flow.submittedCalls).toBe(0);
    expect(flow.cleaned).toBe(true);
  });

  test("Fill again fills a form whose load never said it finished", async () => {
    const flow = harness();
    try {
      flow.load();
      await until(() => flow.statuses.includes("Ready to submit"));
      // A navigation starts and is cancelled: no load end follows.
      flow.navigating();
      flow.correctEmail();
      flow.refill();
      await until(() => flow.reads >= 3);
      expect(flow.plans).toBe(2);
    } finally { flow.close(); }
    await flow.result;
  });

  test("does not fill or submit a new page using the previous page's plan", async () => {
    const planning = deferred<ApplyPlan>();
    const flow = harness({ autoSubmit: true, planning: () => planning.promise });
    try {
      flow.load();
      await until(() => flow.plans === 1);
      flow.navigating();
      planning.resolve(plan);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(flow.fills).toBe(0);
      expect(flow.submits).toBe(0);
    } finally { flow.close(); }
    await flow.result;
  });

  test("marks applied once only after confirmed submission", async () => {
    const flow = harness({ autoSubmit: true });
    try {
      flow.load();
      await until(() => flow.submittedCalls === 1);
      flow.refill();
      flow.load();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(flow.submits).toBe(1);
      expect(flow.submittedCalls).toBe(1);
    } finally { flow.close(); }
    expect(await flow.result).toBe("submitted");
  });

  test("a CAPTCHA or unknown outcome leaves completion with the person", async () => {
    for (const status of ["captcha", "unknown", "invalid"]) {
      const flow = harness({ autoSubmit: true });
      flow.setSubmitStatus(status);
      try {
        flow.load();
        await until(() => flow.statuses.some((value) => /then submit|fields need you/.test(value)));
        expect(flow.submittedCalls).toBe(0);
      } finally { flow.close(); }
      expect(await flow.result).toBe("closed");
    }
  });

  test("recognizes manual completion without an enabled auto-submit gate", async () => {
    const flow = harness();
    try {
      flow.load();
      await until(() => flow.statuses.includes("Ready to submit"));
      flow.manualSubmit();
      await until(() => flow.submittedCalls === 1);
      expect(flow.submits).toBe(0);
    } finally { flow.close(); }
    expect(await flow.result).toBe("submitted");
  });
});

describe("where assisted apply starts", () => {
  const posting = "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Engineer_JR1";
  test("goes straight to Workday's sign-in", () => {
    expect(assistedStartUrl(posting)).toBe(`${posting}/apply/applyManually`);
    expect(assistedStartUrl(`${posting}/?source=x`)).toBe(`${posting}/apply/applyManually?source=x`);
  });
  test("leaves anything else alone", () => {
    expect(assistedStartUrl(`${posting}/apply`)).toBe(`${posting}/apply`);
    expect(assistedStartUrl(`${posting}/apply/autofillWithResume`)).toBe(`${posting}/apply/autofillWithResume`);
    expect(assistedStartUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe("https://boards.greenhouse.io/acme/jobs/1");
  });
  test("isn't fooled by a careers site named apply", () => {
    const ebay = "https://ebay.wd5.myworkdayjobs.com/apply/job/Austin/Engineer_R1";
    expect(assistedStartUrl(ebay)).toBe(`${ebay}/apply/applyManually`);
  });
  test("isn't fooled by a title that starts with Apply", () => {
    const title = "https://kla.wd1.myworkdayjobs.com/Search/job/Milpitas-CA/Applications-Engineer_1";
    expect(assistedStartUrl(title)).toBe(`${title}/apply/applyManually`);
  });
});
