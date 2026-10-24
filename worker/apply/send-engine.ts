import type { ApplyPlan, FillStep, FormControl } from "../../shared/application-form";
import {
  CLOSE_POPOVERS_BODY,
  CODE_PROMPT_BODY,
  DECLINE_COOKIES_BODY,
  FILL_FORM_FUNCTION,
  FORM_ERRORS_BODY,
  PAGE_TEXT_BODY,
  READ_FORM_BODY,
  SUBMIT_FORM_BODY,
  codeFallbackBody,
  peekOptionsBody,
} from "./page-scripts";

/**
 * One application in the server browser, step by step: decline the cookie
 * banner, read the form, upload the resume first and let the site fill what
 * it reads from it, fill everything else from the plan, check what's still
 * empty, then submit. The same reader, filler and submit as assisted apply on
 * the phone (docs/auto-apply-phase0-2026-10-24.md has what phase 0 found).
 */

/** The page as the engine needs it; worker/apply/browser.ts drives a real one. */
export interface FormPage {
  /** Runs an async function body in the page; it returns a string. */
  run(body: string): Promise<string>;
  /** Clicks the element and types like a person. */
  type(selector: string, text: string): Promise<void>;
  screenshot(): Promise<Uint8Array>;
  url(): string;
  wait(ms: number): Promise<void>;
}

export interface ResumeUpload { name: string; base64: string }

type FillOutcome = "filled" | "missing" | "no_match" | "failed";
interface PageRead { submitted: boolean; controls: FormControl[] }
interface SubmitReport { status: "submitted" | "captcha" | "invalid" | "no_button" | "unknown"; errors: string[]; url: string }

export const isEmpty = (control: Pick<FormControl, "value">) =>
  control.value === null || (Array.isArray(control.value) ? control.value.length === 0 : control.value.trim() === "");

export async function readPage(page: FormPage): Promise<PageRead> {
  return JSON.parse(await page.run(READ_FORM_BODY)) as PageRead;
}

export async function declineCookies(page: FormPage): Promise<boolean> {
  return (await page.run(DECLINE_COOKIES_BODY).catch(() => "none")) === "declined";
}

/** Fills one step at a time, as the phone does, so one bad field can't stop the rest. */
export async function fillSteps(page: FormPage, steps: FillStep[], resume: ResumeUpload | null): Promise<Record<string, FillOutcome>> {
  const outcomes: Record<string, FillOutcome> = {};
  for (const step of steps) {
    const request = { steps: [step], resume: step.kind === "file" ? resume : null };
    try {
      const report = JSON.parse(await page.run(`return JSON.stringify(await (${FILL_FORM_FUNCTION})(${JSON.stringify(request)}));`)) as { outcomes: Record<string, FillOutcome> };
      Object.assign(outcomes, report.outcomes);
    } catch {
      outcomes[step.ref] = "failed";
    }
  }
  return outcomes;
}

const valuesOf = (controls: FormControl[]) => JSON.stringify(controls.map((control) => [control.ref, control.value]));

/** Lever and Ashby read an uploaded resume and fill fields themselves. Waits
 * until two reads in a row agree, or about ten seconds. */
async function settle(page: FormPage, before: FormControl[]): Promise<FormControl[]> {
  let last = valuesOf(before);
  let controls = before;
  let stable = 0;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.wait(1_000);
    controls = (await readPage(page)).controls;
    const now = valuesOf(controls);
    stable = now === last ? stable + 1 : 0;
    last = now;
    if (stable >= 2 && attempt >= 2) break;
  }
  return controls;
}

export type Prepared =
  | {
    kind: "ready";
    controls: FormControl[];
    /** The controls to plan with: what the site filled from the resume
     * counts as empty, so Pinkslip's own answers win where it has them. */
    planning: FormControl[];
    /** Filled by the site from the resume, not by Pinkslip. */
    siteFilled: string[];
    resumeRef: string | null;
    cookies: boolean;
  }
  | { kind: "no_form"; submitted: boolean };

