# Auto-apply phase 0: can Pinkslip's server browser fill real forms? (2026-10-24)

The owner: "go ahead with phase 0, i wanna see how it pans out". The test:
20 open engineering and analyst postings from the catalog (8 Greenhouse,
7 Ashby, 5 Lever, one per company), opened in Cloudflare's headless browser
(Browser Run), read with assisted apply's form reader, answered by the real
planner (`worker/apply/plan.ts`) as the sample Jordan Lee with no AI, filled
with assisted apply's filler, and photographed. **Nothing was submitted.**

The harness is `scripts/auto-apply-spike/` (a throwaway Worker run in
Cloudflare's preview, never deployed, and a local runner). Screenshots stayed
on the Mac, outside the repo.

## What happened

| | Greenhouse | Ashby | Lever |
| --- | --- | --- | --- |
| Opened (HTTP 200, no wall) | 8 of 8 | 7 of 7 (Cursor's posting was gone) | 5 of 5 |
| Fields on the form, average | 24 | 16 | 31 |
| Filled by Pinkslip, average | 16 | 8.5 | 15 |
| Required questions left, average | 5.5 | 0.5 (3 of 6 complete) | 7 |
| Seconds per form (open, read, plan, fill) | 12.5 | 8.3 | 13.8 |
| Bot checks on the page | invisible reCAPTCHA | invisible reCAPTCHA | reCAPTCHA and hCaptcha scripts |

1. **Getting in works.** Cloudflare's browser identifies itself as
   automated, and none of the 20 pages turned it away or showed a
   challenge.
2. **The fill works as it does on the phone.** The same reader, planner and
   filler ran unchanged: name, email, phone, location, the resume upload,
   current company and title, LinkedIn, sponsorship, agreements and the
   voluntary questions.
3. **What's left is company-specific questions:** "Have you worked for a U.S.
   government entity?", "Are you able to start in January?", "This role is
   in NYC three days a week, OK?", "Are you entitled to work in Canada?",
   "Your most advanced degree", "Two or more years of experience?". With AI
   off and an empty answers bank, these went to Needs you, as decided; Jev
   and the answers bank will take many of them, and each is asked once.
4. **It's cheap and quick:** 8 to 14 seconds of browser per form, about
   $0.0004 each.
5. **The unknown is the submit.** Every form carries an invisible captcha
   (reCAPTCHA, and hCaptcha on Lever) that scores the browser when Submit is
   pressed. Nothing here can say whether Pinkslip's browser passes; only a
   real submission can.

## Problems to fix before real sends

1. **Sites rewrite fields after the resume upload.** Lever and Ashby read the
   uploaded resume and fill fields themselves: Lever replaced the location
   with the one in the test PDF ("Austin, TX", from a different sample
   person). Upload the resume first, wait for the site's own autofill, then
   fill everything else.
2. **An optional marketing consent got ticked.** Spotify's "consent to
   contact me about future job opportunities" was checked as if it were a
   required acknowledgement. Auto-apply must only tick what's required to
   apply, never optional consents.
3. **Former-employer questions went unanswered** ("Have you ever been
   employed by Spotify?") although Jordan's history answers them. The planner
   has the rule; it misses checkbox-group versions.
4. **A location search stayed empty** on one Ashby form (WorkOS), possibly
   cleared by Ashby's own autofill. Re-check searchable fields after the
   upload.
5. **Cookie banners** sit over some forms (Spotify). Decline them before
   filling.
6. **The catalog listed a gone posting as open** (Cursor). Check that the
   form exists before queueing a send.

The harness's own bug (it filled the browser's empty first tab instead of
the form on half the first run) is fixed; those ten were re-run.

## Next: phase 1

The first real submissions, on Greenhouse then Ashby, from the owner's own
account (Decisions: Auto-apply #6), with the fixes above. That answers the
captcha question and builds the real send: a Workflow in the main Worker
with the browser binding, which reserves the allowance, opens, uploads,
fills, submits, keeps the confirmation page as proof, and gives the
allowance back if the send fails. Lever waits until Greenhouse and Ashby
pass, since its hCaptcha is the likeliest to stop it.

## Sources

- [Browser Run automatic request headers](https://developers.cloudflare.com/browser-run/reference/automatic-request-headers/) (Cloudflare identifies its browser's traffic)
- [Browser Run pricing](https://developers.cloudflare.com/browser-rendering/pricing/)
