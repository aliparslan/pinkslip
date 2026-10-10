import { describe, expect, test } from "bun:test";
import { createApiClient } from "../packages/core/src/api";
import type { ApplyPlan, FormControl } from "../shared/application-form";
import { runAutoApply, type ApplicationBrowserSession } from "../apps/native/src/platform/autofill/auto-apply-loop";
import { READ_FORM_BODY, SUBMIT_FORM_BODY } from "../apps/native/src/platform/autofill/scripts.generated";

const email = (): FormControl => ({ ref: "email", kind: "email", label: "Email", required: true, options: [], searchable: false, value: null });
const plan: ApplyPlan = { steps: [{ ref: "email", kind: "email", value: "avery@example.com" }], needs: [], inferred: [] };
const deferred = <T>() => Promise.withResolvers<T>();
async function until(condition: () => boolean) {
  const deadline = Date.now() + 6_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Application flow did not reach the expected state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function harness(options: { autoSubmit?: boolean; delayed?: boolean; planning?: () => Promise<ApplyPlan> } = {}) {
  let events: Parameters<ApplicationBrowserSession["open"]>[1];
  let controls = options.delayed ? [] : [email()];
  let submitted = false;
  let submittedCalls = 0;
  let fills = 0;
  let submits = 0;
  let plans = 0;
  let reads = 0;
  let cleaned = false;
  let submitStatus = "submitted";
  const statuses: string[] = [];
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
    run: async (body) => {
      if (body === READ_FORM_BODY) { reads += 1; return JSON.stringify({ submitted, controls }); }
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
  const result = runAutoApply(api, browser, { jobId: "job-1", url: "https://jobs.test/1", autoSubmit: options.autoSubmit ?? false,
    onSubmitted: () => { submittedCalls += 1; } }, async () => null);
  return {
    result, statuses, learned,
    load: () => events.onLoaded("https://jobs.test/1"),
    navigating: () => events.onNavigating(),
    refill: () => events.onRefill(),
    close: () => events.onFinished(),
    revealForm: () => { controls = [email()]; },
    manualSubmit: () => { submitted = true; controls = []; },
    correctEmail: () => { controls = [{ ...email(), value: "corrected@example.com" }]; },
    setSubmitStatus: (status: string) => { submitStatus = status; },
    get fills() { return fills; }, get plans() { return plans; }, get reads() { return reads; },
    get submits() { return submits; }, get submittedCalls() { return submittedCalls; }, get cleaned() { return cleaned; },
  };
}

describe("native application session", () => {
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
