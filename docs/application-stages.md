# Applications with stages (2026-10-13)

The backend for roadmap section 2's first item. Tracker's screens come with
the redesign; today's apps keep working through their existing saved and
applied flags.

## Owner decisions

- **Saved is a stage.** One application per tracked job, so a job is only
  ever in one place. Applying without saving is fine: the application starts
  at Applied, and its timeline has no Saved step.
- **Backend only for now.** The model, API and data hooks. No stage menu in
  today's screens.
- **Pinkslip jobs only.** No hand-entered applications for jobs found
  elsewhere.

## Model

Stages (`shared/application-stages.ts`), in order:

- Saved → Applied → Assessment → Interview → Offer.
- Endings: Rejected, Withdrawn, Ghosted.
- Every stage after Saved counts as applied.

`applications`, one row per user and job:

- **stage**, **notes**, and **stage_changed_at**.
- **applied_at**: when it first reached Applied or later; null while Saved.
- **company_name, title, url**: snapshots, so the history survives the job
  leaving the catalog. `job_id` becomes null only if an admin removes the
  job.

`application_events` is the timeline, one row per stage entered:

- `source` is `user` today. Email detection and automation write here later,
  which is what makes "Not right? Change" possible.
- Events have no `user_id`; they belong to their application.

All writes go through `worker/applications.ts`, so the stage, the applied
date and the timeline can't drift apart.

## API

| Route | Does |
|---|---|
| `GET /api/v2/applications?stage=` | The user's applications, most recently changed first |
| `POST /api/v2/applications` `{ job_id, stage }` | Tracks a job at a stage, creating its application if needed |
| `GET /api/v2/applications/:id` | One application with its timeline |
| `PATCH /api/v2/applications/:id` `{ stage?, notes? }` | Moves it to a stage (setting the same stage records nothing) and edits notes (up to 10,000 characters) |
| `DELETE /api/v2/applications/:id` | Stops tracking it |

Job responses gain `application_stage`; `saved`, `applied` and `applied_at`
are now derived from it. Client: `api.applications.*` in `packages/core`.
Hooks: `useApplications`, `useApplication`, `useTrackJob`,
`useUpdateApplication` and `useRemoveApplication` in `packages/data`.

## Today's flags (`PATCH /jobs/:id`)

| The app sends | Now means |
|---|---|
| `saved: true` | Start tracking at Saved. An application further along is left alone |
| `saved: false` | Stop tracking, only while still Saved |
| `applied: true` | Saved → Applied, or start at Applied. A later stage is kept |
| `applied: false` ("I didn't apply") | Back to Saved, dropping the steps since, if it was saved first; otherwise stop tracking |

The one visible change: a job you saved and then applied to moves from Saved
to Applied instead of appearing in both. `packages/data` drops it from the
cached Saved list straight away, so the web and the next over-the-air update
show that immediately. Older builds catch up on their next refetch.

## Migration 0089

- Rebuilds `applications`, because the old CHECK only allowed the early
  pipeline's stages. Mapping: Applied → applied, Screen → assessment,
  Interview → interview, Offer → offer, Rejected → rejected, Ghosted →
  ghosted. The unused `next` text moves to notes.
- Every saved job not yet applied to becomes a Saved application.
- Builds a starting timeline: when each job was saved (if before applying),
  when it was applied to, and the early pipeline's last stage change.
- Drops `saved_jobs`.

**Deploy.** `bun run deploy:backend` runs the migration, then deploys the
Worker. For the moment between the two, the old Worker can fail saves and the
saved list, because its table is gone. Acceptable with no users yet.

## Also changed

- **Signing in as a guest.** When a guest and the account both track the same
  job, an applied copy beats a Saved one (applying is a fact, saving only
  intent). Between two applied copies, the later stage change wins. Notes
  combine and both timelines are kept.
- **Account deletion** removes the timeline with the applications.
- **Admin job block.** Saved applications go with the job, as saved jobs did.
  Later stages keep their history, detached from the job.
- **Stats and closed-job purge** read the stage instead of the old table.
- Timestamps are ordered and compared with `julianday()`. `datetime()`
  truncates to seconds, and older rows use SQLite's "YYYY-MM-DD HH:MM:SS"
  format, which doesn't sort correctly as plain text against ISO strings.

## Tests

`tests/applications.test.ts` covers:
- the stage rules and the merge rule
- the migration on legacy data
- today's flags through `PATCH /jobs/:id`
- the new routes, including validation and other users' applications
- a guest merge with a conflicting job

## Next

- Tracker's screens, once the redesign gets there: stages grouped as a list,
  the timeline on an application's page, and notes.
- The activity stream (notifications, digest, stats) reading from
  `application_events`.
- Forwarded-email tracking writing detected steps with `source = 'email'`.
