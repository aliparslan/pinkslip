import type { PreparedApplication } from "@pinkslip/core/api";

export interface AutofillField {
  id: string;
  type: string;
  answer: string | string[];
}

export interface AutofillPayload {
  ats: "greenhouse" | "ashby";
  fields: AutofillField[];
  resume: { name: string; base64: string } | null;
}

export interface AutofillReport {
  filled: number;
  total: number;
  missed: string[];
}

export function autofillPayload(
  prepared: PreparedApplication,
  resume: AutofillPayload["resume"],
): AutofillPayload | null {
  if (!prepared.supported || !prepared.ats) return null;
  const fields = prepared.fields.flatMap((field): AutofillField[] => {
    if (field.type === "file") {
      return field.key === "resume" && resume ? [{ id: field.id, type: "file", answer: resume.name }] : [];
    }
    return field.answer === null ? [] : [{ id: field.id, type: field.type, answer: field.answer }];
  });
  return { ats: prepared.ats, fields, resume };
}

/**
 * Runs inside the employer's application page. It must stay self-contained,
 * because it is serialized with toString() and injected by the native browser:
 * no imports and no references to anything outside this function.
 *
 * It only fills fields that are still empty, so "Fill again" picks up fields
 * that rendered late without undoing the user's own edits. It never submits.
 */
