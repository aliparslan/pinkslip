# Email tracking by forwarding (2026-10-14)

Roadmap section 2: application stages that update themselves from the
emails companies send. Users' mail reaches Pinkslip by automatic forwarding.
A Gmail connection (no computer needed for setup, plus past emails) comes
later and reuses everything here except how mail arrives.

## Owner decisions

- **One address, a tag per user:** `inbox+<tag>@pinkslip.work`. The tag
  identifies the user, so automatic forwarding works on any provider. The
  tag acts as a password; a new one can be issued at any time.
- **Automatic only.** Manual forwarding isn't offered as a feature: with the
  number of applications a tech search takes, it's too much work.
- **Read in memory, store results only.** No email body is ever stored. Per
  detected email Pinkslip keeps the sender, subject, date, the detected step
  and the application it matched, so a step can be shown with its source and
  undone ("Not right? Change").
- **Rules, not AI**, so tracking costs nothing per email.
- **Pinkslip jobs only.** An email about a catalog job the user never
  tracked creates the application; anything else is dropped.
- **Ambiguous emails ask instead of guessing.** For example, five open
  applications at Airbnb and a rejection that names no role: "Which
  application?" with the candidates. Unanswered prompts expire after 30 days.
- **Signed-in accounts only.** Guests have no inbox.

