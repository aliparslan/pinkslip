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

Open: whether onboarding recommends Gmail's "forward a copy of all incoming
mail" or a keyword filter. The server handles both the same way.

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
| `POST /api/v2/inbox/emails/:id/assign` | Answers "Which application?" |
| `POST /api/v2/inbox/emails/:id/dismiss` | "Not one of these" |
| `POST /api/v2/inbox/emails/:id/undo` | "Not right?": removes the step it recorded and restores the previous stage |

## Owner setup (Cloudflare dashboard)

1. Email → Email Routing on `pinkslip.work`: enable it (this adds the MX
   records).
2. Settings → turn on **subaddressing**.
3. Routing rules → `inbox@pinkslip.work` → **Send to a Worker** → `pinkslip`
   (the API Worker).
4. Deploy the backend.
5. Send a test to `inbox+<your tag>@pinkslip.work`. One third-party report
   says plus-addressed mail can be dropped with some catch-all settings, so
   check the Email Routing activity log.

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
