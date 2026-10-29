# Handoff: what the send screens and the Plan page sit on (2026-10-24)

For the design session taking the next Paper round. It's what the backend now does and decides, which earlier rounds didn't have. It isn't a design: scope still gets talked through with the owner before drawing (Paper first).

Background, if you want more: [auto-apply phase 1 and B](auto-apply-phase1-2026-10-24.md), [phase 0](auto-apply-phase0-2026-10-24.md), the [backend inventory](backend-inventory-2026-10-16.md) (Decisions: Auto-apply, Plans and billing), [App Store setup](app-store-subscriptions-setup.md), and the earlier [apply-flow scope](apply-flow-scope-2026-10-14.md).

## 1. Auto-apply's sends (live, admins only)

**A send** is one job. Pinkslip's own browser, running on Cloudflare, opens the employer's form, uploads the resume, fills it, and presses Submit, with the phone closed.
- **Which forms:** Greenhouse and Ashby today, Lever later.
- **What stays on the phone:** Workday and company-run sites (Google, Apple and the like) stay assisted, in the app's own browser (Decisions: Auto-apply #1, #8).
- **Who sees it:** `features.auto_apply_send_enabled` is true for admins only (`AUTO_APPLY_SEND = "admin"`). Assisted apply (`features.auto_apply_enabled`) is on for every signed-in person.
- **The first real one:** it went to Reddit on 2026-10-24, and Reddit's confirmation email arrived. The owner wants no more real sends unless asked for a specific job, so test with dry runs.

### What a send can be (`ApplySend.status`), and what the person can do

| Status | Means | The person |
| --- | --- | --- |
| `queued`, `running`, `submitting` | Going. Usually under a minute | Waits; the hooks poll every 3 seconds |
| `code_needed` | Greenhouse emailed a code (its invisible captcha scored the browser low). The browser waits up to 9 minutes | Enters the code. Email forwarding may bring it first |
| `submitted` | Sent. The confirmation page's picture, text and address are kept | Sees proof. Tracker already shows Applied, from auto-apply |
| `unconfirmed` | Submit was pressed but no confirmation showed. It counts and is never retried | Checks their email |
| `ready` | A dry run that would have sent | Sends it for real, or not |
| `needs_you` | Stopped before Submit: required questions without a confident answer, or the form's own error | Answers them, then it sends again |
| `blocked` | A captcha on Submit. Never solved for them | Finishes it in assisted apply on the phone |
| `gone` | The posting closed, or there's no form | Nothing |
| `failed` | Something broke before anything was sent; the send is given back | Tries again |

### What each send carries (`shared/auto-apply.ts`)

- `company`, `title`, `ats`, `url`, `dry_run`, `detail` (one plain sentence on why it stopped), `created_at`, `finished_at`.
- `needs: SendNeed[]`: `{ ref, label, kind, options, required }`.
  - `kind` is the control: text, textarea, select, combobox, radio, checkbox, checkboxes, buttons, or `"error"` for the form's own message.
  - An error has no `ref` and can't be answered.
  - Options can be long, such as a list of schools.
- `sent: SentAnswer[]`: every answer on the form, which is **What Pinkslip sent**. Each one's `by` says who put it there:
  - `pinkslip`: from the profile or saved answers;
  - `jev`: inferred by the AI;
  - `site`: read from the resume by the site's own autofill;
  - `page`: already on the page.

  The resume is always listed.
- `form_shot` / `proof_shot`: pictures of the filled form and of the confirmation page. They're full-page JPEGs, often tall; a site's sticky header can sit over a field.

### Hooks (`@pinkslip/data`, `sends.ts`; client in `@pinkslip/core` `api.apply`)

