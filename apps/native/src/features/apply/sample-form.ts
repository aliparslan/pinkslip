import type { ApiClient } from "@pinkslip/core/api";
import type { FormControl } from "@pinkslip/domain/application-form";

/**
 * A Greenhouse-like application form for the kit (Paper "2 · The in-app
 * browser and fill bar"), so the in-app browser and its fill bar can be
 * tried in the simulator, which isn't signed in. The real loop and page
 * scripts run on it; only the plan, which the server would work out, is
 * answered here. Submit swaps in a thank-you page, as boards do.
 */
export const SAMPLE_FORM_URL = "https://job-boards.greenhouse.io/stripe/jobs/sample";

/** A live Greenhouse form for the kit (Stripe, Data Analyst, Intern): the
 * board's own page, filled with the sample answers and never submitted. */
export const LIVE_FORM_URL = "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8194291";

export const SAMPLE_FORM = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font: 15px -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 20px 16px 140px; background: #fff; }
  h1 { font: 22px Georgia, serif; margin: 0 0 18px; }
  label { display: block; font-size: 13px; color: #555; margin: 14px 0 6px; }
  input, select, textarea { box-sizing: border-box; width: 100%; font: 16px -apple-system, Helvetica, Arial, sans-serif; padding: 10px; border: 1px solid #ccc; border-radius: 6px; background: #fff; }
  textarea { height: 96px; }
  .row { display: flex; gap: 12px; } .row > div { flex: 1; }
  button { margin-top: 24px; width: 100%; padding: 14px; font: 600 16px -apple-system, Helvetica, Arial, sans-serif; color: #fff; background: #1f7a4d; border: 0; border-radius: 6px; }
</style></head><body>
<h1>Software Engineer, New Grad</h1>
<form id="application">
  <div class="row">
    <div><label for="first">First name *</label><input id="first" name="first_name" required></div>
    <div><label for="last">Last name *</label><input id="last" name="last_name" required></div>
  </div>
  <label for="email">Email *</label><input id="email" name="email" type="email" required>
  <label for="phone">Phone</label><input id="phone" name="phone" type="tel">
  <label for="sponsor">Will you now or in the future require sponsorship? *</label>
  <select id="sponsor" name="sponsorship" required><option value="">Select…</option><option>Yes</option><option>No</option></select>
  <label for="linkedin">LinkedIn</label><input id="linkedin" name="linkedin" type="url">
  <label for="why">Why Stripe? *</label><textarea id="why" name="why" required></textarea>
  <button type="submit">Submit application</button>
</form>
<script>
  document.getElementById("application").addEventListener("submit", (event) => {
    event.preventDefault();
    document.body.innerHTML = '<h1>Thank you for applying.</h1><p>Your application for Software Engineer, New Grad at Stripe has been received. Our team will review it and be in touch.</p>';
  });
</script>
</body></html>`;

/** What the sample knows about Jordan, by words in a field's label. Visa
 * sponsorship and essays (Why Stripe?) are left for the person. */
const ANSWERS: [RegExp, string][] = [
  // Dropdowns on the live Greenhouse form, as the real plan fills them.
  [/eligible to work/i, "Yes"],
  [/country where you currently reside/i, "United States"],
  [/first location preference/i, "San Francisco"],
  [/first name/i, "Jordan"],
  [/last name/i, "Lee"],
  [/email/i, "jordan@lee.dev"],
  [/phone/i, "(415) 555-0134"],
  [/linkedin/i, "https://www.linkedin.com/in/jordanlee"],
];

/** A one-page PDF for the kit's samples, so attaching a resume can be tried. */
export const SAMPLE_RESUME = { name: "Jordan_Lee.pdf", base64: "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNDQ+PnN0cmVhbQpCVCAvRjEgMTggVGYgNzIgNzIwIFRkIChKb3JkYW4gTGVlKSBUaiBFVAplbmRzdHJlYW0gZW5kb2JqCjUgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+CiUlRU9GCg==" };

/** The apply API, answered on the phone for the sample form. */
export const sampleApplyApi = {
  apply: {
    plan: async (_jobId: string | null, controls: FormControl[]) => ({
      steps: controls.flatMap((control) => {
        if (control.kind === "file" && /resume|\bcv\b/i.test(control.label)) return [{ ref: control.ref, kind: control.kind, value: "resume" }];
        const answer = ANSWERS.find(([pattern]) => pattern.test(control.label))?.[1];
        return answer ? [{ ref: control.ref, kind: control.kind, value: answer, ...(control.kind === "combobox" && control.searchable ? { pick: true } : {}) }] : [];
      }),
      needs: [],
      inferred: [],
      cost_usd: 0,
    }),
    report: async () => undefined,
    learn: async () => ({ saved: 0 }),
  },
} as unknown as Pick<ApiClient, "apply">;
