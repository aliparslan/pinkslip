import { expect, test, type Page } from "@playwright/test";
import { FILL_FORM_FUNCTION, READ_FORM_BODY, SUBMIT_FORM_BODY } from "../src/platform/autofill/scripts.generated";

/** A Greenhouse-style form: labelled inputs, a required marker, a select,
 * radios, a consent checkbox, a resume upload and a submit button. */
const FORM = `<!doctype html><html><body>
<form id="application" onsubmit="event.preventDefault(); document.body.innerHTML = '<h1>Thank you for applying</h1>'; history.pushState({}, '', '/confirmation');">
  <label for="first">First Name *</label><input id="first" name="first_name" required>
  <label for="email">Email *</label><input id="email" name="email" type="email" required>
  <label for="phone">Phone</label><input id="phone" name="phone" type="tel">
  <label for="auth">Are you legally authorized to work in the United States? *</label>
  <select id="auth" name="auth" required><option value="">Select...</option><option>Yes</option><option>No</option></select>
  <fieldset><legend>Will you require sponsorship? *</legend>
    <label><input type="radio" name="sponsor" value="yes" required> Yes</label>
    <label><input type="radio" name="sponsor" value="no"> No</label>
  </fieldset>
  <label for="why">Why do you want to work here?</label><textarea id="why" name="why"></textarea>
  <label><input type="checkbox" id="consent" required> I agree to the privacy policy</label>
  <label for="resume">Resume/CV *</label><input id="resume" type="file" accept=".pdf" required>
  <button type="submit">Submit application</button>
</form></body></html>`;

/** Ashby's markup, from Plaid's form: required marked by a class and drawn
 * with CSS, a location search whose label names an id nothing has, and
 * checkbox and radio groups whose question is a <label> in the fieldset,
 * under a section heading. */
const ASHBY = `<!doctype html><html><head><style>._required_x::after { content: "*"; }</style></head><body>
<div class="banner"><p>This job has application limits</p></div>
<div data-field-path="name"><label class="_heading _required_x" for="name">Name</label><input id="name" name="name" type="text" value=""></div>
<div data-field-path="employed"><label class="_heading _required_x" for="employed">Have you ever been previously employed by Plaid?</label>
  <div class="yesno"><button aria-pressed="false" data-option="yes">Yes</button><button aria-pressed="false" data-option="no">No</button><input type="checkbox" tabindex="-1" name="employed"></div></div>
<div data-field-path="_systemfield_location"><label class="_heading _required_x" for="_systemfield_location">Location</label>
  <div><input placeholder="Start typing..." aria-autocomplete="list" role="combobox" value=""><button></button></div></div>
<div class="section"><h2>AI &amp; Interest in Working at Plaid</h2>
  <div data-field-path="why"><fieldset><label class="_heading _required_x" for="why">Why are you interested in working at Plaid? Select all that apply.</label>
    <div><span><input type="checkbox" id="why-option" name="Plaid's Mission"></span><label for="why-option">Plaid's Mission</label></div>
    <div><span><input type="checkbox" id="why-option" name="Company Culture"></span><label for="why-option">Company Culture</label></div>
  </fieldset></div>
  <div data-field-path="rate"><fieldset><label class="_heading _required_x" for="rate">How would you rate Plaid's position in AI?</label>
    <div><input type="radio" id="rate-option" name="rate"><label for="rate-option">1 - Slightly below average</label></div>
    <div><input type="radio" id="rate-option" name="rate"><label for="rate-option">2 - About average</label></div>
  </fieldset></div>
  <div data-field-path="github"><label class="_heading" for="github">GitHub</label><input id="github" name="github" type="url" value=""></div>
</div>
</body></html>`;

interface Control { ref: string; kind: string; label: string; required: boolean; options: string[]; value: string | string[] | null }