/** Fixes 1 and 5 from phase 0: the cookie banner goes first, the resume next. */
export async function prepareForm(page: FormPage, resume: ResumeUpload | null): Promise<Prepared> {
  const cookies = await declineCookies(page);
  const first = await readPage(page);
  if (first.submitted || first.controls.length === 0) return { kind: "no_form", submitted: first.submitted };
  const before = first.controls;
  const resumeControl = before.find((control) => control.kind === "file" && /resume|\bcv\b/i.test(control.label) && isEmpty(control)) ?? null;
  let controls = before;
  if (resumeControl && resume) {
    await fillSteps(page, [{ ref: resumeControl.ref, kind: "file", value: "resume" }], resume);
    controls = await settle(page, before);
  }
  const wasEmpty = new Set(before.filter(isEmpty).map((control) => control.ref));
  const siteFilled = controls
    .filter((control) => control.kind !== "file" && wasEmpty.has(control.ref) && !isEmpty(control))
    .map((control) => control.ref);
  const cleared = new Set(siteFilled);
  return {
    kind: "ready",
    controls,
    planning: controls.map((control) => (cleared.has(control.ref) ? { ...control, value: null } : control)),
    siteFilled,
    resumeRef: resumeControl && resume ? resumeControl.ref : null,
    cookies,
  };
}

export interface Filled {
  controls: FormControl[];
  outcomes: Record<string, FillOutcome>;
  /** Required questions still empty: the send stops here and asks. */
  open: FormControl[];
  /** The form's own validation messages on screen; the send stops for these too. */
  errors: string[];
}

export async function formErrors(page: FormPage): Promise<string[]> {
  return JSON.parse(await page.run(FORM_ERRORS_BODY).catch(() => "[]")) as string[];
}

/** Asks the planner again about controls whose options came to light. */
export type Replan = (controls: FormControl[]) => Promise<Pick<ApplyPlan, "steps">>;

/** Reads the form with nothing open over it. */
async function checkedRead(page: FormPage): Promise<FormControl[]> {
  await page.run(CLOSE_POPOVERS_BODY).catch(() => undefined);
  await page.wait(300);
  return (await readPage(page)).controls;
}

/**
 * Fills the plan, then:
 * - fix 4: a search the site cleared (WorkOS's location) or a pick that didn't
 *   take gets one more try;
 * - a search box that lists its options only when opened (Ashby's "How did
 *   you hear about us?") is opened, read, and planned again with them;
 * - a required question that was on the form before the fill and can't be
 *   found after it counts as unanswered, so a form that changed under the
 *   fill is never taken as complete.
 */
export async function fillPlan(
  page: FormPage,
  plan: Pick<ApplyPlan, "steps">,
  prepared: Extract<Prepared, { kind: "ready" }>,
  resume: ResumeUpload | null,
  replan?: Replan,
): Promise<Filled> {
  const steps = plan.steps.filter((step) => !(step.kind === "file" && (step.ref === prepared.resumeRef || !resume)));
  const outcomes = await fillSteps(page, steps, resume);

  if (replan) {
    const unpicked = steps.filter((step) => step.kind === "combobox" && outcomes[step.ref] === "no_match");
    const revealed: FormControl[] = [];
    for (const step of unpicked) {
      const control = prepared.controls.find((entry) => entry.ref === step.ref);
      const options = JSON.parse(await page.run(peekOptionsBody(step.ref)).catch(() => "[]")) as string[];
      if (control && options.length > 0) revealed.push({ ...control, options, searchable: false, value: null });
    }
    if (revealed.length > 0) {
      const again = await replan(revealed);
      const picks = again.steps.filter((step) => revealed.some((control) => control.ref === step.ref));
      Object.assign(outcomes, await fillSteps(page, picks, resume));
    }
  }

  let controls = await checkedRead(page);
  const byRef = (ref: string) => controls.find((control) => control.ref === ref);
  const retry = steps.filter((step) => step.kind !== "file" && step.kind !== "checkbox" && byRef(step.ref) && isEmpty(byRef(step.ref)!));
  if (retry.length > 0) {
    Object.assign(outcomes, await fillSteps(page, retry, resume));
    controls = await checkedRead(page);
  }
  const present = new Set(controls.map((control) => `${control.kind}|${control.label}`));
  const vanished = prepared.controls.filter((control) => control.required && !present.has(`${control.kind}|${control.label}`));
  return {
    controls,
    outcomes,
    open: [...controls.filter((control) => control.required && isEmpty(control)), ...vanished],
    errors: await formErrors(page),
  };
}

