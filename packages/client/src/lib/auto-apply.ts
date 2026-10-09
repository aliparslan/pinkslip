import { api } from "@pinkslip/core/api";
import type { ApplyPlan, FillStep, FormControl } from "../../../../shared/application-form";
import { fillScript, submitScript, type FillReport, type SubmitReport } from "./form-filler";
import { formReaderScript, type PageRead } from "./form-reader";
import type { ApplicationBrowserSession } from "./platform";
import { loadResumeFile } from "./resume-file-store";

export type AutoApplyResult = "submitted" | "closed";

export interface AutoApplyOptions {
  jobId: string;
  url: string;
  /** Press Submit once nothing required is empty. */
  autoSubmit: boolean;
  onSubmitted?: () => void;
}

const isEmpty = (control: FormControl) =>
  control.value === null || (Array.isArray(control.value) ? control.value.length === 0 : control.value.trim() === "");

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A page script that never settles must not hold the whole pass. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Applies to one job in the native form browser: on every page load it reads
 * the form, asks the server how to answer it, fills it, checks nothing
 * required is left, and submits. Questions it can't answer stay for the user,
 * and the page is watched while they answer: what they choose, or change
 * from a guess, is saved so the same question fills itself next time.
 *
 * The page never sees the user's session: the app talks to the server and
 * only hands the page fill instructions.
 */
export function autoApply(browser: ApplicationBrowserSession, options: AutoApplyOptions): Promise<AutoApplyResult> {
  return new Promise((resolve, reject) => {
    let running = false;
    let again = false;
    let submitted = false;
    let closed = false;
    let stop: (() => void) | null = null;
    let watchTimer: ReturnType<typeof setTimeout> | null = null;
    let shownOpen = -1;
    let formShown = false;
    // Controls whose answer is the user's: questions we couldn't answer
    // (expected "") and Jev guesses they may correct (expected the guess).
    let watched = new Map<string, string>();
    const learned = new Map<string, string>();
    const resumeFile = loadResumeFile();

    const read = async () => JSON.parse(await within(browser.run(formReaderScript()), 20_000)) as PageRead;
    const where = (url: string) => {
      try {
        const parsed = new URL(url);
        return `${parsed.host}${parsed.pathname}`;
      } catch {
        return "";
      }
    };
    const host = where(options.url).split("/")[0];
    let page = "";
    const tell = (fields: Record<string, unknown>) =>
      void api.apply.report({ host, page, ...fields }).catch(() => undefined);

    // One field per call: a field that breaks the page script costs only
    // that field, the report names it, and the resume only travels with the
    // upload step.
    const fill = async (steps: FillStep[], resume: Awaited<typeof resumeFile>) => {
      const outcomes: FillReport["outcomes"] = {};
      const errors: Record<string, string> = {};
      for (const step of steps) {
        try {
          const request = { steps: [step], resume: step.kind === "file" ? resume : null };
          const report = JSON.parse(await within(browser.run(fillScript(request)), 30_000)) as FillReport;
          Object.assign(outcomes, report.outcomes);
        } catch (error) {
          outcomes[step.ref] = "failed";
          errors[step.ref] = message(error);
        }
      }
      return { outcomes, errors };
    };

    /** Saves what the user put in watched controls since we last looked. */
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

    /** Submitted, by us or by the user's own tap. */
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
          if (running) {
            // A pass started meanwhile and reads for itself.
          } else if (done) {
            tell({ stage: "submitted", by: "user" });
            await applied();
          } else {
            await learnFrom(controls);
            await showOpen(controls.filter((control) => control.required && isEmpty(control)).length);
          }
        } catch {
          // Mid-navigation; the next look will do.
        }
      }
      watchTimer = setTimeout(() => void watch(), 2_000);
    };

    const pass = async () => {
      if (submitted) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      let phase = "read";
      let filled: Awaited<ReturnType<typeof fill>> | null = null;
      let fillMs = 0;
      try {
        await browser.setStatus("Reading…");
        const first = await read();
        if (first.submitted) {
          tell({ stage: "submitted", by: "user" });
          await applied();
          return;
        }
        let controls = first.controls;
        if (controls.length === 0) {
          tell({ stage: "empty" });
          await browser.setStatus("");
          return;
        }

        formShown = true;
        await learnFrom(controls);

        phase = "plan";
        shownOpen = -1;
        await browser.setStatus("Filling…");
        const plan: ApplyPlan = await api.apply.plan(options.jobId, controls);
        const byRef = new Map(controls.map((control) => [control.ref, control]));
        watched = new Map([
          ...plan.needs.map((need) => [need.ref, ""] as const),
          ...plan.inferred
            .filter((guess) => !["checkbox", "checkboxes"].includes(byRef.get(guess.ref)?.kind ?? ""))
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
          stage: "filled",
          controls: controls.length,
          steps: plan.steps.length,
          needs: plan.needs.length,
          resume: resume !== null,
          fill_ms: fillMs,
          outcomes: filled.outcomes,
          open_required: open.map((control) => `${control.kind}: ${control.label}`),
          failed: Object.entries(filled.outcomes)
            .filter(([, outcome]) => outcome !== "filled")
            .map(([ref, outcome]) =>
              `${before.get(ref)?.kind}: ${before.get(ref)?.label}: ${outcome}${filled?.errors[ref] ? ` (${filled.errors[ref]})` : ""}`),
        });
        phase = "submit";
        if (open.length > 0 || !options.autoSubmit) {
          await showOpen(open.length);
          return;
        }

        await browser.setStatus("Submitting…");
        const report = JSON.parse(await within(browser.run(submitScript()), 30_000)) as SubmitReport;
        if (report.status === "submitted") {
          tell({ stage: "submitted", by: "app" });
          await applied();
        } else if (report.status === "captcha") {
          await browser.setStatus("Finish the check, then submit");
        } else if (report.status === "invalid") {
          await browser.setStatus(`${report.errors.length || "Some"} fields need you`);
        } else {
          await browser.setStatus("Check the form, then submit");
        }
      } catch (error) {
        console.error("Auto-apply pass failed", error);
        tell({ stage: "error", phase, fill_ms: fillMs, outcomes: filled?.outcomes ?? {}, failed: [message(error)] });
        await browser.setStatus("Fill by hand, or tap Fill").catch(() => undefined);
      } finally {
        running = false;
        if (again) {
          again = false;
          void pass();
        }
      }
    };

    browser.open(options.url, {
      onLoaded: (url) => {
        // A new page numbers its controls afresh.
        page = where(url);
        watched = new Map();
        learned.clear();
        formShown = false;
        void pass();
      },
      onRefill: () => void pass(),
      onFinished: () => {
        closed = true;
        if (watchTimer) clearTimeout(watchTimer);
        stop?.();
        resolve(submitted ? "submitted" : "closed");
      },
    }).then((cleanup) => {
      stop = cleanup;
      void watch();
    }, reject);
  });
}
