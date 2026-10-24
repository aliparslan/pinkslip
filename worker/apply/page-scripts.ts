/**
 * What the server browser runs inside an employer's page. Assisted apply's
 * reader, filler and submit come from the phone's build (Bun turns them into
 * source, which the Worker's bundler can't be trusted to do: it wraps nested
 * functions in helpers that don't exist in the page). The few the server
 * adds are written as source here. Each is an async function body that
 * returns a string.
 */
export { FILL_FORM_FUNCTION, READ_FORM_BODY, SUBMIT_FORM_BODY } from "../../apps/native/src/platform/autofill/scripts.generated";

/** Declines a cookie banner: the known consent tools' reject buttons, then
 * any "Reject all" inside something that looks like a banner. Never accepts
 * (phase 0, fix 5). Answers "declined" or "none". */
export const DECLINE_COOKIES_BODY = String.raw`
const shown = (el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed";
const text = (el) => (el.innerText || el.textContent || el.value || "").replace(/\s+/g, " ").trim();
const known = [
  "#onetrust-reject-all-handler",
  "#CybotCookiebotDialogBodyButtonDecline",
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
  "button.osano-cm-denyAll",
  ".cky-btn-reject",
  "[data-testid='uc-deny-all-button']",
  "#truste-consent-required",
  ".iubenda-cs-reject-btn",
];
for (const selector of known) {
  const el = document.querySelector(selector);
  if (el && shown(el)) { el.click(); return "declined"; }
}
const REJECT = /^(reject|decline|deny|refuse)( all)?( (cookies|optional|non-essential|additional|all cookies)( cookies)?)?$|^(only|use) (necessary|essential|required|strictly necessary)( cookies)?( only)?$|^(necessary|essential|required|strictly necessary) (cookies )?only$|^continue without accepting$/i;
const banner = (el) => el.closest("[id*=cookie i], [class*=cookie i], [id*=consent i], [class*=consent i], [aria-label*=cookie i], [aria-label*=consent i], [role=dialog], [role=alertdialog]");
const button = [...document.querySelectorAll("button, [role=button], a, input[type=button]")]
  .find((el) => shown(el) && REJECT.test(text(el)) && banner(el) && !el.closest("form [data-pinkslip-ref]"));
if (button) { button.click(); return "declined"; }
return "none";
`;

/** After Submit: is the page asking for a code it emailed? Greenhouse does
 * when its invisible captcha scores the browser low. Stamps each code box as
 * data-pinkslip-code="0", "1"… and answers { asks, boxes }. */
export const CODE_PROMPT_BODY = String.raw`
const shown = (el) => el.offsetParent !== null;
const words = document.body ? document.body.innerText : "";
const prompt = /(verification|security|confirmation|one.?time|access) code|enter (the|your) code|code (was|has been|we) sent|sent (you )?(a|an) (code|email)|check your (email|inbox)/i.test(words);
const about = (el) => [el.name, el.id, el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("autocomplete"), el.closest("label, fieldset, [class*=field i]")?.textContent]
  .filter(Boolean).join(" ");
const boxes = [...document.querySelectorAll("input")].filter((el) =>
  shown(el) && /^(text|tel|number|)$/i.test(el.type || "") && !el.value
  && (el.maxLength === 1 || /code|otp|security|verif|one-time/i.test(about(el))));
boxes.forEach((el, index) => el.setAttribute("data-pinkslip-code", String(index)));
return JSON.stringify({ asks: prompt && boxes.length > 0, boxes: boxes.length });
`;

/** Fills code boxes that typing left empty: one character per box, or the
 * whole code in a single field. Answers how many boxes hold a value. */
export function codeFallbackBody(code: string): string {
  return String.raw`
const code = ${JSON.stringify(code)};
const boxes = [...document.querySelectorAll("[data-pinkslip-code]")]
  .sort((a, b) => Number(a.getAttribute("data-pinkslip-code")) - Number(b.getAttribute("data-pinkslip-code")));
const set = (el, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
};
if (boxes.length === 1) { if (boxes[0].value !== code) set(boxes[0], code); }
else boxes.forEach((el, index) => { if (!el.value && code[index]) set(el, code[index]); });
return String(boxes.filter((el) => el.value).length);
`;
}

/** Closes whatever list or popover is open: some (Ashby's) hide the rest of
 * the form from the reader while they're open. */
export const CLOSE_POPOVERS_BODY = String.raw`
const active = document.activeElement;
if (active && active !== document.body) {
  active.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  active.blur();
}
return "closed";
`;

/** The options of a search box that only lists them once opened (Ashby's
 * "How did you hear about us?"): opens it empty, reads them, closes it. */
export function peekOptionsBody(ref: string): string {
  return String.raw`
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const input = document.querySelector('[data-pinkslip-ref="' + ${JSON.stringify(ref)} + '"]');
if (!input) return "[]";
Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "");
input.dispatchEvent(new Event("input", { bubbles: true }));
input.focus();
input.click();
const toggle = input.parentElement && input.parentElement.querySelector("button");
if (toggle) toggle.click();
else input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
await wait(700);
const options = [...document.querySelectorAll("[role=option]")]
  .filter((el) => el.offsetParent !== null)
  .map((el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim())
  .filter((text) => text && !/^no (results|options|matches)/i.test(text));
input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
input.blur();
return JSON.stringify([...new Set(options)].slice(0, 300));
`;
}

/** The form's own validation messages on screen ("School is required"),
 * as a list of strings. */
export const FORM_ERRORS_BODY = String.raw`
const shown = (el) => el.offsetParent !== null;
const VALIDATION = /required|missing|invalid|please (enter|select|fill|complete|provide|choose|upload|answer)|must (be|have|select|enter)|can'?t be blank|cannot be blank|is not valid|too (short|long)/i;
const texts = [...document.querySelectorAll("[role=alert], [aria-live=assertive], [class*='error' i], [class*='invalid' i]")]
  .filter((el) => shown(el) && !el.querySelector("input, select, textarea"))
  .map((el) => (el.innerText || "").replace(/\s+/g, " ").trim())
  .filter((text) => text && text.length < 300 && VALIDATION.test(text));
return JSON.stringify([...new Set(texts)].slice(0, 20));
`;

/** The page's visible text, for the confirmation kept as proof. */
export const PAGE_TEXT_BODY = String.raw`
return (document.body ? document.body.innerText : "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2000);
`;