/** Ashby's own resume autofill can land after the fill. Right before the
 * picture and Submit, read once more and fill again if anything moved. */
export async function recheck(page: FormPage, plan: Pick<ApplyPlan, "steps">, prepared: Extract<Prepared, { kind: "ready" }>, resume: ResumeUpload | null, filled: Filled, replan?: Replan): Promise<Filled> {
  await page.wait(1_500);
  const latest = await checkedRead(page);
  if (valuesOf(latest) === valuesOf(filled.controls)) return filled;
  return fillPlan(page, plan, prepared, resume, replan);
}

export type Submitted =
  | { status: "submitted"; url: string; text: string }
  | { status: "code_needed" }
  | { status: "captcha" | "no_button" | "unknown"; url: string }
  | { status: "invalid"; errors: string[]; url: string };

async function afterSubmit(page: FormPage, report: SubmitReport): Promise<Submitted> {
  if (report.status === "submitted") {
    return { status: "submitted", url: report.url, text: await page.run(PAGE_TEXT_BODY).catch(() => "") };
  }
  if (report.status !== "captcha") {
    const prompt = JSON.parse(await page.run(CODE_PROMPT_BODY).catch(() => "{}")) as { asks?: boolean };
    if (prompt.asks) return { status: "code_needed" };
  }
  if (report.status === "invalid") return { status: "invalid", errors: report.errors, url: report.url };
  // Nothing recognisable, but the form is still there and says what's wrong:
  // it refused, rather than sending without a confirmation.
  if (report.status === "unknown") {
    const errors = await formErrors(page);
    const still = (JSON.parse(await page.run(READ_FORM_BODY).catch(() => "{}")) as Partial<PageRead>).controls ?? [];
    if (errors.length > 0 && still.length > 0) return { status: "invalid", errors, url: report.url };
  }
  return { status: report.status, url: report.url };
}

/** Presses Submit and reads what the page said. */
export async function submit(page: FormPage): Promise<Submitted> {
  await declineCookies(page);
  return afterSubmit(page, JSON.parse(await page.run(SUBMIT_FORM_BODY)) as SubmitReport);
}

/** Types the emailed code into the boxes the prompt stamped, then submits again. */
export async function enterCode(page: FormPage, code: string): Promise<Submitted | { status: "no_field" }> {
  const prompt = JSON.parse(await page.run(CODE_PROMPT_BODY).catch(() => "{}")) as { boxes?: number };
  if (!prompt.boxes) return { status: "no_field" };
  await page.type('[data-pinkslip-code="0"]', code).catch(() => undefined);
  await page.run(codeFallbackBody(code));
  await page.wait(500);
  const report = JSON.parse(await page.run(SUBMIT_FORM_BODY)) as SubmitReport;
  // Some forms send the application as soon as the last box is typed.
  if (report.status === "no_button") {
    const settled = JSON.parse(await page.run(READ_FORM_BODY)) as PageRead;
    if (settled.submitted) return { status: "submitted", url: page.url(), text: await page.run(PAGE_TEXT_BODY).catch(() => "") };
  }
  return afterSubmit(page, report);
}
