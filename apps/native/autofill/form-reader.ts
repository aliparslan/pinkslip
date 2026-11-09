/**
 * Reads an application form the way a person sees it, on any site: each
 * question's text, its kind of control, its choices, whether it's required,
 * and what it holds now. Nothing here knows about a particular ATS.
 *
 * `readForm` runs inside the employer's page, so it must stay self-contained:
 * it is serialized with toString() and injected by the native browser.
 */

import type { FormControl, FormControlKind } from "@pinkslip/domain/application-form";

export type { FormControl, FormControlKind };

export function readForm(workdayPage = false): FormControl[] {
  const clean = (text: string | null | undefined) =>
    (text ?? "").replace(/\s+/g, " ").replace(/\s*[*✱]\s*$/, "").trim();
  const starred = (text: string | null | undefined) => /[*✱]\s*$/.test((text ?? "").trim());
  /** Some sites (Ashby) draw the asterisk with CSS from a "required" class. */
  const markedRequired = (element: Element | null | undefined) => {
    const marked = (node: Element) => [...node.classList].some((name) => /(^|[_-])required([_-]|$)/i.test(name) && !/not[_-]?required/i.test(name));
    return Boolean(element && (marked(element) || [...element.querySelectorAll("[class*='required' i]")].some(marked)));
  };
  /** A label's question and whether it's marked required. */
  const question = (element: Element | null | undefined) => {
    const text = readable(element);
    return { text: clean(text), starred: starred(text) || markedRequired(element) };
  };
  /** What a person reads: visible text only, without the buttons inside it. */
  const readable = (element: Element | null | undefined): string => {
    if (!element) return "";
    // A label wrapped around its dropdown would read out every option, and
    // Lever keeps long notes after it. The question comes before the control.
    const control = element.querySelector("select, textarea");
    if (control) {
      const before = document.createRange();
      before.setStart(element, 0);
      before.setEndBefore(control);
      if (before.toString().trim()) return before.toString();
    }
    let text = (element as HTMLElement).innerText ?? element.textContent ?? "";
    for (const button of element.querySelectorAll("button, [role='button'], a[class*='btn' i]")) {
      const inner = (button as HTMLElement).innerText;
      if (inner) text = text.replace(inner, " ");
    }
    return text;
  };

  const visible = (element: Element) => {
    const html = element as HTMLElement;
    if (html.closest("[hidden], [aria-hidden='true']")) return false;
    const style = getComputedStyle(html);
    return style.display !== "none" && style.visibility !== "hidden";
  };

  let counter = 0;
  const stamp = (element: Element) => {
    let ref = element.getAttribute("data-pinkslip-ref");
    if (!ref) {
      ref = `p${counter += 1}`;
      element.setAttribute("data-pinkslip-ref", ref);
    }
    return ref;
  };
  for (const element of document.querySelectorAll("[data-pinkslip-ref]")) {
    const number = Number(element.getAttribute("data-pinkslip-ref")?.slice(1));
    if (Number.isFinite(number)) counter = Math.max(counter, number);
  }

  /** The question a control answers, from the most explicit source available. */
  const labelFor = (element: Element): { text: string; starred: boolean } => {
    const labelledBy = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/)
      .map((id) => document.getElementById(id)).filter((node): node is HTMLElement => node !== null);
    const fromIds = labelledBy.map((node) => node.textContent ?? "").join(" ");
    const candidates: Array<{ text: string; starred: boolean }> = [
      { text: clean(fromIds), starred: starred(fromIds) || labelledBy.some(markedRequired) },
      element.id ? question(document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) : { text: "", starred: false },
      question(element.closest("label")),
      { text: clean(element.getAttribute("aria-label")), starred: starred(element.getAttribute("aria-label")) },
      question(element.closest("fieldset")?.querySelector("legend")),
    ];
    // "Attach" or "Upload file" names the button, not the question.
    const meaningful = (text: string) =>
      text !== "" && !/^(attach|upload( a)?( file)?|browse|choose( a)? file|select( a)? file|enter manually|dropbox|google drive|paste)$/i.test(text);
    /** A label that names a different input is that input's question, not
     * this one's. One naming an id nothing has (Ashby's location) still
     * belongs to the field it sits with. */
    const belongsElsewhere = (candidate: Element) => {
      if (!(candidate instanceof HTMLLabelElement) || candidate.htmlFor === "" || candidate.htmlFor === element.id) return false;
      const target = document.getElementById(candidate.htmlFor);
      return target !== null && target !== element && !target.contains(element);
    };
    for (const candidate of candidates) {
      if (meaningful(candidate.text)) return candidate;
    }
    // Fall back to the nearest label-like text above the control.
    let node: Element | null = element;
    for (let depth = 0; depth < 5 && node; depth += 1) {
      node = node.parentElement;
      const headings = [...(node?.querySelectorAll("label, legend, [class*='label' i], h3, h4") ?? [])];
      const heading = headings.find((candidate) =>
        !candidate.contains(element) && !belongsElsewhere(candidate) && meaningful(clean(readable(candidate))));
      if (heading) return question(heading);
    }
    return { text: clean(element.getAttribute("placeholder") ?? element.getAttribute("name")), starred: false };
  };

  const isRequired = (element: Element, label: { starred: boolean }) =>
    (element as HTMLInputElement).required === true
    || element.getAttribute("aria-required") === "true"
    || label.starred;

  /** React components keep their state on a fiber; react-select's holds its options. */
  const reactSelectOptions = (input: Element): string[] | null => {
    const key = Object.keys(input).find((name) => name.startsWith("__reactFiber"));
    let fiber = key ? (input as unknown as Record<string, { stateNode?: unknown; return?: unknown }>)[key] : null;
    while (fiber) {
      const instance = fiber.stateNode as {
        selectOption?: unknown;
        props?: { options?: unknown[]; getOptionLabel?: (option: unknown) => string };
      } | null;
      if (instance && typeof instance.selectOption === "function" && instance.props) {
        const label = instance.props.getOptionLabel ?? ((option: unknown) => String((option as { label?: unknown }).label ?? ""));
        return (instance.props.options ?? []).map((option) => clean(label(option)));
      }
      fiber = fiber.return as typeof fiber;
    }
    return null;
  };

  const optionText = (input: HTMLInputElement) =>
    // Its own label first: Lever nests each option's inside the question's.
    clean(readable(input.closest("label") ?? input.labels?.[0]) || input.value);

  /** The smallest element holding every option of one question. */
  const commonAncestor = (elements: Element[]): Element => {
    let node: Element | null = elements[0].parentElement;
    while (node && !elements.every((element) => node!.contains(element))) node = node.parentElement;
    return node ?? document.body;
  };

  /** A group's question: its legend, else the nearest text before the group
   * that isn't one of its options. */
  const groupLabel = (holder: Element, options: Element[]): { text: string; starred: boolean } => {
    const legend = holder.matches("fieldset") ? holder.querySelector("legend") : null;
    if (legend && clean(readable(legend))) return question(legend);
    // A label at the top of the group that isn't one of its options (Ashby
    // puts the question in a <label> inside the fieldset).
    const heading = [...holder.querySelectorAll("label")].find((label) =>
      !label.querySelector("input")
      && options.every((option) => label.htmlFor === "" || label.htmlFor !== option.id)
      && Boolean(label.compareDocumentPosition(options[0]) & Node.DOCUMENT_POSITION_FOLLOWING)
      && clean(readable(label)) !== "");
    if (heading) return question(heading);
    const labelled = holder.getAttribute("aria-labelledby");
    if (labelled) {
      const text = labelled.split(/\s+/).map((id) => readable(document.getElementById(id))).join(" ");
      if (clean(text)) return { text: clean(text), starred: starred(text) };
    }
    let node: Element | null = holder;
    for (let depth = 0; depth < 4 && node; depth += 1) {
      for (let sibling = node.previousElementSibling, hops = 0; sibling && hops < 3; sibling = sibling.previousElementSibling, hops += 1) {
        const text = readable(sibling);
        if (clean(text) && !sibling.querySelector("input, select, textarea")) return { text: clean(text), starred: starred(text) };
      }
      node = node.parentElement;
    }
    return labelFor(holder);
  };

  const controls: FormControl[] = [];
  const handled = new Set<Element>();
  const scope = document.querySelector("form") ?? document.body;
  // Workday's own controls. Elsewhere a listbox button is often a phone's
  // country picker, so these are read only here.
  const workday = workdayPage && /\.myworkdayjobs\.com$/.test(location.hostname);

  /** Workday speaks a dropdown's question, its answer and "Required" as one
   * aria-label, and only some have a label of their own. */
  const dropdownLabel = (button: HTMLElement, shown: string) => {
    const found = labelFor(button);
    const spoken = found.text.replace(/\s*\bRequired$/, "");
    const text = shown && spoken.endsWith(shown) ? spoken.slice(0, -shown.length).trim() : spoken;
    return {
      text: text || labelFor(button.parentElement ?? button).text,
      starred: found.starred || /\bRequired\s*$/.test(button.getAttribute("aria-label") ?? ""),
    };
  };

  // Yes/No style button groups (Ashby): two or more toggle buttons under one question.
  for (const group of scope.querySelectorAll("[data-field-path], fieldset, [role='group'], [role='radiogroup']")) {
    const buttons = [...group.querySelectorAll(":scope button[aria-pressed], :scope button[data-option]")]
      .filter((button) => !button.closest("[role='listbox']"));
    if (buttons.length < 2 || !visible(group)) continue;
    const first = buttons[0];
    if (handled.has(first)) continue;
    buttons.forEach((button) => handled.add(button));
    group.querySelectorAll("input[type=checkbox]").forEach((input) => handled.add(input));
    const label = labelFor(group.querySelector("label") ?? first);
    const pressed = buttons.find((button) => button.getAttribute("aria-pressed") === "true");
    controls.push({
      ref: stamp(group),
      kind: "buttons",
      label: label.text,
      required: label.starred || group.querySelector("[required]") !== null,
      options: buttons.map((button) => clean(button.textContent)),
      searchable: false,
      value: pressed ? clean(pressed.textContent) : null,
    });
  }

  const radiosByName = new Map<string, HTMLInputElement[]>();
  const checkboxes: HTMLInputElement[] = [];

  for (const element of scope.querySelectorAll("input, select, textarea, button[aria-haspopup='listbox']")) {
    if (handled.has(element)) continue;
    if (element instanceof HTMLButtonElement) {
      if (!workday || !visible(element)) continue;
      const shown = clean(element.textContent);
      const label = dropdownLabel(element, shown);
      if (!label.text) continue;
      controls.push({
        ref: stamp(element),
        kind: "select",
        label: label.text,
        required: isRequired(element, label),
        // Known once the dropdown has been opened (readDropdowns).
        options: JSON.parse(element.getAttribute("data-pinkslip-options") ?? "[]") as string[],
        searchable: false,
        value: /^(select one)?$/i.test(shown) ? null : shown,
      });
      continue;
    }
    const input = element as HTMLInputElement;
    const type = (input.type || "text").toLowerCase();
    if (type === "hidden" || type === "submit" || type === "button" || type === "image" || type === "reset") continue;
    // A password is the person's own: never read, so it can't reach a plan or
    // the answer bank (Workday puts a sign-in in front of every application).
    if (type === "password") continue;
    if (input.name === "g-recaptcha-response" || input.id.startsWith("g-recaptcha") || input.closest(".iti__dropdown-content")) continue;
    if (type === "radio") {
      const group = radiosByName.get(input.name) ?? [];
      group.push(input);
      radiosByName.set(input.name, group);
      continue;
    }
    if (type === "checkbox") {
      checkboxes.push(input);
      continue;
    }
    if (type === "file") {
      const label = labelFor(input);
      // Ashby (and Greenhouse) take the file, empty their input and show it
      // as a chip with its name and a delete button: the chip's file name
      // counts as filled (owner, 2026-11-08: Ashby always said "1 needs you",
      // ringing the resume's delete button).
      let shownFile: string | null = null;
      let around: Element | null = input.parentElement;
      for (let depth = 0; around && depth < 4 && !shownFile; depth += 1, around = around.parentElement) {
        if (around.querySelectorAll("input[type=file]").length > 1) break;
        const words = (around as HTMLElement).innerText ?? around.textContent ?? "";
        // A name, not a hint like "(.pdf, .docx)": it starts with a letter or digit.
        shownFile = words.match(/[A-Za-z0-9][^\s/\\(),]*\.(pdf|docx?|rtf|txt|pages|odt)\b/i)?.[0] ?? null;
      }
      controls.push({
        ref: stamp(input),
        kind: "file",
        label: label.text,
        required: isRequired(input, label),
        options: [],
        searchable: false,
        value: input.files && input.files.length > 0 ? input.files[0].name : shownFile,
      });
      continue;
    }
    // Inputs a person can't see aren't questions, except a file input or a
    // combobox, which sites often hide behind their own button.
    // Select2 hides a real dropdown the same way. Lever's school question is
    // one: skipped, the form read as complete and Submit failed in silence.
    const behindSearch = element instanceof HTMLSelectElement && element.classList.contains("select2-hidden-accessible");
    if (!behindSearch && (!visible(input) || input.tabIndex < 0)) continue;
    // Signing a government form is the person's to do (Lever's disability form).
    if (/signature/i.test(input.getAttribute("name") ?? "")) continue;
    const label = labelFor(input);
    if (!label.text) continue;
    // Workday's trap, "This input is for robots only": a person leaves it.
    if (/for robots only/i.test(label.text)) continue;

    // Every date box says Month or Year; its id says whose.
    const dateBox = workday ? input.id.match(/^([a-zA-Z]+)-\d+--([a-zA-Z]+)-dateSection(Month|Year|Day)/) : null;
    if (dateBox) {
      const words = (name: string) => name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
      const section = words(dateBox[1]);
      const date = words(dateBox[2]);
      const part = dateBox[3].toLowerCase();
      controls.push({
        ref: stamp(input),
        kind: "date",
        label: `${section[0].toUpperCase()}${section.slice(1)}: ${date}${date.includes(part) ? "" : ` ${part}`}`,
        required: isRequired(input, label),
        options: [],
        searchable: false,
        value: input.value ? input.value : null,
      });
      continue;
    }

    // A menu with levels. Its answer sits in a list beside the search box,
    // which stays empty.
    if (workday && input.getAttribute("data-uxi-widget-type") === "selectinput") {
      let chosen: string[] = [];
      let around: Element | null = input.parentElement;
      for (let depth = 0; around && depth < 8 && chosen.length === 0; depth += 1, around = around.parentElement) {
        if (around.querySelectorAll("[data-uxi-widget-type='selectinput']").length > 1) break;
        chosen = [...around.querySelectorAll("[data-automation-id='selectedItemList'] [role='option']")].map((item) => clean(item.textContent));
      }
      controls.push({
        ref: stamp(input),
        kind: "combobox",
        label: label.text,
        required: isRequired(input, label),
        options: [],
        searchable: true,
        value: chosen.length > 1 ? chosen : chosen[0] ?? null,
      });
      continue;
    }

    if (element instanceof HTMLSelectElement) {
      const options = [...element.options].filter((option) => option.value !== "").map((option) => clean(option.textContent));
      controls.push({
        ref: stamp(element),
        kind: "select",
        label: label.text,
        required: isRequired(element, label),
        options,
        searchable: false,
        value: element.value ? clean(element.selectedOptions[0]?.textContent) : null,
      });
      continue;
    }

    if (input.getAttribute("role") === "combobox") {
      const options = reactSelectOptions(input);
      // Start above the input: its own class ("select__input") would match.
      const container = input.parentElement?.closest("[class*='control'], [data-field-path]") ?? input.parentElement;
      const chosen = [...(container?.querySelectorAll("[class*='single-value'], [class*='multi-value__label']") ?? [])]
        .map((node) => clean(node.textContent));
      controls.push({
        ref: stamp(input),
        kind: "combobox",
        label: label.text,
        required: isRequired(input, label),
        options: options ?? [],
        searchable: !options || options.length === 0,
        value: chosen.length > 1 ? chosen : chosen[0] ?? (input.value ? clean(input.value) : null),
      });
      continue;
    }

    const kind: FormControlKind = element instanceof HTMLTextAreaElement
      ? "textarea"
      : (["email", "tel", "url", "number", "date"] as const).find((candidate) => candidate === type) ?? "text";
    controls.push({
      ref: stamp(input),
      kind,
      label: label.text,
      required: isRequired(input, label),
      options: [],
      searchable: false,
      value: input.value ? input.value : null,
    });
  }

  for (const group of radiosByName.values()) {
    if (!group.some((input) => visible(input) || input.labels?.[0])) continue;
    const holder = group.length > 1 ? commonAncestor(group) : (group[0].closest("fieldset, [role='radiogroup']") ?? group[0]);
    const label = groupLabel(holder, group);
    const checked = group.find((input) => input.checked);
    controls.push({
      ref: stamp(holder),
      kind: "radio",
      label: label.text,
      required: group.some((input) => input.required) || label.starred,
      options: group.map(optionText),
      searchable: false,
      value: checked ? optionText(checked) : null,
    });
  }

  // Checkboxes sharing a name, or a fieldset, are one multi-choice question; a
  // lone checkbox is its own yes/no question, usually a consent.
  const checkboxGroups = new Map<string | Element, HTMLInputElement[]>();
  for (const box of checkboxes) {
    if (!visible(box) && !box.labels?.[0] && !box.closest("label")) continue;
    const key = box.closest("fieldset, [data-field-path]") ?? (box.name || box);
    const group = checkboxGroups.get(key) ?? [];
    group.push(box);
    checkboxGroups.set(key, group);
  }
  for (const group of checkboxGroups.values()) {
    if (group.length === 1) {
      for (const box of group) {
        const ownLabel = box.closest("label") ?? box.labels?.[0];
        const own = question(ownLabel);
        const label = { text: own.text || labelFor(box).text, starred: own.starred };
        controls.push({
          ref: stamp(box),
          kind: "checkbox",
          label: label.text,
          required: box.required || label.starred,
          options: [],
          searchable: false,
          value: box.checked ? "checked" : null,
        });
      }
      continue;
    }
    const holder = commonAncestor(group);
    const label = groupLabel(holder, group);
    const chosen = group.filter((box) => box.checked).map(optionText);
    controls.push({
      ref: stamp(holder),
      kind: "checkboxes",
      label: label.text,
      required: group.some((box) => box.required) || label.starred,
      options: group.map(optionText),
      searchable: false,
      value: chosen.length > 0 ? chosen : null,
    });
  }

  return controls;
}

