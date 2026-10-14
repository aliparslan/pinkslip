# What the redesign needs from the backend (2026-10-14)

What each remaining screen needs from the server, for wiring the redesign
up. The designs are on Paper and in [redesign-wireframes.md](redesign-wireframes.md);
the applications review is [applications-backend-review-2026-10-13.md](applications-backend-review-2026-10-13.md).

## Application page

| Need | Status |
| --- | --- |
| A date with the stage (interview time, assessment due, offer reply-by, hear back by) | Built and deployed (0e7a363): `stage_date`, migration 0091, set through `PATCH /applications/:id` |
| Which email made a step, for the stub's EMAIL stamp and "Not right?" | Built: events carry `source`, `inbound_email_id` and `email_subject` |
| Undoing an email's step | Exists: `POST /inbox/emails/:id/undo` |

## Today

| Need | Status |
| --- | --- |
| **What changed:** recent events across all of a user's applications (stages from email, auto-apply's results, outreach replies), newest first | Missing. Events exist per application only |
| **A last-seen mark** per user, so What changed shows only what's new | Missing |
| **Needs you · Which application?** (an email that matched several) | Exists: `GET /inbox/emails?status=needs_choice`, then assign or dismiss |
| **Needs you · follow-ups due** | Partly: threads and their scheduled messages exist; Today needs the due ones across all threads (a filter, or done in the app) |
| **Needs you · questions auto-apply can't answer** | Missing, with auto-apply below |
| **Coming up:** applications with a `stage_date` in the next days | Built with `stage_date`; a `?upcoming` filter on `GET /applications` would save the app the work |
| **Applying for you** (the live bar and the queue sheet) | Missing: a queue that applies in the background, with progress and pause. Today's apply routes do assisted fill one job at a time |

## Tracker

| Need | Status |
| --- | --- |
| Line three's date ("Interview Thu 11:00") | Built with `stage_date` |
| Pay on rows | Missing: add the job's salary to the application's `job`; additive |
| Logos for applications whose job was deleted | Missing: snapshot the company's domain on the application |

## Outreach

| Need | Status |
| --- | --- |
| Threads by company, for "You reached out" on an application page and the person's page | Partly: `GET /outreach/threads` filters by `job_id` only; add `company_id` |
| "You reached out" window: contact from about two weeks before applying, through the application's life | Can be done in the app from thread dates and `applied_at` |
| A reply noticed by email tracking (instead of tapping "They replied") | Missing; later |

## You, onboarding and email tracking setup

| Need | Status |
| --- | --- |
| The forwarding address, Gmail's confirmation code and whether mail arrives | Exists: `GET /inbox`, `POST /inbox/rotate` |
| **Which application?** with several picked: one email files to each | Built and deployed (24171c2): `assign` takes `application_ids`, and `undo` takes the page's `application_id` so "Not right?" undoes only that application. No migration: the email lists under the first pick, and the steps it records link the rest |
| **Job emails**, the history page | Exists: `GET /inbox/emails` (sender, subject, detected step, status, company, application) |
| **Job emails this month** on the status page | Done in the app: it counts `GET /inbox/emails` by date |
| **Email me these steps** (setup on a computer) | Built and deployed (version 36df7baa): `POST /inbox/steps-email` with the provider and what Gmail forwards; it mails the steps and the address to the account's email |
| Which email the user applies with (Gmail, Outlook, iCloud, school) | Can stay in the app; a profile field only if it should follow the user across devices |
| Tracker's nudge dismissed ("Not now") | Can stay in the app |
| Profile, resume, search preferences, alerts, hidden companies | Exist (today's screens use them) |

## Anywhere

| Need | Status |
| --- | --- |
| Sharper logos that can fill the tile: each company's own apple-touch-icon, falling back to Google's favicon | Missing; optional |

## To deploy

Nothing waiting: "Email me these steps" went out on 2026-10-14 (version
36df7baa).
