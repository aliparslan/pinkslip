# Backend inventory (2026-10-16)

Everything the backend does or should do, in one place, the way
[design-inventory-2026-10-14.md](design-inventory-2026-10-14.md) did it for
the screens. The owner and Claude go through it part by part, decide what
each part should do, and write the decisions in here. Then a separate
session builds from it, in the order at the end.

Read with:

- [redesign-2026-10.md](redesign-2026-10.md) §4 and §6: the object model,
  the Activity stream and "notifications are UI now".
- [redesign-backend-needs.md](redesign-backend-needs.md): what each
  redesigned screen asks of the server.
- [applications-backend-review-2026-10-13.md](applications-backend-review-2026-10-13.md),
  [email-tracking.md](email-tracking.md),
  [outreach-readiness-2026-10-14.md](outreach-readiness-2026-10-14.md),
  [source-health-2026-10-12.md](source-health-2026-10-12.md),
  [JOB_CLASSIFICATION.md](JOB_CLASSIFICATION.md).

**Status key:**

- **Works:** live and used.
- **Partial:** live, but missing pieces the app already shows or needs.
- **Missing:** nothing on the server yet; the app hides the screen or runs
  it on samples.
- **Check:** built, but nobody has confirmed it works end to end.

## Where it stands

The backend is one Cloudflare Worker (`worker/`, Hono) on D1, with:

- **Crons:** every minute (source dispatch, the polling watchdog,
  follow-up reminders), every 15 minutes (polling) and a separate
  notification pass.
- **Queues:** two for source polls (normal and priority) and one for
  notifications.
- **Inbound email:** mail to `inbox+<tag>@pinkslip.work` is handled by the
  Worker's own email handler.

Production on 2026-10-16:

