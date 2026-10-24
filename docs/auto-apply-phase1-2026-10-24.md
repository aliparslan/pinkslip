# Auto-apply phase 1: the real send (2026-10-24)

The owner: "Start phase 1: build the real send for Greenhouse and Ashby with
the fixes, admin-only, and I'll pick the jobs for the first real submissions
from my account." Phase 0 (no submits) is in
[auto-apply-phase0-2026-10-24.md](auto-apply-phase0-2026-10-24.md).

**State:** live for admins since 2026-10-24.
- **Deploy:** API Worker `f59535fe`, migration 0103, the Workflow
  `pinkslip-apply-send`. D1 bookmark before the migration:
  `00004645-00008c00-0000510e-92fbd76418f0e1ab21d7bc72730f4c07`.
- **Reader fixes on the phone:** over-the-air update for 1.3.8 on
  `production` (group `e95493e6`) and `owner` (`a4d22089`), from a360ee3.
- **Sends:** none to a real employer yet. The first ones are the owner's
  picks.

## What a send does

1. **Queue** (`queueSend`, `worker/apply/sends.ts`). It turns the job down
   unless all of these hold:
   - It's Greenhouse or Ashby, still open, and the company isn't hidden.
   - The person hasn't applied (Tracker past Saved), and Pinkslip hasn't
     sent it already.
   - The server has the person's resume file.
   - The posting is still up, asked of Greenhouse or Ashby directly
     (fix 6).

   Then it takes one of the plan's sends (`reserveAllowance`; dry runs take
   none) and starts the Workflow.
