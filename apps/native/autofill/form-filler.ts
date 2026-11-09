import type { FillStep } from "@pinkslip/domain/application-form";

export type { FillStep };

/**
 * Fills and submits a form that `readForm` has read, on any site. Each step
 * names a control by the data-pinkslip-ref the reader stamped on it.
 *
 * `fillForm` and `submitForm` run inside the employer's page, so each must stay
 * self-contained: no imports and no references outside the function.
 */

export interface FillRequest {
  steps: FillStep[];
  resume: { name: string; base64: string } | null;
}

export type FillOutcome = "filled" | "missing" | "no_match" | "failed";

export interface FillReport {
  outcomes: Record<string, FillOutcome>;
}

/** `code`: the page asks for a code it emailed (Greenhouse's security code). */
export type SubmitStatus = "submitted" | "captcha" | "invalid" | "no_button" | "code" | "unknown";

export interface SubmitReport {
  status: SubmitStatus;
  /** Labels of fields the page flagged, when it refused the submission. */
  errors: string[];
  url: string;
}

export async function fillForm(request: FillRequest): Promise<FillReport> {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const norm = (value: string | null | undefined) =>
    (value ?? "").replace(/\s+/g, " ").replace(/\s*[*✱]\s*$/, "").trim().toLowerCase();
  const values = (step: FillStep) => (Array.isArray(step.value) ? step.value : [step.value]);
  const find = (ref: string) => document.querySelector(`[data-pinkslip-ref="${CSS.escape(ref)}"]`);

  // React tracks the native value setter, so set through it and announce the
  // change. Searches must not blur: they clear unconfirmed text on blur.
  const setValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string, blur = true) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    if (!blur) return;
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    element.dispatchEvent(new FocusEvent("blur"));
  };

  const press = (element: Element) => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    (element as HTMLElement).click();
  };

  /** Best option for a wanted answer: exact, then prefix either way, then
   * contains, then the most shared words ("Bachelor's" ~ "Bachelor's Degree"). */
  const bestMatch = <T>(options: T[], text: (option: T) => string, wanted: string): T | undefined => {
    const target = norm(wanted);
    const labelled = options.map((option) => [option, norm(text(option))] as const);
    const direct = labelled.find(([, label]) => label === target)
      ?? labelled.find(([, label]) => label.startsWith(target) || target.startsWith(label))
      ?? labelled.find(([, label]) => label.includes(target));
    if (direct) return direct[0];
    const words = (value: string) => new Set(value.replace(/[^a-z0-9 ]/g, " ").split(" ").filter((word) => word.length > 2 && !["the", "and", "of", "at"].includes(word)));
    const wantedWords = words(target);
    let best: T | undefined;
    let bestScore = 0;
    for (const [option, label] of labelled) {
      const shared = [...words(label)].filter((word) => wantedWords.has(word)).length;
      const score = wantedWords.size > 0 ? shared / wantedWords.size : 0;
      if (score > bestScore) {
        best = option;
        bestScore = score;
      }
    }
    return bestScore >= 0.6 ? best : undefined;
  };

  const optionText = (input: HTMLInputElement) =>
    (input.labels?.[0] ?? input.closest("label"))?.textContent ?? input.value;

  const reactSelect = (input: Element) => {
    const key = Object.keys(input).find((name) => name.startsWith("__reactFiber"));
    let fiber = key ? (input as unknown as Record<string, { stateNode?: unknown; return?: unknown }>)[key] : null;
    while (fiber) {
      const instance = fiber.stateNode as {
        selectOption?: (option: unknown) => void;
        props?: {
          options?: unknown[];
          getOptionLabel?: (option: unknown) => string;
          loadOptions?: (search: string, loaded: unknown[], additional: unknown) => Promise<{ options?: unknown[] } | undefined>;
          additional?: unknown;
        };
      } | null;
      if (instance && typeof instance.selectOption === "function" && instance.props) return instance;
      fiber = fiber.return as typeof fiber;
    }
    return null;
  };
  const selectLabel = (select: NonNullable<ReturnType<typeof reactSelect>>, option: unknown) =>
    select.props?.getOptionLabel?.(option) ?? String((option as { label?: unknown }).label ?? "");

  /** Types into a search box and picks the suggestion that matches. */
  const typeAndPick = async (input: HTMLInputElement, wanted: string): Promise<boolean> => {
    // A paginated search (Greenhouse's school and degree) loads options only
    // through its loader, so ask it directly with the full text, then the first word.
    const searching = reactSelect(input);
    if (searching?.props?.loadOptions) {
      for (const query of [wanted, wanted.split(/[\s,']/)[0]]) {
        const result = await searching.props.loadOptions(query, [], searching.props.additional ?? { page: 1 }).catch(() => undefined);
        const options = result?.options ?? [];
        const match = bestMatch(options, (option) => selectLabel(searching, option), wanted);
        if (match) {
          searching.selectOption?.(match);
          return true;
        }
      }
    }
    setValue(input, wanted, false);
    const firstWord = norm(wanted.split(",")[0]);
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await wait(250);
      const select = reactSelect(input);
      if (select?.props?.options?.length) {
        const options = select.props.options;
        const match = bestMatch(options, (option) => selectLabel(select, option), wanted)
          ?? options.find((option) => norm(selectLabel(select, option)).includes(firstWord));
        if (match) {
          select.selectOption?.(match);
          return true;
        }
        continue;
      }
      const suggestions = [...document.querySelectorAll("[role='option'], [class*='suggestion' i] li, .dropdown-results li, [class*='autocomplete' i] li")]
        .filter((option) => !option.id.startsWith("iti-") && (option as HTMLElement).offsetParent !== null);
      const match = bestMatch(suggestions, (option) => option.textContent ?? "", wanted)
        ?? suggestions.find((option) => norm(option.textContent).includes(firstWord));
      if (match) {
        press(match);
        return true;
      }
    }
    return false;
  };

  // Bring each question into view as it fills, so the user can follow along.
  const reveal = async (element: Element) => {
    const target = (element as HTMLElement).offsetParent === null
      ? element.closest("[class*='field' i], [data-field-path], fieldset, li") ?? element.parentElement ?? element
      : element;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    await wait(180);
  };

  /** Workday's dropdown: a button whose list exists only while it's open. */
  const pickFromList = async (button: HTMLElement, wanted: string): Promise<FillOutcome> => {
    if (norm(button.textContent) === norm(wanted)) return "filled";
    button.click();
    let list: HTMLElement | null = null;
    for (let attempt = 0; attempt < 40 && !list; attempt += 1) {
      await wait(50);
      const opened = document.getElementById(button.getAttribute("aria-controls") ?? "");
      if (opened?.querySelector("[role='option']")) list = opened;
    }
    if (!list) return "failed";
    // "Select One" has no value of its own.
    const options = [...list.querySelectorAll("[role='option']")].filter((option) => option.getAttribute("data-value") !== "");
    const option = bestMatch(options, (candidate) => candidate.textContent ?? "", wanted);
    if (option) {
      (option as HTMLElement).click();
      return "filled";
    }
    (document.activeElement ?? list).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
    return "no_match";
  };

  /** On Workday, the Terms box is the person's to tick. Its menus take a real
   * tap and draw only some of their rows, and its date boxes aren't plain text. */
  const leftToThePerson = (element: Element) =>
    /termsAndConditions/i.test(element.id)
    || element.getAttribute("data-uxi-widget-type") === "selectinput"
    || (element.getAttribute("data-automation-id") ?? "").startsWith("dateSection");

  const fillStep = async (step: FillStep): Promise<FillOutcome> => {
    const element = find(step.ref);
    if (!element) return "missing";
    if (leftToThePerson(element)) return "no_match";
    await reveal(element);
    const wanted = values(step);

    switch (step.kind) {
      case "file": {
        if (!request.resume || !(element instanceof HTMLInputElement)) return "missing";
        if (element.files && element.files.length > 0) return "filled";
        const bytes = Uint8Array.from(atob(request.resume.base64), (character) => character.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], request.resume.name, { type: "application/pdf" }));
        element.files = transfer.files;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return "filled";
      }
      case "select": {
        if (element.getAttribute("aria-haspopup") === "listbox") return pickFromList(element as HTMLElement, wanted[0]);
        if (!(element instanceof HTMLSelectElement)) return "failed";
        const option = bestMatch([...element.options].filter((candidate) => candidate.value !== ""), (candidate) => candidate.textContent ?? "", wanted[0]);
        if (!option) return "no_match";
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(element, option.value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return "filled";
      }
      case "combobox": {
        const input = element as HTMLInputElement;
        const select = reactSelect(input);
        if (select?.props?.options?.length && !step.pick) {
          let any = false;
          for (const value of wanted) {
            const option = bestMatch(select.props.options, (candidate) => selectLabel(select, candidate), value);
            if (option) {
              select.selectOption?.(option);
              any = true;
              await wait(60);
            }
          }
          return any ? "filled" : "no_match";
        }
        if (await typeAndPick(input, wanted[0])) return "filled";
        // Typed text isn't an answer. Leave the search empty and closed: an
        // open list can hide the rest of the form from the next read.
        setValue(input, "", false);
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        input.blur();
        return "no_match";
      }
      case "radio":
      case "checkboxes": {
        const inputs = [...element.querySelectorAll<HTMLInputElement>(step.kind === "radio" ? "input[type=radio]" : "input[type=checkbox]")];
        let any = false;
        for (const value of wanted) {
          const input = bestMatch(inputs, optionText, value);
          if (input) {
            if (!input.checked) input.click();
            any = true;
          }
        }
        return any ? "filled" : "no_match";
      }
      case "checkbox": {
        const input = element as HTMLInputElement;
        if (!input.checked) input.click();
        return "filled";
      }
      case "buttons": {
        const buttons = [...element.querySelectorAll("button")];
        const button = bestMatch(buttons, (candidate) => candidate.textContent ?? "", wanted[0]);
        if (!button) return "no_match";
        if (button.getAttribute("aria-pressed") !== "true") press(button);
        return "filled";
      }
      default: {
        const input = element as HTMLInputElement | HTMLTextAreaElement;
        if (input.value.trim() && norm(input.value) === norm(wanted.join(", "))) return "filled";
        if (step.pick && input instanceof HTMLInputElement) {
          if (await typeAndPick(input, wanted[0])) return "filled";
          // No suggestions came up, so it was plain text after all.
          setValue(input, wanted[0]);
          return "filled";
        }
        setValue(input, wanted.join(", "));
        return "filled";
      }
    }
  };

  const outcomes: Record<string, FillOutcome> = {};
  for (const step of request.steps) {
    try {
      outcomes[step.ref] = await fillStep(step);
    } catch {
      outcomes[step.ref] = "failed";
    }
  }
  return { outcomes };
}

