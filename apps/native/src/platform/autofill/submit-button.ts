/**
 * The board's own Submit, as an expression evaluated in the page. Only what
 * can be seen counts: Lever keeps a hidden submit button for its captcha to
 * press, and its real one is a plain button. "Apply with LinkedIn" must not
 * win, so "submit" is looked for before "apply".
 */
export const SUBMIT_BUTTON = `(() => {
  const scope = document.querySelector("form") || document;
  const shown = [...scope.querySelectorAll("button, [role=button], input[type=submit], input[type=button]")]
    .filter((b) => b.getClientRects().length > 0);
  const words = (b) => (b.textContent || b.value || "").trim();
  return shown.find((b) => b.type === "submit" && /submit|apply/i.test(words(b)))
    || shown.find((b) => /submit/i.test(words(b)))
    || shown.find((b) => b.type === "submit")
    || shown.find((b) => /apply/i.test(words(b)));
})()`;