/** Opens each of Workday's unanswered dropdowns once, since a list exists
 * only while it's open, and leaves its options on the button for readForm.
 * For the start of a fill only: it moves focus and shows each list briefly. */
export async function readDropdowns(): Promise<void> {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  for (const element of document.querySelectorAll("button[aria-haspopup='listbox'][data-pinkslip-ref]:not([data-pinkslip-options])")) {
    const button = element as HTMLElement;
    if (!/^(select one)?$/i.test((button.textContent ?? "").trim())) continue;
    button.click();
    let list: HTMLElement | null = null;
    for (let attempt = 0; attempt < 40 && !list; attempt += 1) {
      await wait(50);
      const opened = document.getElementById(button.getAttribute("aria-controls") ?? "");
      if (opened?.querySelector("[role='option']")) list = opened;
    }
    if (!list) continue;
    // "Select One" has no value of its own.
    const options = [...list.querySelectorAll("[role='option']")]
      .filter((option) => option.getAttribute("data-value") !== "")
      .map((option) => (option.textContent ?? "").replace(/\s+/g, " ").trim());
    button.setAttribute("data-pinkslip-options", JSON.stringify(options));
    (document.activeElement ?? list).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
    for (let attempt = 0; attempt < 10 && list.isConnected; attempt += 1) await wait(50);
  }
}