/** Presses the form's submit button and waits to see what the page says. */
export async function submitForm(): Promise<SubmitReport> {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const shown = (element: Element) => (element as HTMLElement).offsetParent !== null;
  const text = (element: Element | null | undefined) => (element?.textContent ?? "").replace(/\s+/g, " ").trim();

  const scope = document.querySelector("form") ?? document.body;
  const button = [...scope.querySelectorAll<HTMLElement>("button, input[type=submit]")]
    .filter(shown)
    .find((candidate) =>
      (candidate as HTMLButtonElement).type === "submit"
      || /^(submit|submit application|apply|apply now|send application)$/i.test(text(candidate) || (candidate as HTMLInputElement).value || ""));
  if (!button) return { status: "no_button", errors: [], url: location.href };

  const startUrl = location.href;
  button.click();

  const SUCCESS = /(thank you|thanks) for (applying|your application|your interest)|application (was |has been )?(successfully )?(submitted|received)|we('ve| have) received your application/i;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await wait(500);
    // Ashby's own box for a sent application, whatever words it holds.
    if (document.querySelector(".ashby-application-form-success-container")
      || SUCCESS.test(document.body.innerText) || (location.href !== startUrl && /confirm|thank|success/i.test(location.href))) {
      return { status: "submitted", errors: [], url: location.href };
    }
    // Ashby's own box for one it wouldn't take: its invisible captcha said no,
    // or something else went wrong. Either way nothing was sent.
    const refused = document.querySelector(".ashby-application-form-failure-container");
    if (refused) {
      return /captcha|robot/i.test(text(refused))
        ? { status: "captcha", errors: [], url: location.href }
        : { status: "invalid", errors: [text(refused)], url: location.href };
    }
    // Google keeps its challenge frame on the page from the start, hidden far
    // above the screen and tall enough to pass for a real one. Only a
    // challenge the person could see counts (owner, 2026-11-08: every Ashby
    // send read as a captcha half a second after Submit, and stopped there).
    const challenge = [...document.querySelectorAll("iframe")].find((frame) => {
      if (!/recaptcha\/(api2|enterprise)\/bframe|hcaptcha/.test(frame.src)) return false;
      const box = frame.getBoundingClientRect();
      return getComputedStyle(frame).visibility === "visible" && box.width > 100 && box.height > 100 && box.bottom > 0;
    });
    if (challenge) return { status: "captcha", errors: [], url: location.href };
    // Greenhouse asks for the code it just emailed: said at once rather than
    // after the whole wait, so the code can go in while it's fresh (owner,
    // 2026-11-08: it took 10 to 15 seconds after the email to ask).
    const asksCode = /(verification|security|confirmation|one.?time|access) code|enter (the|your) code|code (was|has been|we) sent/i.test(document.body.innerText);
    if (asksCode && [...document.querySelectorAll("input")].some((field) => shown(field) && !field.value
      && (field.maxLength === 1 || /code|otp|security|verif|one-time/i.test([field.name, field.id, field.getAttribute("aria-label"), field.getAttribute("autocomplete")].join(" "))))) {
      return { status: "code", errors: [], url: location.href };
    }
    const invalid = [...document.querySelectorAll("[aria-invalid='true']")].filter(shown);
    if (invalid.length > 0 && attempt >= 2) {
      const errors = invalid.map((field) =>
        text(document.querySelector(`label[for="${CSS.escape(field.id)}"]`)) || field.getAttribute("aria-label") || field.id);
      return { status: "invalid", errors, url: location.href };
    }
  }
  return { status: "unknown", errors: [], url: location.href };
}

/** Bodies for the native browser's run(), which returns their JSON. */
export function fillScript(request: FillRequest): string {
  return `return JSON.stringify(await (${fillForm.toString()})(${JSON.stringify(request)}));`;
}

export function submitScript(): string {
  return `return JSON.stringify(await (${submitForm.toString()})());`;
}