- **What to forward** (owner, 2026-10-14): setup offers both, Everything
  first (Gmail's "forward a copy of all incoming mail"), then Only job mail
  (a filter we write). The server handles both the same way.

## Screens (owner picks, 2026-10-14)

Paper page "Email tracking · Oct 14"; the board names start with the option.

- **Where it's offered:** 1A, a row in You (its permanent home), and 1B, a
  nudge in Tracker with an outline "Set it up" until it's set up or
  dismissed. Not on every application's stub (1C).
- **Setting it up:** 2B, a guided sheet: which email you apply with, then
  the address with "I added it" and "Email me these steps", then Gmail's
  code, shown by itself when it arrives. The one-page version (2A) can
  become the "How to set it up" reference.
- **Copy** is an icon (two overlapping squares) in a 36pt round button on
  the field: right of a one-line value (the address, Gmail's code), in the
  top-right corner of a long one (the filter). The address row on the status
  page has it too.
- **After it's on:** 4B, a quiet status: job emails this month, time since
  the last email, the address, how to set it up, Replace address. What
  emails change shows on each application (EMAIL stamps) and in Today.
  The numbers card has a chevron and opens **Job emails**, the history
  (4A's list, owner 2026-10-14): Today-style rows, newest first, under
  "This month 14". Each row opens its application; one waiting on "Which
  application?" carries the pink dot and opens that sheet.
- **Replace address** asks first: "Replace your address? The old one stops
  working right away. You'll forward to the new one." The new address is
  random again (a chosen one could be guessed, and anyone who knows it can
  send updates into your Tracker), and the old one isn't kept.
- **Which application?** 5A, a sheet from Today's Needs you. Pick any
  number of the candidates, then Save, or None of these.

## Flow

1. The user's mail provider forwards to `inbox+<tag>@pinkslip.work`.
2. Cloudflare Email Routing matches the `inbox@` rule (subaddressing keeps
   the tag) and runs the API Worker's `email` handler. Cloudflare stores
   nothing.
3. The handler finds the user by tag. An unknown tag, or a message over
   the size cap, is dropped.
4. **Gmail's forwarding confirmation** is recognised. Its code and link are
   saved on the inbox, so the app can show them.
5. **Header check before reading anything else.** Only mail from a hiring
   service (ATS, scheduler, assessment) or a company the user tracks, or with
   clear application words in the subject, is opened. Everything else is
   dropped unread.
6. **Parse** with `postal-mime`. A manual forward ("Fwd:") is unwrapped to
   the original sender, subject and date.
7. **Detect** the step (Applied, Assessment, Interview, Offer, Rejected) and
   the company, role and any job link or ID.
8. **Match**, strongest first:
   1. A job link or ID from one of the user's applications appears in the
      email.
   2. The role title of one of the user's applications at that company
      appears.
   3. The user has exactly one application at that company.
   4. No application, but exactly one catalog job at that company matches the
      title: create the application.
   5. Several candidates: a "Which application?" prompt.
   6. Nothing: drop, keep nothing.
9. **Record.** An `inbound_emails` row, then a timeline step with source
   `email`. Detection only moves an application forward or to an ending,
   never back.
10. The message is discarded. Each email counts once: a hash of its
    Message-ID guards against the same email arriving twice.

## Storage

- `email_inboxes`: one per user. The tag, when Gmail forwarding was
  confirmed (plus the pending code and link), and when the last email
  arrived.
- `inbound_emails`: one per detected email. Sender, subject, date, detected
  stage, status (`applied`, `created`, `unchanged`, `needs_choice`,
  `assigned`, `dismissed` or `undone`), the matched application and, while
  waiting on the user, the candidate applications.
- `application_events.inbound_email_id` links an email-detected step to
  its email, for undo.

## API

| Route | Does |
|---|---|
| `GET /api/v2/inbox` | The user's address (created on first use), forwarding status and last email |
| `POST /api/v2/inbox/rotate` | Issues a new tag; the old address stops working |
| `GET /api/v2/inbox/emails?status=` | Detected emails, newest first ("Needs you" uses `needs_choice`) |
| `POST /api/v2/inbox/emails/:id/assign` | Answers "Which application?" with `application_ids` (one or more; `application_id` still works). The email lists under the first; each one it moves gets its own step |
| `POST /api/v2/inbox/emails/:id/dismiss` | "Not one of these" |
| `POST /api/v2/inbox/emails/:id/undo` | "Not right?": removes the steps it recorded and restores the previous stages. With `application_id`, only that application's (the page it was tapped on); the email counts as undone once none are left |

## Owner setup (Cloudflare dashboard)

Cloudflare moves these menus around. On current accounts Email Routing sits
under Compute → Email Service; on older ones it's under the domain's Email
tab.

1. Turn on Email Routing for `pinkslip.work`. This replaces the domain's MX
   records. (Done 2026-10-14.)
2. Email Routing → **Settings** → turn on **Subaddressing**.
3. Push and deploy the backend. Cloudflare only offers a Worker as a
   destination once it is deployed with an `email` handler.
4. Email Routing → **Routing rules** → **Create address**:
   - Custom address: `inbox`
   - Action: **Send to a Worker**
   - Worker: `pinkslip`
5. Send a test to `inbox+<your tag>@pinkslip.work`. One third-party report
   says plus-addressed mail can be dropped with some catch-all settings, so
   check the Email Routing activity log.

## Providers

The address works with any provider that can forward automatically.

- **Gmail:** Settings → Forwarding (a confirmation code comes back through
  the inbox API), or a filter that forwards.
- **Outlook.com (personal):** Settings → Mail → Forwarding, or a rule that
  forwards or redirects. No confirmation step.
- **Microsoft 365 work and school accounts:** external auto-forwarding is
  blocked by default (bounce code 5.7.520) unless the school's IT allows it.
- **Outlook rules set to "forward as an attachment"** aren't read. Use
  forward or redirect.
- **iCloud:** forwarding in iCloud Mail settings on the web.

## Cost

Email Routing is free. Each email is one Worker invocation, and mail that
fails the header check finishes in about a millisecond. A thousand users
forwarding everything (about 60 emails a day each) fits inside the $5 Workers
plan.

## Later

- Gmail connection: OAuth, push notifications and past mail. It needs
  Google's verification and a yearly security review. Microsoft for Outlook
  and school accounts.
- Notifications and the daily digest, through the activity stream.
- Learning from corrections: remember a sender domain once the user assigns
  it.