/** Which page of a multi-page application is showing. Workday changes page
 * without navigating, so this is the only sign. */
export function formStep(): string | null {
  return document.querySelector("[data-automation-id='progressBarActiveStep']")?.textContent?.trim() || null;
}

/** Whether the page says an application just went through. Only a page with
 * nothing left to fill counts, since forms often open with a thank-you. */
export function submittedPage(): boolean {
  // Ashby swaps its form for this box in place, with the company's own
  // words or "Your application was successfully submitted" (owner,
  // 2026-11-04: Ashby never registered as applied, Greenhouse did).
  if (document.querySelector(".ashby-application-form-success-container")) return true;
  if (document.querySelector("input:not([type=hidden]), textarea, select")) return false;
  return /\/(confirmation|thanks|thank-you|success)\b/i.test(location.pathname)
    || /(thank you|thanks) for (applying|your application|submitting)|application (was |has been )?(successfully )?(submitted|received)|we('ve| have) received your application/i
      .test(document.body?.innerText ?? "");
}

/** Waits until the form is interactive. Server-rendered forms (Greenhouse)
 * show inputs before React attaches, and anything filled before then is wiped;
 * plain HTML forms (Lever) never attach, so they go ahead after two seconds.
 * A confirmation, or a loaded page that shows no form for three seconds,
 * isn't waited on. */
export async function waitForForm(submitted: () => boolean): Promise<void> {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const input = document.querySelector("input:not([type=hidden]), textarea, select");
    const hydrated = input !== null && Object.keys(input).some((key) => key.startsWith("__reactFiber"));
    if (hydrated || (input !== null && attempt >= 8)) break;
    if (input === null && (submitted() || (attempt >= 12 && document.readyState === "complete"))) return;
    await wait(250);
  }
  await wait(300);
}

export interface PageRead {
  /** The page confirms an application went through. */
  submitted: boolean;
  controls: FormControl[];
  step: string | null;
}

/** A body for the native browser's run(), which returns a PageRead as JSON. */
export function formReaderScript(): string {
  return `const submitted = ${submittedPage.toString()};
await (${waitForForm.toString()})(submitted);
return JSON.stringify({ submitted: submitted(), controls: (${readForm.toString()})(), step: null });`;
}
