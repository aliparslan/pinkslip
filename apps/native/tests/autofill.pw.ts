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

/** Lever's markup: plain HTML where each question's <label> wraps its own
 * control, a link stands in for the upload button, each radio's label is
 * nested in the question's, and the disability form asks for a signature. */
const LEVER = `<!doctype html><html><head><meta charset="utf-8"></head><body><form id="application-form"><ul>
<li class="application-question resume"><label><div class="application-label">Resume/CV <span class="required">✱</span></div><div class="application-field"><a href="#" class="postings-btn template-btn-utility"><span class="filename"></span>ATTACH RESUME/CV</a><input type="file" name="resume" required></div></label></li>
<li class="application-question"><label><div class="application-label">Full name <span class="required">✱</span></div><div class="application-field"><input type="text" name="name" required></div></label></li>
</ul>
<div class="application-question"><label><div class="application-label">Gender</div><div class="application-field"><div class="application-dropdown"><select name="eeo[gender]"><option value="">Select ...</option><option value="Male">Male</option><option value="Female">Female</option></select></div></div><div class="note">About each option</div></label></div>
<div class="application-question"><label><div class="application-label multiple-choice">Race</div><div class="application-field"><ul data-qa="multiple-choice"><li><label><input type="radio" name="eeo[race]" value="Hispanic or Latino"><span class="eeo-option-text">Hispanic or Latino</span></label></li><li><label><input type="radio" name="eeo[race]" value="White"><span class="eeo-option-text">White</span></label></li></ul></div></label></div>
<div class="application-question"><label><div class="application-label">Name</div><div class="application-field"><input type="text" name="eeo[disabilitySignature]"></div></label></div>
</form></body></html>`;

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

test("reads Lever's questions without the options and buttons around them", async ({ page }) => {
  await page.route("https://jobs.lever.co/**", (route) => route.fulfill({ contentType: "text/html", body: LEVER }));
  await page.goto("https://jobs.lever.co/acme/1/apply");
  const { controls } = await read(page);
  const byLabel = Object.fromEntries(controls.map((control) => [control.label, control]));
  // No "Name": the disability form's signature stays the person's to give.
  expect(Object.keys(byLabel).sort()).toEqual(["Full name", "Gender", "Race", "Resume/CV"]);
  expect(byLabel["Resume/CV"]).toMatchObject({ kind: "file", required: true });
  expect(byLabel["Gender"]?.options).toEqual(["Male", "Female"]);
  expect(byLabel["Race"]?.options).toEqual(["Hispanic or Latino", "White"]);
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

test("knows Ashby's sent application, in its own words or the company's", async ({ page }) => {
  // Ashby swaps the form for its success box in place; the page's own
  // inputs (a search, a hidden form) can still be there.
  const sent = (words: string) => `<!doctype html><html><body><input type="search" placeholder="Search jobs">
<div class="ashby-application-form-success-container"><div role="status"><h2>Success</h2><p>${words}</p></div></div></body></html>`;
  await page.route("https://jobs.example.com/**", (route) => route.fulfill({ contentType: "text/html",
    body: route.request().url().includes("custom") ? sent("Thanks! The team reads every one.") : sent("Your application was successfully submitted. We'll contact you if there are next steps.") }));
  await page.goto("https://jobs.example.com/ramp/1/application");
  expect((await read(page)).submitted).toBe(true);
  await page.goto("https://jobs.example.com/custom/1/application");
  expect((await read(page)).submitted).toBe(true);
});

test("counts Ashby's resume chip as attached, though its input is empty again", async ({ page }) => {
  // Ashby takes the file, empties its input and shows the name with a delete button.
  const body = `<!doctype html><html><head><style>._required_x::after { content: "*"; }</style></head><body>
<div data-field-path="_systemfield_resume"><label class="_heading _required_x" for="_systemfield_resume">Resume</label>
  <div class="_fileUpload"><div class="_uploaded"><span>Ali_Arslan_Resume.pdf</span><button aria-label="Delete">×</button></div>
  <input id="_systemfield_resume" type="file" tabindex="-1"></div></div>
<div data-field-path="cover"><label class="_heading" for="cover">Cover letter</label>
  <div class="_fileUpload"><button>Upload File</button><span>(.pdf, .docx)</span><input id="cover" type="file" tabindex="-1"></div></div>
</body></html>`;
  await page.route("https://jobs.example.com/**", (route) => route.fulfill({ contentType: "text/html", body }));
  await page.goto("https://jobs.example.com/render/1/application");
  const { controls } = await read(page);
  const byLabel = Object.fromEntries(controls.map((control) => [control.label, control]));
  expect(byLabel["Resume"]).toMatchObject({ kind: "file", required: true, value: "Ali_Arslan_Resume.pdf" });
  expect(byLabel["Cover letter"]).toMatchObject({ kind: "file", value: null });
});

test("says when Submit brings up a box for an emailed code, without the whole wait", async ({ page }) => {
  const body = `<!doctype html><html><body><form onsubmit="event.preventDefault(); document.body.innerHTML = '<p>Enter the security code we sent to your email</p><input id=code name=security_code>';">
<label for="n">Name</label><input id="n" value="Ali"><button type="submit">Submit application</button></form></body></html>`;
  await page.route("https://boards.example.com/**", (route) => route.fulfill({ contentType: "text/html", body }));
  await page.goto("https://boards.example.com/jobs/2");
  const started = Date.now();
  const report = JSON.parse(await page.evaluate(`(async () => { ${SUBMIT_FORM_BODY} })()`) as string) as { status: string };
  expect(report.status).toBe("code");
  expect(Date.now() - started).toBeLessThan(3_000);
});