async function fillApplication(payload: AutofillPayload): Promise<AutofillReport> {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const norm = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
  const answers = (field: AutofillField) => (Array.isArray(field.answer) ? field.answer : [field.answer]);

  // React tracks the native value setter, so set through it and announce the
  // change. Autocompletes must not blur: they clear unconfirmed text on blur.
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

  const container = (id: string): Element | null => {
    if (payload.ats === "ashby") return document.querySelector(`[data-field-path="${CSS.escape(id)}"]`);
    return document.getElementById(id)?.closest(".select__container, .field-wrapper, div") ?? null;
  };

  // Greenhouse renders its location question as "candidate-location".
  const domId = (id: string) =>
    payload.ats === "greenhouse" && id === "location" && !document.getElementById(id) ? "candidate-location" : id;

  const textInput = (id: string): HTMLInputElement | HTMLTextAreaElement | null => {
    const direct = document.getElementById(domId(id));
    if (direct instanceof HTMLInputElement || direct instanceof HTMLTextAreaElement) return direct;
    return container(id)?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      "input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), textarea",
    ) ?? null;
  };

  // react-select (Greenhouse) only opens for a focused, visible page, so select
  // through the component itself: the same call a tap ends in.
  const reactSelect = (input: Element) => {
    const fiberKey = Object.keys(input).find((key) => key.startsWith("__reactFiber"));
    let fiber = fiberKey ? (input as unknown as Record<string, { stateNode?: unknown; return?: unknown }>)[fiberKey] : null;
    while (fiber) {
      const instance = fiber.stateNode as {
        selectOption?: (option: unknown) => void;
        props?: { options?: unknown[]; getOptionLabel?: (option: unknown) => string; value?: unknown };
      } | null;
      if (instance && typeof instance.selectOption === "function" && instance.props) return instance;
      fiber = fiber.return as typeof fiber;
    }
    return null;
  };

  const pickFromListbox = async (input: HTMLInputElement, typed: string, wanted: string | null) => {
    setValue(input, typed, false);
    // Suggestions arrive asynchronously; only take one that matches what was typed.
    const firstWord = norm(typed.split(",")[0] ?? "");
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await wait(200);
      const options = [...document.querySelectorAll('[role="option"]')]
        .filter((option) => !option.id.startsWith("iti-"));
      const match = wanted
        ? options.find((option) => norm(option.textContent ?? "") === norm(wanted))
        : options.find((option) => norm(option.textContent ?? "").includes(firstWord));
      if (match) {
        press(match);
        return true;
      }
    }
    return false;
  };

  // A react-select that loads its options as you type (Greenhouse location).
  const pickFromReactSelect = async (input: HTMLInputElement, typed: string) => {
    const select = reactSelect(input);
    if (!select?.selectOption) return false;
    if (input.closest(".select__control")?.querySelector(".select__single-value")) return true;
    setValue(input, typed, false);
    const firstWord = norm(typed.split(",")[0] ?? "");
    const label = (option: unknown) =>
      norm(select.props?.getOptionLabel?.(option) ?? String((option as { label?: unknown }).label ?? ""));
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await wait(250);
      const match = (reactSelect(input)?.props?.options ?? []).find((option) => label(option).includes(firstWord));
      if (match) {
        select.selectOption(match);
        return true;
      }
    }
    return false;
  };

  const fillChoice = async (field: AutofillField): Promise<boolean> => {
    const wanted = answers(field).map(norm);
    if (payload.ats === "greenhouse") {
      const input = document.getElementById(field.id);
      const select = input ? reactSelect(input) : null;
      if (!select?.props?.options) return false;
      const label = (option: unknown) =>
        norm(select.props?.getOptionLabel?.(option) ?? String((option as { label?: unknown }).label ?? ""));
      // Read what's chosen from the page: selecting a chosen multi-select
      // option again would remove it.
      const chosen = [...(input?.closest(".select__control")?.querySelectorAll(".select__single-value, .select__multi-value__label") ?? [])]
        .map((element) => norm(element.textContent ?? ""));
      if (field.type !== "multiselect" && chosen.length > 0) return true;
      let any = chosen.length > 0;
      for (const target of wanted) {
        if (chosen.includes(target)) continue;
        const option = select.props.options.find((candidate) => label(candidate) === target);
        if (option) {
          select.selectOption?.(option);
          any = true;
          await wait(50);
        }
      }
      return any;
    }

    const box = container(field.id);
    if (!box) return false;
    if (field.type === "boolean") {
      const choice = wanted[0] === "yes" ? "yes" : wanted[0] === "no" ? "no" : null;
      const button = choice ? box.querySelector(`button[data-option="${choice}"]`) : null;
      if (!button) return false;
      if (button.getAttribute("aria-pressed") !== "true") press(button);
      return true;
    }
    const inputs = [...box.querySelectorAll<HTMLInputElement>("input[type=radio], input[type=checkbox]")];
    if (inputs.length > 0) {
      let any = false;
      for (const input of inputs) {
        const text = norm(input.labels?.[0]?.textContent ?? input.name ?? "");
        if (wanted.includes(text)) {
          if (!input.checked) input.click();
          any = true;
        }
      }
      return any;
    }
    const combo = box.querySelector<HTMLInputElement>('input[role="combobox"]');
    return combo && !combo.value ? pickFromListbox(combo, answers(field)[0], answers(field)[0]) : Boolean(combo?.value);
  };

  const fillFile = (field: AutofillField): boolean => {
    if (!payload.resume) return false;
    const input = (document.getElementById(field.id) as HTMLInputElement | null)
      ?? container(field.id)?.querySelector<HTMLInputElement>("input[type=file]")
      ?? null;
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return false;
    if (input.files && input.files.length > 0) return true;
    const bytes = Uint8Array.from(atob(payload.resume.base64), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], payload.resume.name, { type: "application/pdf" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const fillField = async (field: AutofillField): Promise<boolean> => {
    if (field.type === "file") return fillFile(field);
    if (field.type === "select" || field.type === "multiselect" || field.type === "boolean") return fillChoice(field);
    const input = textInput(field.id);
    if (!input) return false;
    const value = answers(field).join(", ");
    if (field.type === "location" && input instanceof HTMLInputElement && input.getAttribute("role") === "combobox") {
      if (reactSelect(input)) return pickFromReactSelect(input, value);
      if (input.value.trim()) return true;
      return pickFromListbox(input, value, null);
    }
    if (input.value.trim()) return true;
    setValue(input, value);
    return true;
  };

  // Wait until React owns the form. Greenhouse sends the inputs as plain HTML
  // first; anything typed before React attaches is wiped when it does, and its
  // dropdowns can't be selected yet. Non-React forms go ahead after 10 seconds.
  const hydrated = (element: Element | null) =>
    Boolean(element && Object.keys(element).some((key) => key.startsWith("__reactFiber")));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const elements = payload.fields.map((field) => document.getElementById(domId(field.id)) ?? container(field.id));
    if (elements.some(hydrated)) break;
    await wait(250);
  }
  await wait(300);

  const report: AutofillReport = { filled: 0, total: payload.fields.length, missed: [] };
  for (const field of payload.fields) {
    try {
      if (await fillField(field)) report.filled += 1;
      else report.missed.push(field.id);
    } catch {
      report.missed.push(field.id);
    }
  }
  const bridge = (window as unknown as {
    webkit?: { messageHandlers?: { pinkslipAutofill?: { postMessage: (message: unknown) => void } } };
  }).webkit?.messageHandlers?.pinkslipAutofill;
  bridge?.postMessage(report);
  return report;
}

/** The script the native browser injects into the application page. */
export function autofillScript(payload: AutofillPayload): string {
  return `(${fillApplication.toString()})(${JSON.stringify(payload)});`;
}