const read = async (page: Page) => JSON.parse(await page.evaluate(`(async () => { ${READ_FORM_BODY} })()`)) as { submitted: boolean; controls: Control[] };
const fill = (page: Page, request: unknown) => page.evaluate(`(async () => JSON.stringify(await (${FILL_FORM_FUNCTION})(${JSON.stringify(request)})))()`)
  .then((value) => JSON.parse(value as string) as { outcomes: Record<string, string> });

test("reads the form as a person sees it", async ({ page }) => {
  await page.route("https://boards.example.com/**", (route) => route.fulfill({ contentType: "text/html", body: FORM }));
  await page.goto("https://boards.example.com/jobs/1");
  const { submitted, controls } = await read(page);
  expect(submitted).toBe(false);
  const byLabel = Object.fromEntries(controls.map((control) => [control.label, control]));
  expect(byLabel["First Name"]).toMatchObject({ kind: "text", required: true, value: null });
  expect(byLabel["Email"]?.kind).toBe("email");
  expect(byLabel["Are you legally authorized to work in the United States?"]).toMatchObject({ kind: "select", options: ["Yes", "No"] });
  expect(byLabel["Will you require sponsorship?"]).toMatchObject({ kind: "radio", options: ["Yes", "No"] });
  expect(byLabel["Resume/CV"]?.kind).toBe("file");
});

test("fills each kind of field, attaches the resume, and submits", async ({ page }) => {
  await page.route("https://boards.example.com/**", (route) => route.fulfill({ contentType: "text/html", body: FORM }));
  await page.goto("https://boards.example.com/jobs/1");
  const { controls } = await read(page);
  const ref = (label: string) => controls.find((control) => control.label === label)!;
  const steps = [
    { ...ref("First Name"), value: "Avery" },
    { ...ref("Email"), value: "avery@example.com" },
    { ...ref("Are you legally authorized to work in the United States?"), value: "Yes" },
    { ...ref("Will you require sponsorship?"), value: "No" },
    { ...ref("Why do you want to work here?"), value: "I like the product." },
    { ...ref("I agree to the privacy policy"), value: "yes" },
  ].map(({ ref: stepRef, kind, value }) => ({ ref: stepRef, kind, value }));
  for (const step of steps) {
    const report = await fill(page, { steps: [step], resume: null });
    expect(report.outcomes[step.ref], step.ref).toBe("filled");
  }
  const resume = ref("Resume/CV");
  const upload = await fill(page, { steps: [{ ref: resume.ref, kind: "file", value: "resume" }], resume: { name: "resume.pdf", base64: Buffer.from("%PDF-1.4 test").toString("base64") } });
  expect(upload.outcomes[resume.ref]).toBe("filled");

  await expect(page.locator("#first")).toHaveValue("Avery");
  await expect(page.locator("#auth")).toHaveValue("Yes");
  await expect(page.locator("input[name=sponsor][value=no]")).toBeChecked();
  await expect(page.locator("#consent")).toBeChecked();
  expect(await page.locator("#resume").evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe("resume.pdf");

  const after = await read(page);
  expect(after.controls.filter((control) => control.required && (control.value === null || control.value.length === 0)).map((control) => control.label)).toEqual([]);
  const submit = JSON.parse(await page.evaluate(`(async () => { ${SUBMIT_FORM_BODY} })()`) as string) as { status: string };
  expect(submit.status).toBe("submitted");
  expect((await read(page)).submitted).toBe(true);
});

test("reads Ashby's questions, required marks and location search", async ({ page }) => {
  await page.route("https://jobs.example.com/**", (route) => route.fulfill({ contentType: "text/html", body: ASHBY }));
  await page.goto("https://jobs.example.com/plaid/1/application");
  const { controls } = await read(page);
  const summary = controls.map((control) => [control.kind, control.label, control.required]);
  expect(summary).toEqual([
    ["buttons", "Have you ever been previously employed by Plaid?", true],
    ["text", "Name", true],
    ["combobox", "Location", true],
    ["url", "GitHub", false],
    ["radio", "How would you rate Plaid's position in AI?", true],
    ["checkboxes", "Why are you interested in working at Plaid? Select all that apply.", true],
  ]);
});
