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

export function readForm(): FormControl[] {
  const clean = (text: string | null | undefined) =>
    (text ?? "").replace(/\s+/g, " ").replace(/\s*[*✱]\s*$/, "").trim();
  const starred = (text: string | null | undefined) => /[*✱]\s*$/.test((text ?? "").trim());
  /** What a person reads: visible text only, without the buttons inside it. */
  const readable = (element: Element | null | undefined): string => {
    if (!element) return "";
    let text = (element as HTMLElement).innerText ?? element.textContent ?? "";
    for (const button of element.querySelectorAll("button, [role='button']")) {
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
    const fromIds = (ids: string | null) => (ids ?? "").split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    const candidates: Array<string | null | undefined> = [
      fromIds(element.getAttribute("aria-labelledby")),
      element.id ? readable(document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) : null,
      readable(element.closest("label")),
      element.getAttribute("aria-label"),
      readable(element.closest("fieldset")?.querySelector("legend")),
    ];
    // "Attach" or "Upload file" names the button, not the question.
    const meaningful = (text: string) =>
      text !== "" && !/^(attach|upload( a)?( file)?|browse|choose( a)? file|select( a)? file|enter manually|dropbox|google drive|paste)$/i.test(text);
    /** A label that names a different input is that input's question, not this one's. */
    const belongsElsewhere = (candidate: Element) =>
      candidate instanceof HTMLLabelElement && candidate.htmlFor !== "" && candidate.htmlFor !== element.id;
    for (const candidate of candidates) {
      if (meaningful(clean(candidate))) return { text: clean(candidate), starred: starred(candidate) };
    }
    // Fall back to the nearest label-like text above the control.
    let node: Element | null = element;
    for (let depth = 0; depth < 5 && node; depth += 1) {
      node = node.parentElement;
      const headings = [...(node?.querySelectorAll("label, legend, [class*='label' i], h3, h4") ?? [])];
      const heading = headings.find((candidate) =>
        !candidate.contains(element) && !belongsElsewhere(candidate) && meaningful(clean(readable(candidate))));
      if (heading) return { text: clean(readable(heading)), starred: starred(readable(heading)) };
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
    clean(readable(input.labels?.[0] ?? input.closest("label")) || input.value);

  /** The smallest element holding every option of one question. */
  const commonAncestor = (elements: Element[]): Element => {
    let node: Element | null = elements[0].parentElement;
    while (node && !elements.every((element) => node!.contains(element))) node = node.parentElement;
    return node ?? document.body;
  };

  /** A group's question: its legend, else the nearest text before the group
   * that isn't one of its options. */
  const groupLabel = (holder: Element): { text: string; starred: boolean } => {
    const legend = holder.matches("fieldset") ? holder.querySelector("legend") : null;
    if (legend && clean(readable(legend))) return { text: clean(readable(legend)), starred: starred(readable(legend)) };
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

  for (const element of scope.querySelectorAll("input, select, textarea")) {
    if (handled.has(element)) continue;
    const input = element as HTMLInputElement;
    const type = (input.type || "text").toLowerCase();
    if (type === "hidden" || type === "submit" || type === "button" || type === "image" || type === "reset") continue;
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
      controls.push({
        ref: stamp(input),
        kind: "file",
        label: label.text,
        required: isRequired(input, label),
        options: [],
        searchable: false,
        value: input.files && input.files.length > 0 ? input.files[0].name : null,
      });
      continue;
    }
    // Inputs a person can't see aren't questions, except a file input or a
    // combobox, which sites often hide behind their own button.
    if (!visible(input) || input.tabIndex < 0) continue;
    const label = labelFor(input);
    if (!label.text) continue;

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
    const label = groupLabel(holder);
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
        const own = readable(box.labels?.[0] ?? box.closest("label"));
        const label = { text: clean(own) || labelFor(box).text, starred: starred(own) };
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
    const label = groupLabel(holder);
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

/** Whether the page says an application just went through. Only a page with
 * nothing left to fill counts, since forms often open with a thank-you. */
export function submittedPage(): boolean {
  if (document.querySelector("input:not([type=hidden]), textarea, select")) return false;
  return /\/(confirmation|thanks|thank-you|success)\b/i.test(location.pathname)
    || /(thank you|thanks) for (applying|your application|submitting)|application (was |has been )?(submitted|received)|we('ve| have) received your application/i
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
}

/** A body for the native browser's run(), which returns a PageRead as JSON. */
export function formReaderScript(): string {
  return `const submitted = ${submittedPage.toString()};
await (${waitForForm.toString()})(submitted);
return JSON.stringify({ submitted: submitted(), controls: (${readForm.toString()})() });`;
}