| Hook | Does |
| --- | --- |
| `useApplySends()`, `useApplySend(id)` | The sends, and one send. They poll while a send is going |
| `useStartSend()` | `{ jobId, dryRun }`. Returns the new send, or throws one of the refusals below |
| `useAnswerSend()` | `{ sendId, answers: { [ref]: value }, resend? }`. Saves the answers to the answers bank, where every later form finds them, and starts the send again (a dry run if the first was) |
| `useSendCode()` | `{ sendId, code }` |
| `useSendResume()`, `useUploadSendResume()` | The resume sends upload |
| `api.apply.sendShot(id, "form" \| "confirmation")` | A picture, as a Blob (it needs the session) |

### Refusals when starting a send

`SendError` codes, each needing a line of copy:

- `not_found`
- `unsupported`: not Greenhouse or Ashby
- `gone`: the posting closed, checked with Greenhouse or Ashby first
- `hidden_company`
- `already_applied`: Tracker already has it past Saved
- `already_sent`: one real send per job, ever
- `no_resume`: no resume uploaded for sends yet
- `limit_reached`: `{ limit, resets_at }`; the plan's sends are used up
- `sends_unavailable`

### The resume

Sends need their own copy of the resume PDF on the server. The phone keeps its file for assisted apply only. Employers see the file under its own name, so the upload should keep the original name. Before sends open beyond admins, the privacy page needs a line about this copy.

### Pushes (live for admins, real sends only, never dry runs)

These are outside the daily cap, since the person started the send. The title is the company; the body ends with "· role".

| Type | When | Body |
| --- | --- | --- |
| N14 | Sent | Sent for you |
| N14 | No confirmation | Sent, but no confirmation yet. Check your email |
| N13 | Questions left | One question to finish, or *n* questions to finish |
| N13 | A captcha | Finish on your phone |
| N13, time-sensitive | Greenhouse's code | Enter the code Greenhouse emailed you |

The code push waits a minute and is dropped if forwarding delivers the code first. **Every push opens the job's page for now** (`/jobs/:id`). Once the send screen has a route, the server can point the pushes there; it's a one-line change.

### Decisions to design around (Decisions: Auto-apply, and the owner since)