| What | Count |
| --- | --- |
| Accounts (most are guests) | 2,522 |
| Phones registered for push | 23 |
| Job alerts sent in the last 7 days | 1,616 |
| Tracked applications | 364 |
| Email tracking inboxes / emails received | 2 / 1 |
| Outreach threads | 1 (the owner's test) |

**Flags in `wrangler.toml`:**

- `OUTREACH` and `AUTO_APPLY` are admin-only.
- `OUTREACH_TEST_RECIPIENT` addresses every outreach email to the owner.

The redesign went to every TestFlight tester on 2026-10-16, so testers can
reach screens whose backend is partial.

## 1. Notifications

The owner's first priority. Every automation level reaches people through
notifications first ([redesign-2026-10.md](redesign-2026-10.md) §4), and
today only two kinds exist.

### What's live

| Notification | Channel | Status |
| --- | --- | --- |
| New jobs that match your search | Push (APNs, web push) | **Works:** about 230 a day; matching runs in its own cron |
| Follow up with a recruiter | Push | **Works**, but outreach is admin-only |
| Admin alerts: a source paused, the watchdog, the AI budget | Push to admins | **Works** |
| Sign-in link | Email | **Works** |
| Email tracking setup steps | Email | **Works** |
| A test alert | Push | **Works** (You → Alerts → Send a test) |

**Settings:** only one per user (alerts on or off), stored twice:
`notifications_enabled` on the search profile and `user_notification_settings`.
The redesigned Alerts screen already has "Once a day" and "Application
changes", hidden until the server supports them.

### Every notification we could send

A starting list to decide on together. The defaults are proposals to keep
or change.

| # | Notification | When | Channel | Default | Status |
| --- | --- | --- | --- | --- | --- |
| N1 | New matching jobs | As they post | Push | On | Works |
| N2 | New jobs, once a day | At a time you pick | Push | Off | Missing (UI hidden) |
| N3 | An application moved | An email moves it: assessment, interview, offer, rejected | Push, time-sensitive for interview and offer | On | Missing (UI hidden) |
| N4 | Which application is this? | An email matched more than one | Push | On | Missing (Today shows it) |
| N5 | Interview tomorrow / in an hour | From the application's date | Push, time-sensitive | On | Missing |
| N6 | Assessment due soon | A day before its due date | Push | On | Missing |
| N7 | Reply to the offer | Before the reply-by date | Push | On | Missing |
| N8 | No word in a while | Past the hear-back date: Ghosted? | Push | On | Missing |
| N9 | A saved job closed or is closing | The poller sees it close | Push | On | Missing (the poller already knows) |
| N10 | Follow up with someone | A follow-up comes due | Push | On | Works (outreach only) |
| N11 | They replied | Email tracking sees a recruiter's reply | Push, time-sensitive | On | Missing (needs reply detection) |
| N12 | Your morning list is ready | Ask first, at the time you set | Push | On with auto-apply | Missing (with auto-apply) |
| N13 | One question to finish | Auto-apply needs an answer; answer it from the notification | Push, actionable | On | Missing |
| N14 | Sent for you | A batch finishes | Push, or the Live Activity alone | On | Missing |
| N15 | Applying now | Live Activity and Dynamic Island while a batch runs | ActivityKit push | On | Missing (native and server) |
| N16 | Your day, in one line | Daily: "Applied to 6, 2 replies, 1 follow-up due" | Push | Off | Missing |
| N17 | Your week | Weekly recap | Email or push | Off | Missing |
| N18 | Forwarding stopped | No mail at your inbox address for a while | Push | On | Missing |
| N19 | An event you follow | The day before an event | Push | On | Missing (no events backend) |
| N20 | A company you follow posted | A new role at a followed company | Push | On | Missing (no following) |

### What every kind needs underneath

- **Kinds and settings per kind:** which are on, and how often, per user.
  One row per user and kind replaces the two copies of on/off.
- **The user's time zone:** for "once a day at 8:00", the morning list and
  reminders. Nothing stores it yet.
- **No quiet hours for now** (owner, 2026-10-16).
- **A scheduler for timed sends:** reminders from dates, digests at a time.
  The every-minute tick can carry it, as follow-up reminders already do.
- **Grouping and limits:** batch new jobs, collapse repeats, cap a day's
  passive pushes, and never send the same thing twice (`notification_candidates`
  and `notification_deliveries` do this for N1 only).
- **Deep links per kind:** every push opens the right screen (job, application,
  person, Today, Alerts).
- **The badge:** Today's count of what needs you, set from the server so the
  app icon shows it too.
- **Actionable and time-sensitive:** iOS notification categories (Answer,
  Snooze, Mark applied) and interruption levels; time-sensitive needs the
  entitlement in the native build.
- **A log:** what was sent, opened (`/push/opened` exists) and acted on, for
  each kind; Admin's product health reads it.
- **Email as a second channel** for the weekly recap and anything a user
  turns off on the phone.

### Fix what we have

To check before building on it (status **Check**):

- A job alert opens that job (still on the roadmap's phone checks).
- Grouped alerts: what a push says when five jobs land at once, and whether
  tapping it opens the feed or the first job.
- Web push: whether anyone uses it, and whether it still sends.
- Dead phones: subscriptions APNs rejects are pruned
  (`isDeadPushSubscription`); confirm it runs.
- "Send a test" works on a fresh install with alerts just allowed.
- The matching pass once ran out of memory (comments in `worker/index.ts`);
  check it keeps up at today's volume.

### Decided

See "Decisions" at the end (notifications, 2026-10-16).

## 2. Activity stream and Today

**The backbone** ([redesign-2026-10.md](redesign-2026-10.md) §4): one stream
of what happened (applied, an email moved something, a follow-up came due, a
reply, auto-apply's results). It feeds Today, notifications, the Live
Activity, the digest and each application's timeline.

| Need | Status |
| --- | --- |
| Each application's timeline (`application_events`) | **Works** |
| A stream across all of a user's applications, threads and auto-apply | **Missing**; Today builds "What changed" in the app from job emails |
| A last-seen mark, so What changed shows only what's new | **Missing** |
| Coming up: dated steps in the next two weeks | **Partial:** `stage_date` exists; the app filters |
| Needs you: offer and interview dates, emails needing a choice, follow-ups due | **Partial:** done in the app from three requests |
| Today's badge count | **Partial:** counted in the app; the server doesn't set the icon badge |

**To decide:** whether the stream is a table of its own or a view over
`application_events`, outreach messages and inbound emails.

## 3. Applications and Tracker

| Need | Status |
| --- | --- |
| Stages, one record per job, the timeline, guest merge | **Works** (migration 0089) |
| A date per stage (interview, due, reply-by, hear back) | **Works** (0091) |
| Who moved it: you, an email, auto-apply | **Partial:** `user` and email; auto-apply later |
| Tracking a job from elsewhere ("Track one from an email") | **Missing:** applications need a Pinkslip job |
| Fixing when something happened ("I applied on the 2nd") | **Missing** |
| Pay on Tracker rows | **Missing** (additive) |
| Logos for jobs that were deleted | **Missing:** snapshot the domain |
| Notes on an application | **Check** what the page saves |

## 4. Email tracking

| Need | Status |
| --- | --- |
| The forwarding address, rotate, Gmail's code, "Email me these steps" | **Works** |
| Reading a forwarded email: company, stage, which application | **Partial:** built, but one email has arrived in production |
| Which application? (several matches), assign, dismiss, undo | **Works** |
| Cloudflare routing: subaddressing and the `inbox` route to the Worker | **Check** ([email-tracking.md](email-tracking.md) "Owner setup") |
| Recruiter replies noticed for outreach (N11) | **Missing** |
| Dates from emails (an interview's time into `stage_date`) | **Missing** |
| Forwarding stopped (N18) | **Missing** |

## 5. Jobs pipeline

| Need | Status |
| --- | --- |
| 18 adapters (Greenhouse, Ashby, Lever, Workday, SmartRecruiters, Rippling, Eightfold, Gem, YC, Apple, Google, Amazon, Meta, Uber, Tesla, Bloomberg and others) | **Works** |
| Polling tiers, queues, the watchdog, quarantine and backoff | **Works** |
| Source health: moved and dead boards | **Partial:** 78 re-pointed and 52 retired on Oct 12; new failures show in Admin's Sources |
| Classification: rules, the review queue, Jev in shadow | **Works**; Jev is still being judged against the rules |
| Closed jobs, salary parsing, logos | **Works**; sharper logos optional |
| Adding companies to the catalog (the quality bar, owner approves each) | **Partial:** Admin's Sources; candidates are reviewed by hand |

## 6. Feed, search, companies, events, following

| Need | Status |
| --- | --- |
| The feed with filters and search (`q`), stats, viewed, saved, applied | **Works** |
| Public job pages and the sitemap (web, SEO) | **Works** |
| Search tab: jobs and companies together | **Check:** the tab uses the feed's `q` and the company list |
| A company's page: jobs, people, events | **Partial:** jobs only |
| Following a company (alerts, auto-apply's "Ones I follow", N20) | **Missing** |
| Events: a company's info sessions and fairs, reminders (N19) | **Missing** (samples in the app) |
| Hidden companies, blocked jobs, reports | **Works** |

## 7. Accounts, profile, resume and answers

| Need | Status |
| --- | --- |
| Guests, Apple sign-in (app and web), email sign-in link, sessions, delete with Apple revocation | **Works** |
| Google sign-in | **Missing** (the onboarding design asks for it) |
| Email and password, with a code fallback | **Missing** (onboarding design: no magic link) |
| Search profile: stages, roles, places, remote, pay | **Works** |
| Resume import (parse, OCR) | **Works** |
| The resume editor's draft | **Check** where it saves |
| Answers bank (Answers page, apply) | **Works** |
| Time zone | **Missing** (see §1) |

## 8. Outreach

| Need | Status |
| --- | --- |
| Threads, messages, follow-up schedule and reminders | **Works**, admin-only |
| Recruiter contacts for every company | **Missing:** only the test contact; the owner sources lists ([recruiter-contacts-sourcing.md](recruiter-contacts-sourcing.md)) |
| Import with source and a verified mark | **Missing** |
| Threads by company (company page People, "You reached out") | **Partial:** by job only |
| Reply detection (N11) | **Missing** |
| Opening it up: drop the test recipient, `OUTREACH = "on"` | **Waiting** on contacts |

## 9. Apply and auto-apply (after the rest)

| Need | Status |
| --- | --- |
| Assisted fill: prepare, the in-app browser fill, the answers bank, learn | **Works**, admin-only |
| Proof it went through (the stub's APPLIED and SENT) | **Missing** |
| The queue: apply in the background, progress, pause | **Missing** |
| Ask first: the morning list, review, send | **Missing** (samples in the app) |
| Auto-apply settings and limits | **Missing** (samples in the app) |
| Questions it can't answer → Needs you (N13) | **Missing** |
| Live Activity updates (N15) | **Missing** |

## 10. Plans and billing

| Need | Status |
| --- | --- |
| Free and Pro, usage-based, to cover costs | **Missing:** the Plan page shows Free; nothing enforces a limit |
| Buying in the app (StoreKit) and checking it on the server | **Missing** |
| Usage the plan meters (auto-apply sends, tailoring) | **Partial:** tailoring usage only |

## 11. Admin, analytics and ops

| Need | Status |
| --- | --- |
| Runs, Sources, the Inbox, Jev, Recruiters, Product health | **Works** (redesigned Oct 16) |
| Product events (`/interactions/events`) and metrics | **Works** |
| Admin alerts | **Works** |
| Charts in Admin (owner: more visuals, fewer numbers) | **Later**, after looking at chart libraries |
| Error reporting beyond Worker logs | **Missing** |
| Production schema drift (source-health found it once) | **Check** |
| Restore points before risky migrations (D1 Time Travel) | **Works**, as a habit |

## Proposed order

Each part ends with a short spec here, then the building session takes it.

1. **Notifications foundation:** kinds and per-kind settings, time zone,
   the scheduler, deep links, the log. Fix and check what's
   live (§1 "Fix what we have"). Then N2, N3, N4 and N9, which need only
   what exists.
2. **The Activity stream and Today** (§2): What changed, last-seen, the
   badge from the server.
3. **Application dates as reminders:** N5 to N8 from `stage_date`, plus
   fixing a step's date and tracking a job from elsewhere (§3).
4. **Email tracking checked end to end** (§4), then dates from emails,
   forwarding stopped (N18) and reply detection (N11).
5. **Accounts:** Google and email with password (§7).
6. **Following and events** (§6), with N19 and N20.
7. **Outreach for everyone** (§8), once contacts exist.
8. **Plans and billing** (§10).
9. **Auto-apply** (§9), last.

## Decisions

Filled in as the owner and Claude go through each part.

### Notifications (owner, 2026-10-16)

1. **First set:** N1 and N2 (new jobs, as they post or once a day), N3 (an
   application moved), N4 (which application?), N5 to N8 (interview,
   assessment, offer and hear-back reminders from the application's date),
   N9 (a saved job closed) and N10 (follow-ups). N11 (they replied) follows
   once replies are detected. N16 (the day in one line) exists but is off
   by default. The rest wait for their features (auto-apply, following,
   events, the weekly recap).
2. **One source:** every notification starts from the Activity stream
   (§2), so Today, the app icon's badge, pushes and any digest agree.
3. **No quiet hours** for now. At most three passive pushes a day; the
   time-sensitive kinds (interview, offer, a reply) don't count toward it.
4. **Email** only for the weekly recap and "Forwarding stopped"; everything
   else is push.

### Activity stream and Today (owner, 2026-10-16)

1. **Its own table**, written when something happens: a stage moves (you,
   an email, later auto-apply), an email needs a choice, a date is added or
   changes, a reminder comes due, a follow-up comes due, a reply, a saved
   job closes.
2. **New-job alerts keep their own matcher;** the stream records each alert
   sent ("5 new jobs"), so digests and the log stay whole.
3. **Today in one request** (`GET /today`) with the app's rules: Needs you
   (offers and interviews without a time, emails needing a choice,
   follow-ups due), What changed (the last 3 days), Coming up (dated steps
   in the next 2 weeks).
4. **Seen is per person, on the server:** opening Today marks it seen on
   every device. The app icon's badge counts only Needs you.
5. **Needs you clears itself** when it's resolved (the stage moves, a date
   is added, the follow-up is sent or stopped, the email is filed). No
   manual dismiss for now, except emails, which already have one.
6. **Backfilled** from existing timelines and emails, so Today isn't empty
   on day one.

