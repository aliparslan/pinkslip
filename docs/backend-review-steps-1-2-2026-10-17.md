# Backend steps 1 and 2: review (2026-10-17)

A read-through of what the building session committed for step 1 (keeping it
running: 4dc96d3, 1d9e6dd) and step 2 (notifications foundation: f42bb40,
3287410, and the 4-hour spacing 5919adc), checked against the Decisions in
`backend-inventory-2026-10-16.md`. Reviewed at the committed versions, not
the uncommitted step 3 work in the same files.

## Verdict

Both steps are built as decided and safe to deploy, in this order: Worker
first (migrations 0093 and 0094), then the web deploy and the iPhone
over-the-air update. Their 91 tests pass, the full `bun test` (1,137) passes
and `bun run check` passes. Nothing below blocks a deploy; three things are
worth a decision first.

## What was checked and holds up

- **The errors table** groups a fault into one row (ids, numbers, emails and
  links stripped), never throws from inside an error handler, and records
  failed crons, queues and inbound mail as well as the API.
- **The apps' reports** skip network failures, cancellations and API answers,
  send each kind once a launch (ten at most), and keep an iPhone crash's
  report for the next launch. Development builds don't report to production.
- **The health checks** retry once before alerting, alert on a new failure,
  every 6 hours while it lasts, and once on recovery, and email when push is
  what broke. The sign-in check's guest is deleted with its session (tested).
- **The migration keeps everyone's alert switch as it was.** It copies
  `COALESCE(user_notification_settings.enabled,
  user_search_profiles.notifications_enabled)`, the same expression the old
  sender used, and the account-wide "don't push me" (`push_enabled`) is still
  honoured everywhere.
- **TestFlight builds keep working.** `GET` and `PUT /push/settings` read and
  write the new rows; `POST /push/opened` still takes job ids. Nothing they
  call was removed.
- **The cap**: at most three passive pushes in any 24 hours, 4 hours apart;
  time-sensitive ones skip it. Held pushes are rescheduled to the moment they
  can go, and the every-minute tick sends them then.
- **Once a day** waits for the person's local time (8:00), catches up if the
  Worker missed that minute, and can't send twice in a day (claimed in the
  log first; tested end to end on SQLite).
- **N9** only counts jobs the poller closed in the last day, so a deploy
  won't announce old closings.

## Worth deciding before deploy

Decided the same day (owner): new-job alerts leave the cap ("as they post"
stays as it is today, once a day stays one push), follow-ups stay as built
(with job alerts out of the cap they rarely wait), and the error endpoint
stays open for now. Items 1 to 3 below are kept as the record.

1. **"As they post" becomes about three pushes a day.** People with alerts on
   got about 20 new-job pushes a day (up to 48); with the cap and the 4-hour
   spacing they'll get at most three, each listing everything since the last.
   This is the decided behaviour (2026-10-17), but it is the biggest change
   testers will notice the day it ships. A line in What's new may help.
2. **Follow-ups and saved-job closings share the cap with new jobs.** A
   follow-up reminder (N10) can wait up to 4 hours behind a new-jobs push.
   Decided as passive, so this is as designed; flagging it because the
   follow-up is the one passive kind with a moment attached. If that matters,
   N10 could skip the spacing (still counting toward the three).
3. **Anyone can add error kinds.** `POST /api/v2/errors` needs no session (on
   purpose), so junk reports can create up to 20 new kinds an hour, and each
   new kind pings admins (batched per minute). A nuisance, not a leak. If it
   ever happens: alert on app kinds only after they've been seen twice, or
   only for reports carrying a real build label.

## Small things, no action needed now

- The new-error push stamps kinds as announced before sending; if that push
  fails, those kinds are never pushed (they're still listed in
  `GET /api/v2/errors`).
- A person with more than 100 jobs waiting gets two pushes in one run (the
  second skips the cap). Only after a long outage.
- Switching to Once a day after 8:00 sends that day's digest at once.
- The push check sends a silent push to the owner's iPhone every 15 minutes
  (as listed in the step's liberties).
- The feed check fetches `https://pinkslip.work` from the API Worker. The
  step notes a possible 403 from bot protection; if the first runs fail with
  403 (or Cloudflare error 1042), call the API in-process instead.

## Before deploying

- `wrangler d1 migrations list pinkslip --remote` failed just now with an
  authorization error (7403) although `wrangler whoami` shows a login with
  D1 write; a fresh `wrangler login` may be needed.
- Pending since the last deploy (2026-10-16, version 0fa40689): 0093, 0094,
  and 0095 if step 3 goes with them.
- The iPhone over-the-air update with the error reporter, the time zone and
  the new Alerts screen has to go after the Worker deploy: until then those
  endpoints don't exist (it was held out of the owner updates for that).