- **Answers come only from what the person has given.** Nothing is invented, and visa or work status is never guessed. Unknown questions go to Needs you (#3).
  - Decided (owner, 2026-10-29): Jev guesses only at optional questions on a send (marked `jev` in what was sent). Every required question without the person's own answer comes back in `needs` together, after the rest is filled; nothing is sent until they're answered.
- **Proof** is the confirmation page (#4). The company's confirmation email, through email tracking, also moves Tracker to Applied.
- **Safety** (#5):
  - never the same job twice;
  - hidden companies stay hidden;
  - caps;
  - Pause stops at once;
  - everything sent is kept for the person to see.
- **Ask first is no longer a morning list** (owner, 2026-10-29; Decisions: Auto-apply #2, revisited). Jobs post through the day, so a strong match asks as it posts:
  - **Ask me** (the default, where Pro starts too): one push per job, "Stripe · New Grad SWE · Apply for you?", with Apply and Not this one; tapping the push opens the job. It replaces the usual new-job alert for that job.
  - **Apply for me** (Pro, chosen by the person): strong matches are sent as they post, within the caps.
  - **Not this one** only dismisses that job.
  - So Today has **no Ask first card or daily review page**; it keeps sends in progress and what's waiting on the person. The auto-apply settings need the choice between Ask me and Apply for me.
  - Selecting several on Jobs ("Apply to 8") and its review page are unaffected (apply-flow scope, 2026-10-14).
- **Optional consents are never ticked.** That covers future roles, talent communities, texts and marketing. A box labelled only "I agree" is ticked only when the form requires it.
- **Copy rules:**
  - no "we";
  - no time promises (no "about 30 seconds"; say what it's doing);
  - every piece of information earns its place;
  - the audience is early and mid-career, never "students".

### Not built yet (backend phase C), so samples can't show these live

- ~~Asking as strong matches post~~ **Server built 2026-10-29** (not deployed; Decisions: Auto-apply #2). What the app needs, all over the air on 1.3.8:
  - **built 2026-10-29** (`platform/push.ts`, `AppProviders`): the `apply_ask` category with Apply (opens the app on the job and starts the send) and Not this one (clears the push, app stays closed); the push reads "Stripe" / "New Grad SWE" / "Hold to apply" (Paper "Apply for you? push · Oct 29", approved);
  - auto-apply settings get Ask me / Apply for me (Pro) / off and Pause (a day, a week, until turned back on): `useAutoApplySettings()`, `useSaveAutoApplySettings()`; `can_automate` says whether Apply for me is open, and saving it on Free answers `pro_only`.
  - The push reads "Stripe" / "New Grad SWE · Apply for you?". Its wording and the settings screen go through Paper first.
- **Automatic.** "Send as jobs post" is Pro.
- **Caps, Pause, and the per-company rule.**
- **Batches.** `WhileItRuns`' "Applying for you … Up next" assumes several at once; today each send is one job. A batch would be several sends followed together.
- **The Live Activity** (N15).

### Samples already in the app (from earlier rounds)

- `apps/native/src/features/redesign/apply-flow/`: `AskFirst.tsx`, `AutoApplyPage.tsx` (settings: matches, companies, up to 5/10/20, pause for a day or week), and `WhileItRuns.tsx`.
- The kit pages `kit-auto-apply`, `kit-review`, `kit-sent` and `kit-today`.

None of them has the states above yet: code needed, unconfirmed, blocked, needs you with real options, or what was sent with who put each answer there.

## 2. The Plan page and buying Pro

The server is live. StoreKit (the app's in-app purchase code) isn't built.

- **Decided (owner, 2026-10-24):**
  - Free: 3 sends and 3 tailored resumes a week.
  - Pro: 10 sends a day, no per-company limit, and tailoring under a quiet 50-a-week ceiling that's never shown.
  - Pro is weekly or monthly, with a 3-day free trial once per person. No 3-month plan.
- **Prices:** Apple's are **$4.99 a week and $14.99 a month**, since Apple has no round $5/$15. On the iPhone, show StoreKit's own `displayPrice`, not `PlanState.prices`, which still carries the round 5 and 15 meant for the web later.
- **"Pro ends when you're hired":** on Pro, `PlanState.offer_application` is the latest application at Offer. The Plan page offers to end Pro then, with a refund where possible, or lets it run to the end of the term.
- **`usePlan()` → `PlanState`:**
  - `plan`, `source` (admin, trial, apple or stripe), `period`, `ends_at`, `will_renew`;
  - `trial { available, days }`;
  - `allowances[] { kind, label, used, limit, per, quiet, resets_at }`.
- **Buying:**
  - StoreKit products `dev.alip.pinkslip.pro.weekly` and `dev.alip.pinkslip.pro.monthly`, bought with `appAccountToken` = the user id.
  - Then `useApplePurchase()(transaction.id)`, the same call for Restore. It answers with the plan, or 409 when another Pinkslip account holds that subscription.
  - TestFlight purchases are Sandbox; the server checks both.
- **App Store review needs a picture of the purchase screen** for each subscription before they can be submitted, with the app update that adds the screen. This screen is what unblocks selling Pro.
- **Naming:**
  - store name "Pinkslip: Job Search & Apply", subtitle "Job hunting, from start to end";
  - everything else, subscriptions included, says just "Pinkslip";
  - the group is "Pinkslip Pro".
- **The sample `PlanPage.tsx` predates these decisions.** It says "$24.99", lists outreach and follow-ups as Pro, and says "without weekly limits". Free's actual limits are weekly and Pro's sends are daily.

## 3. Also new today

- **Support Pinkslip (tips)** is on for everyone on US iPhones, as any amount, once or monthly, through Stripe. It's separate from Plan.
- **The Small Business Program** application went in (15% instead of 30%).
