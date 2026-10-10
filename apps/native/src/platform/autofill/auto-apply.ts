import type { ApiClient } from "@pinkslip/core/api";
import type { ApplyPlan, FillStep, FormControl } from "@pinkslip/domain/application-form";
import { File } from "expo-file-system";
import { localResumeFile } from "../resume-file";
import { FILL_FORM_FUNCTION, READ_FORM_BODY, SUBMIT_FORM_BODY } from "./scripts.generated";

/** The in-app browser as the loop sees it (ApplicationBrowser.tsx). */
export interface ApplicationBrowserSession {
  open(url: string, events: { onLoaded: (url: string) => void; onRefill: () => void; onFinished: () => void }): Promise<() => void>;
  /** Runs `body` as an async function in the form page; it returns a string. */
  run(body: string): Promise<string>;
  setStatus(text: string): Promise<void>;
}

interface PageRead { submitted: boolean; controls: FormControl[] }
type FillOutcome = "filled" | "missing" | "no_match" | "failed";
interface FillReport { outcomes: Record<string, FillOutcome> }
interface SubmitReport { status: "submitted" | "captcha" | "invalid" | "no_button" | "unknown"; errors: string[]; url: string }

export type AutoApplyResult = "submitted" | "closed";
export interface AutoApplyOptions { jobId: string; url: string; autoSubmit: boolean; onSubmitted?: () => void }

const isEmpty = (control: FormControl) =>
  control.value === null || (Array.isArray(control.value) ? control.value.length === 0 : control.value.trim() === "");
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

async function resumeForUpload(): Promise<{ name: string; base64: string } | null> {
  const kept = localResumeFile();
  if (!kept) return null;
  try { return { name: kept.name, base64: await new File(kept.uri).base64() }; } catch { return null; }
}

/**
 * The Capacitor app's auto-apply loop, unchanged in behavior: on every page
 * load it reads the form, asks the API how to answer it, fills one field at a
 * time, rereads what's still required, and (when allowed) submits. Questions
 * it can't answer stay for the person, and what they choose or correct is
 * saved for next time. The page never sees the Pinkslip session: the app
 * talks to the API and only hands the page fill instructions.
 */