2. **The browser step** (Workflow `pinkslip-apply-send`, its instance id is
   the send's id). It runs `worker/apply/send-engine.ts` in Cloudflare's
   browser with assisted apply's own reader and filler:
   - It declines the cookie banner and never accepts one (fix 5).
   - It uploads the resume first and waits until the site stops changing
     the form, since Lever and Ashby fill fields from it (fix 1).
     Pinkslip's own answers then replace what the site guessed. Where
     Pinkslip has no answer, the site's read of the resume stays.
   - It plans with the job, so "Have you worked at X?" knows X (fix 3). In
     phase 0 the harness left the job out, which is why those went
     unanswered.
   - It fills one field at a time. A search that came back empty gets one
     more try (fix 4).
   - It takes a picture of the filled form.
   - It never ticks an optional consent, such as future roles, a talent
     community, texts or marketing. One the form requires to apply is
     ticked. In dropdowns it picks "No" (fix 2). This lives in the planner,
     so the phone's assisted fill follows it too.
3. **Stop before Submit** when a required question is still empty. The
   send ends as "needs you" with the questions listed, nothing is sent, and
   the send is given back. A dry run always stops here, as "ready" when
   everything was filled.
4. **Submit**, then read what the page says:

| The page | The send | The plan's send |
| --- | --- | --- |
| A confirmation | **submitted**: its picture, text and address kept; Tracker moves the job to Applied, from auto-apply | used |
| Greenhouse asks for its emailed code | **code needed** (below) | held |
| A captcha challenge | **blocked**: finish on the phone; never solved | given back |
| Fields refused | **needs you**, with the fields | given back |
| No Submit button | **failed** | given back |
| Nothing recognisable | **unconfirmed**: a picture of the page; check email | used |

5. **Greenhouse's emailed code.** Greenhouse emails a code when its
   invisible captcha scores the browser low. The send keeps the browser
   open and waits up to 9 minutes; Browser Run keeps a browser for 10 at
   most.
   - With email forwarding, the inbound handler sees Greenhouse's "code"
     email and hands the code to the waiting send. Nothing else is read
     from that email.
   - Without forwarding, the code goes in by hand: `POST
     /api/v2/apply/sends/:id/code`, or the script's `code` command.
   - Greenhouse holds the application until the code is entered, so a code
     that never comes means nothing went out.
6. **What was sent** is kept: every answer on the form when Submit was
   pressed, with who put it there:
   - Pinkslip;
   - Jev's inference;
   - the site's own read of the resume;
   - already on the page.

**Never twice.** These protections stack:
- A partial unique index allows one real send per job while it's going,
  sent or unconfirmed.
- The send records "submitting" before it presses Submit.
- The browser step may run again only before that point. A send that died
  while submitting becomes "unconfirmed" and is never retried.
- Entering the code never runs twice.

## The owner's first sends

The app has no screens for this yet (frontend later, Paper first). Until
then, `scripts/auto-apply/send.ts` runs wrangler against production as the
admin signed in with `PINKSLIP_EMAIL`, or git's email by default:

```bash
bun scripts/auto-apply/send.ts resume ~/Documents/resume.pdf
```

```bash
bun scripts/auto-apply/send.ts dry https://job-boards.greenhouse.io/acme/jobs/123
```

```bash
bun scripts/auto-apply/send.ts send https://job-boards.greenhouse.io/acme/jobs/123
```

```bash
bun scripts/auto-apply/send.ts show
```

- `resume` uploads the file once (and again when it changes). Employers see
  it as `<Name>_Resume.pdf`.
- `dry` does everything but press Submit, then shows what was on the form
  and saves both pictures under `.wrangler/auto-apply/<send id>/`.
- `send` is a real application. It prints each status change and, at the
  end, the same summary.
- A job is its Pinkslip link or id, or its Greenhouse or Ashby posting link.
- `code <code>` hands over Greenhouse's code when forwarding didn't.
- The Workflow can also be started directly:
  `wrangler workflows trigger pinkslip-apply-send '{"email": "…", "job": "…", "dry_run": false}'`.
  It's a dry run unless `dry_run` is `false`, and only for an admin's email.

The API the app will use (admin-only while `AUTO_APPLY_SEND = "admin"`):

| Route | Does |
| --- | --- |
| `PUT /api/v2/apply/resume?name=` | The resume PDF for sends (5 MB at most) |
| `GET`/`DELETE /api/v2/apply/resume` | What's there; remove it |
| `POST /api/v2/apply/sends` `{ job_id, dry_run? }` | Start a send |
| `GET /api/v2/apply/sends`, `/:id` | Sends, with status, needs and what was sent |
| `GET /api/v2/apply/sends/:id/shots/form`, `/confirmation` | The pictures |
| `POST /api/v2/apply/sends/:id/code` `{ code }` | Greenhouse's code |

## The dry run on real forms

Phase 0's 15 Greenhouse and Ashby forms, run through the engine in
Cloudflare's browser as the sample Jordan Lee with AI off and an empty
answers bank. The harness is `scripts/auto-apply-spike/dry-run.ts`. It
never submits.

| Form | Ends as | What stopped it |
| --- | --- | --- |
| Greenhouse: Squarespace, Asana, Instacart, Peloton, Duolingo, Optiver, Varda, Datadog | needs you (1 to 16 questions) | Company questions: onsite days, Canada, degree list, essays, OPT |
| Ashby: Plaid, Column, Applied Intuition, World Labs | needs you (2 to 4) | Onsite and relocation, "Why us?", interview language |
| Ashby: Sanity, WorkOS | **ready**: would have sent | — |
| Ashby: Cursor | gone | The posting is down |

Every former-employer question was answered "No" from the resume. No
optional consent was ticked, Plaid's text-message consent got "No", and
Plaid's cookie banner was declined. Each form took 12 to 28 seconds.

**Four first runs looked complete and weren't.** Each problem was
fixed and the form run again. Without the fixes they would have reached
Submit:

1. **Ashby marks required questions with a CSS class**, not an asterisk in
   the text, so the reader saw them as optional (Column's and World Labs'
   onsite questions). The reader now counts a `required` class on the
   label.
2. **Ashby's grouped questions put the question in a `<label>` in the
   fieldset**, and the reader took the section heading or a banner instead
   ("This job has application limits" for Plaid's office choice). The
   reader now takes the group's own top label.
3. **Plaid's location box was missed.** Its label names an id nothing has,
   so the reader took the text-message consent above it as the question.
   Such a label now still belongs to its field.
4. **A failed pick left "How did you hear about us?" open** (Sanity,
   Applied Intuition). Ashby hides the rest of the page from screen readers
   while a list is open, so the check after the fill saw 7 of 26 fields and
   called the form complete. Now:
   - a failed pick is cleared and closed;
   - every check closes what's open first;
   - a required question that was on the form before the fill and is gone
     after counts as unanswered;
   - a box that lists options only when opened is opened, read and planned
     again. Sanity's became "Sanity Careers Page" and Applied Intuition's
     "Other", by the existing how-heard preferences.

**The form's own validation messages also stop a send**, such as Plaid's
"School is required to save this entry". Before Submit they send it to
"needs you". After Submit they mean the form refused it, not
"unconfirmed".

Reader fixes 1 to 3 and the cleared pick are in assisted apply's shared
reader and filler (`apps/native/autofill/`). They reach the server with
the deploy. They reach the phone with an app update or over the air, both
waiting on the go-ahead.

Planner fixes from the run:
- A follow-up like "If you chose 'current employee'… please specify" is no
  longer taken for a former-employer question.
- "Current/Last Company" counts as the current company.
- A box labelled only "I agree" isn't ticked unless required: Column's
  agreed to two years of contact.

The pictures stayed on the Mac. A full-page picture can show a site's
sticky header over a field (WorkOS's work-authorization answer); "what was
sent" has the answer either way.

## Liberties, for the owner to veto

1. **The server keeps a copy of the resume PDF.** It's at
   `apply/<user>/resume.pdf` in the resume bucket and is deleted with the
   account. Server sends need one; until now the file lived only on the
   phone. The privacy page needs a line before sends open beyond the owner.
2. **Jev's inferences go on the form**, marked `[jev]` in what was sent.
   Decisions: Auto-apply #3 says answers come only from the answers bank.
   In phase 1 the owner sees every one. The stricter option: any Jev guess
   on a required question stops the send at "needs you".
3. **The site's read of the resume stays** where Pinkslip has no answer,
   marked `[site]`.
4. **"Unconfirmed" counts against the plan** and is never retried. Email
   tracking's confirmation can settle it later.
5. **Pictures are full-page JPEGs**, kept until the account is deleted.
6. **Dropdown consents get "No"** on the phone too, not only on the server.

## Deployed (2026-10-24)

- **What went out:** migration 0103 and the API Worker, which starts from
  `worker/main.ts` with the Workflow class. `wrangler.toml` has
  `[browser]`, `[[workflows]]` and `AUTO_APPLY_SEND = "admin"`.
- **Checks after the deploy:**
  - The Workflow and the table (with the never-twice index) exist.
  - The new routes answer 401 without a session.
  - The feed and the app-link file answer 200.
  - No new errors.
- **Cost:** Browser Run is $0.09 an hour beyond 10 included hours. A send
  takes about 20 to 30 seconds of browser, or up to 10 minutes while
  waiting for a code.

## Testing flows (after the deploy)

1. `bun scripts/auto-apply/send.ts resume <your PDF>` answers "Uploaded".
2. Dry-run a Greenhouse job you'd apply to. It ends "ready", or "needs
   you" with the questions listed. The form picture shows your answers, no
   optional consents ticked and the cookie banner gone.
3. Dry-run an Ashby job. Fields the site read from your resume show
   `[site]`; your own location and name win over the site's guesses.
4. Answer any "needs you" questions once in the app's assisted apply (they
   save to the answers bank), then dry-run again: it should be "ready".
5. `send` the same job for real. It ends "submitted" with a confirmation
   picture, and Tracker shows it Applied. Or it asks for Greenhouse's
   code: with forwarding on it carries on by itself, or use `code`.
6. Sending the same job again is refused ("already sent").
