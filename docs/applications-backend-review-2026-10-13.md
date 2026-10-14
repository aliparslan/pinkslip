# Applications backend review (2026-10-13)

What was reviewed: worker `602a03d` (`worker/applications.ts`,
`worker/routes/applications.ts`, `routes/jobs.ts` flags), migration
`0089_application_stages.sql`, `shared/application-stages.ts` and
`tests/applications.test.ts`, against what the redesign needs: Tracker, a page
for each application, Today (Needs you, What changed, Coming up), email
tracking and auto-apply.

## Verdict

Ready for Tracker and a first application page. Not yet enough for Today or
for Tracker's goal third line. It's on main but not deployed.

## What's solid

- **One record per tracked job.** A unique index on `(user_id, job_id)` and
  `INSERT OR IGNORE` mean a job sits in exactly one stage, even if two taps
  race.
- **A timeline.** Every stage change writes an `application_events` row with
  its source and time; the detail endpoint returns them in order.
- **Old apps keep working.** TestFlight and the web still send `saved` and
  `applied` flags on `PATCH /jobs/:id`; the worker maps them onto stages
  ("I didn't apply" goes back to Saved and drops the applied step).
- **Guest accounts merge** without losing that someone applied, keeping both
  timelines.
- **Tracked jobs aren't purged.** The poller skips closed jobs that any
  application points to; an admin delete detaches applications past Saved
  and keeps their history.
- **Tests** cover the stages, the merge, the migration and the API,
  including other users' applications.

## Fixed in this review

- **Timestamps.** Saved jobs and the first applications were stored as
  SQLite's `YYYY-MM-DD HH:MM:SS`, and the migration copies those into
  `stage_changed_at`, `applied_at` and the timeline. The API passed them
  through, and some JavaScript engines (the iPhone's included) don't parse
  that form, so ages and dates could break for older rows. Every timestamp
  now leaves as ISO 8601 (`isoTimestamp`), with a test.

## Before deploying

1. **Take a restore point.** Migration 0089 rebuilds `applications` and drops
   `saved_jobs`; D1 Time Travel can roll back to a moment before it.
2. **Rehearse on a copy.** Export production D1, apply 0089 locally, and
   compare: saved jobs not yet applied to should equal the new Saved rows,
   and the applications count should be unchanged.
3. **Migrate, then deploy the worker straight after.** The old worker reads
   `saved_jobs`; the new one needs `application_events`. Either order has a
   short gap; migrating first keeps it to saves and the saved list.
4. TestFlight and the web need no release: they use the flags.

## Gaps against the vision

| Need | Today | What it takes |
| --- | --- | --- |
| Dates for what's next: an interview's time, an assessment's deadline, an offer's reply-by (Today's Coming up, Tracker's goal line) | Built 2026-10-14, not deployed: `stage_date` (migration 0091), one per application, owned by its stage (Applied, Assessment, Interview, Offer) and cleared when the stage changes; `PATCH` sets it | Email can fill it later |
| Who did it: email detection, auto-apply ("Applied by Pinkslip") | `source` is only `user` | New sources; additive |
| Tracking a job found elsewhere ("Track one from an email") | `POST` needs a Pinkslip job | Applications with no job: company, title, link |
| Fixing when something happened ("I applied on the 2nd") | Steps are stamped now | Let `PATCH` set a step's date |
| What changed since you last looked (Today) | Events exist, but only per application | A feed of recent events across applications, and a last-seen mark |
| Pay on Tracker rows | Not in the response | Add the job's salary to `job`; additive |
| Logos for applications whose job was deleted | The domain comes from the live job | Snapshot the company's domain on the application |
| Outreach (people you've contacted) | Nothing | Its own design and tables, later |

The application page can ship on what exists (stage, timeline, notes,
remove). Dated steps are the first addition worth making, because Today and
Tracker's goal line both need them.

Also added 2026-10-14: email-detected timeline steps carry the email's
subject (`email_subject`), for the stub's "Not right?".