export function autoApply(api: ApiClient, browser: ApplicationBrowserSession, options: AutoApplyOptions): Promise<AutoApplyResult> {
  return new Promise((resolve, reject) => {
    let running = false;
    let again = false;
    let submitted = false;
    let closed = false;
    let stop: (() => void) | null = null;
    let watchTimer: ReturnType<typeof setTimeout> | null = null;
    let shownOpen = -1;
    let formShown = false;
    let watched = new Map<string, string>();
    const learned = new Map<string, string>();
    const resumeFile = resumeForUpload();
    const read = async () => JSON.parse(await within(browser.run(READ_FORM_BODY), 20_000)) as PageRead;
    const where = (url: string) => { try { const parsed = new URL(url); return `${parsed.host}${parsed.pathname}`; } catch { return ""; } };
    const host = where(options.url).split("/")[0];
    let page = "";
    const tell = (fields: Record<string, unknown>) => void api.apply.report({ host, page, ...fields }).catch(() => undefined);

    const fill = async (steps: FillStep[], resume: Awaited<typeof resumeFile>) => {
      const outcomes: FillReport["outcomes"] = {};
      const errors: Record<string, string> = {};
      for (const step of steps) {
        try {
          const request = { steps: [step], resume: step.kind === "file" ? resume : null };
          const report = JSON.parse(await within(browser.run(`return JSON.stringify(await (${FILL_FORM_FUNCTION})(${JSON.stringify(request)}));`), 30_000)) as FillReport;
          Object.assign(outcomes, report.outcomes);
        } catch (error) {
          outcomes[step.ref] = "failed";
          errors[step.ref] = message(error);
        }
      }
      return { outcomes, errors };
    };
    const learnFrom = async (controls: FormControl[]) => {
      const fresh: FormControl[] = [];
      for (const control of controls) {
        const expected = watched.get(control.ref);
        if (expected === undefined || isEmpty(control)) continue;
        const value = JSON.stringify(control.value);
        if (value === expected || value === learned.get(control.ref)) continue;
        learned.set(control.ref, value);
        fresh.push(control);
      }
      if (fresh.length > 0) await api.apply.learn(fresh).catch(() => undefined);
    };
    const applied = async () => {
      if (submitted) return;
      submitted = true;
      await browser.setStatus("Applied");
      options.onSubmitted?.();
    };
    const showOpen = async (open: number) => {
      if (open === shownOpen) return;
      shownOpen = open;
      await browser.setStatus(open === 0 ? "Ready to submit" : open === 1 ? "1 question needs you" : `${open} questions need you`);
    };
    const watch = async () => {
      if (closed) return;
      if (!running && !submitted && formShown) {
        try {
          const { submitted: done, controls } = await read();
          if (!running) {
            if (done) { tell({ stage: "submitted", by: "user" }); await applied(); }
            else { await learnFrom(controls); await showOpen(controls.filter((control) => control.required && isEmpty(control)).length); }
          }
        } catch {
          // Mid-navigation; the next look will do.
        }
      }
      watchTimer = setTimeout(() => void watch(), 2_000);
    };
    const pass = async () => {
      if (submitted) return;
      if (running) { again = true; return; }
      running = true;
      let phase = "read";
      let filled: Awaited<ReturnType<typeof fill>> | null = null;
      let fillMs = 0;
      try {
        await browser.setStatus("Reading…");
        const first = await read();
        if (first.submitted) { tell({ stage: "submitted", by: "user" }); await applied(); return; }
        let controls = first.controls;
        if (controls.length === 0) { tell({ stage: "empty" }); await browser.setStatus(""); return; }
        formShown = true;
        await learnFrom(controls);
        phase = "plan";
        shownOpen = -1;
        await browser.setStatus("Filling…");
        const plan: ApplyPlan = await api.apply.plan(options.jobId, controls);
        const byRef = new Map(controls.map((control) => [control.ref, control]));
        watched = new Map([
          ...plan.needs.map((need) => [need.ref, ""] as const),
          ...plan.inferred.filter((guess) => !["checkbox", "checkboxes"].includes(byRef.get(guess.ref)?.kind ?? ""))
            .map((guess) => [guess.ref, JSON.stringify(guess.answer)] as const),
        ]);
        phase = "fill";
        const resume = await resumeFile;
        const started = Date.now();
        filled = await fill(plan.steps, resume);
        fillMs = Date.now() - started;
        phase = "reread";
        const before = new Map(controls.map((control) => [control.ref, control]));
        controls = (await read()).controls;
        const open = controls.filter((control) => control.required && isEmpty(control));
        tell({
          stage: "filled", controls: controls.length, steps: plan.steps.length, needs: plan.needs.length, resume: resume !== null, fill_ms: fillMs,
          outcomes: filled.outcomes, open_required: open.map((control) => `${control.kind}: ${control.label}`),
          failed: Object.entries(filled.outcomes).filter(([, outcome]) => outcome !== "filled")
            .map(([ref, outcome]) => `${before.get(ref)?.kind}: ${before.get(ref)?.label}: ${outcome}${filled?.errors[ref] ? ` (${filled.errors[ref]})` : ""}`),
        });
        phase = "submit";
        if (open.length > 0 || !options.autoSubmit) { await showOpen(open.length); return; }
        await browser.setStatus("Submitting…");
        const report = JSON.parse(await within(browser.run(SUBMIT_FORM_BODY), 30_000)) as SubmitReport;
        if (report.status === "submitted") { tell({ stage: "submitted", by: "app" }); await applied(); }
        else if (report.status === "captcha") await browser.setStatus("Finish the check, then submit");
        else if (report.status === "invalid") await browser.setStatus(`${report.errors.length || "Some"} fields need you`);
        else await browser.setStatus("Check the form, then submit");
      } catch (error) {
        tell({ stage: "error", phase, fill_ms: fillMs, outcomes: filled?.outcomes ?? {}, failed: [message(error)] });
        await browser.setStatus("Fill by hand, or tap Fill").catch(() => undefined);
      } finally {
        running = false;
        if (again) { again = false; void pass(); }
      }
    };

    browser.open(options.url, {
      onLoaded: (url) => { page = where(url); watched = new Map(); learned.clear(); formShown = false; void pass(); },
      onRefill: () => void pass(),
      onFinished: () => {
        closed = true;
        if (watchTimer) clearTimeout(watchTimer);
        stop?.();
        resolve(submitted ? "submitted" : "closed");
      },
    }).then((cleanup) => { stop = cleanup; void watch(); }, reject);
  });
}
