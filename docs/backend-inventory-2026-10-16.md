# Backend inventory (2026-10-16)

Everything the backend does or should do, in one place, the way
[design-inventory-2026-10-14.md](design-inventory-2026-10-14.md) did it for
the screens. The owner and Claude went through it part by part on
2026-10-16 and wrote the decisions in at the end ("Decisions"). A separate
session builds from it, in the order below ("Order to build"), following
"For the building session".

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

**Decided:** a table of its own (see Decisions).

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
| Error reporting beyond Worker logs | **Live** 2026-10-17: the errors table and admin push (see "Built") |
| Production schema drift (source-health found it once) | **Check** |
| Restore points before risky migrations (D1 Time Travel) | **Works**, as a habit |

## Order to build

Each step is decided (see "Decisions"); build, test, and stop for the
owner's check before the next.

1. **Keeping it running** (Decisions: Admin): the errors table and admin
   push, the 15-minute checks. First, so everything after is watched.
   **Built 2026-10-16, live 2026-10-17** (see "Built").
2. **Notifications foundation** (§1): kinds and per-kind settings, the
   phone's time zone, the scheduler on the every-minute tick, deep links per
   kind, the log, the daily cap for passive kinds. Fix and check what's live
   (§1 "Fix what we have"). Then N2 (once a day) and N9 (a saved job
   closed), which need only what exists. **Built 2026-10-16, live 2026-10-17**
   (see "Built").
3. **The Activity stream and Today** (§2): the table, the backfill,
   `GET /today`, seen per person, the badge from the server. N3 and N4 come
   out of it. **Built and live 2026-10-17** (see "Built").
4. **Application dates and gaps** (§3): N5 to N8, fixing a step's date,
   applications without a Pinkslip job ("Add an application"), pay and the
   company domain kept on the application.
5. **Email tracking proven** (§4): the owner's Cloudflare check and test
   forwards, the test set of real-shaped emails, AI fallback, dates from
   emails, N18, and reply detection (N11). Tracking from one email is not a
   priority.
6. **Accounts** (§7): Google sign-in, email and password.
7. **Following and events** (§6), with N19 and N20.
8. **Outreach for everyone** (§8): contacts, weekly verification, caps,
   removal path, then the flag.
9. **Plans and billing** (§10): plan and metering first; payments at the App
   Store release.
10. **Auto-apply** (§9), last.

## For the building session

- **Read first:** this doc, then `CLAUDE.md` and `AGENTS.md`. The owner's
  rules there win.
- **The API stays additive.** TestFlight builds in testers' hands call
  today's endpoints; never change or remove what they use.
- **Migrations:** take a D1 restore point (Time Travel) before a risky one;
  rehearse on a local copy of production when it rebuilds a table.
- **Deploys, pushes and over-the-air updates only with the owner's go-ahead**
  for that change: `CI=1 bun run deploy:backend` (run wrangler with
  `XDG_CONFIG_HOME=$HOME/.config` from this machine). Check
  `wrangler d1 migrations list pinkslip --remote` and what else in `worker/`
  changed since the last deploy before deploying.
- **Commit to `main`, no PRs, never a Co-Authored-By line.** Fetch first;
  the owner also works on design in another session.
- **Each step ends with** `bun run check`, `bun test`, numbered flows the
  owner can try, and the step's decisions marked built here.
- **Notifications need the phone:** time-sensitive interruption and
  notification categories (actions like Still waiting, Ghosted) need a
  native build; ship the server side first and let pushes open the right
  screen until then.
- **Owner to-dos along the way:** the Cloudflare email routing check
  ([email-tracking.md](email-tracking.md)), forwarding a few real job
  emails, a Google OAuth client for sign-in, an email-verification service
  account for outreach, and later App Store in-app purchase and Stripe.

## Decisions

Made by the owner with Claude on 2026-10-16, part by part.

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
   Passive pushes are also at least 4 hours apart (owner, 2026-10-17).
   New-job alerts are outside the cap: as they post (every match, one push
   per check) or once a day is the person's choice (owner, 2026-10-17).
   Follow-ups go when they come due, without the spacing, still counting
   toward the three (owner, 2026-10-18).
   **Built 2026-10-16** (step 2; see "Built" for how the cap counts).
4. **Email** only for the weekly recap and "Forwarding stopped"; everything
   else is push.

### Activity stream and Today (owner, 2026-10-16)

**Built 2026-10-17** (step 3; see "Built").

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

### Application dates and gaps (owner, 2026-10-16)

1. **Interview:** the evening before at 6 pm ("Interview with Stripe
   tomorrow at 11:00") and an hour before when the time is known
   (time-sensitive); with only a day, 8 am that morning.
2. **Assessment due:** 9 am the day before, and the morning it's due if the
   stage hasn't moved.
3. **Offer reply-by:** 3 days before and the morning before.
4. **No word yet:** the morning after the hear-back date passes ("No word
   from Stripe yet": Still waiting, Ghosted, Add a date); without a date,
   once at 3 weeks after applying and once at 6, then never. The buttons
   need the native build's categories; until then the push opens the
   application.
5. **Time zone** comes from the phone; every reminder uses it.
6. **Any step's date can be fixed** from the application page, email steps
   included.
7. **Applications without a Pinkslip job:** company, title, optional link,
   stage; from a new "Add an application" (and later, maybe, from an email:
   see email tracking #4); a catalog company is matched for the logo.
8. **Pay and the company's domain are kept on the application** (Tracker's
   pay, logos after a job is deleted).

### Email tracking (owner, 2026-10-16)

1. **Prove it first.** The owner checks Cloudflare's subaddressing and the
   `inbox` route ([email-tracking.md](email-tracking.md), "Owner setup") and
   forwards a few real job emails. A test set of real-shaped emails
   (confirmations, rejections, interview invites, assessments, across the
   common ATSs and schedulers) measures detection before anyone relies on it.
2. **Rules first, AI only as the fallback** for an email that passed the
   hiring check but the rules can't place, within the AI budget. Mail is
   never sent to AI otherwise.
3. **Dates from emails:** a clearly stated interview time or assessment
   deadline sets the application's date, shown as "from the email". When
   it's unclear, Today's existing "Add the interview date" row covers it.
4. **Not a priority: tracking an application from one email.** Kept as a
   note. Most confirmations don't link the posting, and the owner wants
   nothing that asks the user (no "which role?" prompt). If it's ever
   built, it creates an application only when the email names the company
   and role clearly, and drops it otherwise.
5. **Forwarding stopped (N18):** one nudge after 3 weeks without any mail,
   only for people who forward everything; a job-only filter is often quiet.
6. **They replied (N11):** mail from the person in an open outreach thread
   marks it replied, stops its follow-ups and sends "Marcus replied"
   (time-sensitive).
7. **No email bodies are stored,** as today.

### Accounts (owner, 2026-10-16)

1. **Google sign-in** in the system's sign-in sheet (no new SDK, ships over
   the air), on the web too.
2. **Email and password:** passwords stored as one-way hashes; "Forgot
   password?" emails a code; sign-in by code stays as the fallback, so
   accounts made with links keep working.
3. **One person, one account:** Google or a password on an email that's
   already on an account joins it once the email is verified. Apple's
   "Hide my email" addresses stay separate unless linked.
4. **Guest data comes along on sign-in,** as today.
5. **Deleting an account removes every sign-in method.**

### Following and events (owner, 2026-10-16)

Following:

1. **Follow** is the outline button on a company's page; a Following list
   in You sits next to Hidden companies.
2. **Following only widens:** jobs at a followed company that fit your level
   reach you even when the role or place is outside your search.
3. **N20 rides with new-job alerts,** marked "Following" in the push and the
   feed. No separate kind.
4. **No automatic follows.**
5. **Auto-apply's "Ones I follow"** reads the same list.
6. **Later:** "Only companies I follow" as an option for alerts too.

Events:

1. **Added in Admin** to start: paste a link and Pinkslip fills in the
   company, title, date, time and place to check. No scraping.
2. **Shown** on the company's page for everyone, and in Today's Coming up
   for followed companies or events you asked to be reminded of.
3. **Remind me (N19)** is a push the day before; Sign up opens their page.
4. **Past events leave** the company page the day after.

### Outreach (owner, 2026-10-16)

1. **Contacts in two steps:** shared early-career inboxes first
   (university@, earlycareers@, campus@); individual recruiters from the
   sourcing search once its "works there" accuracy on the owner's labels
   reaches 90% (Admin shows 81% on the sample).
2. **Only checked emails are shown:** each contact carries its source and a
   verified mark from an email checker; bounces are dropped; the list is
   refreshed every quarter.
3. **Respect for recruiters:** a removal path (a recruiter who asks is
   suppressed for everyone), and a weekly cap on how many users start a
   thread with the same person; past it, the app suggests someone else at
   the company.
4. **A cap per user:** at most 5 new people a day.
5. **Opening it:** drop `OUTREACH_TEST_RECIPIENT`, set `OUTREACH = "on"`
   once the first verified list exists; sending from your own mail stays
   free.
6. **Also:** People on a company's page from the threads (by company, not
   only by job), Gmail and Outlook web compose links, and reply detection
   (email tracking #6).

Addition (owner, 2026-10-16): **email checks are weekly,** through an
email-verification service (it runs the SMTP handshake from servers built
for it and flags catch-all domains; about $30 a month for 2,000 contacts).
A homemade handshake doesn't work: Workers can't connect on port 25, Google
Workspace and Microsoft 365 often accept every address at that step, and
repeated probing gets an address blocklisted. Bounces from outreach emails
that reach Pinkslip through forwarding mark a contact bad at once. Whether a
recruiter still does campus hiring still needs the quarterly refresh of the
list.

### Plans and billing (owner, 2026-10-16)

1. **The plumbing now, payments later:** the server knows each person's
   plan and meters auto-apply sends, tailoring and AI use. Everyone is Free
   during TestFlight with generous limits; taking money waits for the App
   Store release.
2. **Pro unlocks** "Send as jobs post", more auto-apply sends than Free's 3
   a week, tailoring when it returns, and later Pinkslip's own outreach
   composer. Sending outreach from your own mail stays free.
3. **Paying:** Apple's in-app purchase on iPhone, Stripe on the web; either
   sets the same Pro status on the server; Apple's renewal and refund
   notices keep it current.
4. **Limits show where they bite** (Review's "3 left this week"), not as
   warnings elsewhere.
5. **Prices** once there are a few weeks of real usage.

### Auto-apply (owner, 2026-10-16)

1. **Where it runs: both (option C).** The server fills and submits with
   Cloudflare's headless browser, so a batch keeps going with the phone
   locked and the Live Activity only reports. Anything blocked (captchas,
   bot checks) becomes "Finish on your phone" in the in-app browser.
   Greenhouse and Ashby first, then Lever. Workday stays assisted only.
2. **Ask first:** each morning at the user's time the server picks matches
   by their rules; Today's card and the morning push (N12); what they send
   joins the queue.
3. **Answers only from the answers bank;** nothing invented; visa and work
   status never guessed. Anything unknown sends the job to Needs you (N13)
   instead of sending.
4. **Proof:** the confirmation page is saved for each send; the company's
   confirmation email (email tracking) makes it "Confirmed". This feeds the
   stub's APPLIED and SENT stamps and "What Pinkslip sent".
5. **Safety:** never the same job twice; hidden companies respected; the
   per-day and per-company caps; Pause stops at once; everything sent is
   kept for the user to see.
6. **Real submissions stay with the owner** until it has applied correctly
   to the owner's own test applications.
7. **"Send as jobs post" stays Pro and bounded** by the same caps and strong
   matches. No "apply to everything" tier: mass applying lowers response
   rates, recruiters notice it, and heavy automated volume can get Pinkslip
   blocked on an ATS for everyone. A higher tier, if ever, raises the caps
   based on interview rates.
8. **Company-run sites (Google, Apple, Meta, Amazon):** assisted on the
   phone only. The user signs in once in the in-app browser, which keeps the
   session (`incognito={false}`); fill scripts for the big ones; Apply stays
   the user's tap. They show in Ask first as "Finish on your phone";
   Automatic skips them. Sessions are never kept on the server.
9. **Greenhouse's emailed confirmation codes:** with forwarding, email
   tracking reads the code and the server enters it within a couple of
   minutes; without it, a time-sensitive Needs you push ("Enter the code
   Greenhouse emailed you"), since codes expire. On the phone the field
   takes iOS's code autofill.

### Admin and keeping it running (owner, 2026-10-16)

1. **No new service for errors.** The Worker's `onError` writes each error
   to an errors table (kind, route, count, first and last seen); the app
   sends its JavaScript errors to the API into the same table; a new kind
   sends an admin push, like failing sources do. iPhone crashes come from
   TestFlight and Xcode's Organizer, which Apple already collects.
   **Built 2026-10-16.**
2. **A check every 15 minutes** that the feed loads, sign-in works and a
   push goes out; a failure alerts the owner. **Built 2026-10-16.**
3. **The notification log** in Product health: sent and opened per kind.
   **API built 2026-10-16** (`notifications_by_kind` in `GET /metrics`);
   showing it in Admin waits for Paper.
4. **A weekly check** that production's schema matches the migrations.
5. **Admin's charts later**, after looking at chart libraries.

## Built

**Deployed 2026-10-17 (steps 1 to 3 together):** migrations 0093 to 0095,
Worker 6046fde9, web f320d256; D1 bookmark before:
`00004576-0000935e-00005108-076fb7124e6a2de47ca8aceabd73dcb8`. The backfill
wrote 431 activity rows; 277 people's alert settings carried over (34 on).
The apps' side went to the owner's phone over the air; testers' production
update waits for the owner.

**Deployed 2026-10-18:** eb0de71 (follow-ups without the spacing, one job
push per run), Worker 3c220792, no migrations. Health checks passing and no
new errors after it.

### Step 1: keeping it running (2026-10-16, live 2026-10-17)

- **Errors table** (migration 0093, `worker/errors.ts`): one row per source,
  kind and route, with a count, first and last seen, the latest message and
  stack, the Cloudflare ray and the app build. The kind is the error's name
  and message with ids, numbers, emails and links taken out; API routes are
  Hono patterns (`GET /api/v2/jobs/:id`), app screens have ids turned into
  `:id`. Emails and links are scrubbed from stored messages too.
- **What writes to it:** the Worker's `onError`, and also failed crons,
  queue batches and inbound mail (`source` `cron`, `queue`, `email`). The
  apps post to `POST /api/v2/errors` (`apps/webapp/src/features/errors`,
  `apps/native/src/platform/error-reporting.ts`, shared logic in
  `packages/core/src/error-report.ts`). Admins read `GET /api/v2/errors`.
- **Admin push:** the every-minute tick claims every kind not yet announced
  and sends one push for the lot ("New error in the API", or "3 new kinds of
  errors"), opening Admin.
- **Health checks** (`worker/health-checks.ts`, cron `7,22,37,52 * * * *`):
  the feed through `https://pinkslip.work/api/v2/jobs` (the path the site
  and the iPhone app use), a guest session as the app starts one plus
  `/me`, then the guest deleted, plus Apple's sign-in keys; and a silent
  APNs push to the newest admin iPhone. A failure is retried once. The
  owner hears when checks start failing, when a different set fails, every
  6 hours while it lasts, and once when they pass again. Admins run them on
  demand with `POST /api/v2/runs/health` and read the last run with
  `GET /api/v2/runs/health`.

Liberties for the owner to keep or veto:

1. Failed crons, queues and inbound mail go into the same table, not only
   API errors: the six-week silent poll failure was a cron.
2. App reports need no session (a visitor whose page broke doesn't become a
   guest), so they're bounded: 30 a minute per address, 20 new app kinds an
   hour, then only known kinds count. Dropped: network failures,
   cancellations, `ApiError` (the server records its own), extension noise.
3. Each app sends a kind once per launch, ten at most. A fatal iPhone
   JavaScript error is kept on the phone and sent on the next launch.
   Development builds only report to a local Worker.
4. When push is the failing check, or no admin device took the alert, the
   health alert also goes by email to admins' verified sign-in emails.
5. A "Checks pass again" push when everything recovers.
6. The push check sends a silent push to the owner's phone every 15
   minutes; nothing shows. Email sign-in isn't checked (it would send a
   real email each time).

Not in step 1: an Admin screen for errors and check results (needs Paper
first; pushes open Admin's home until then) and the weekly schema check
(Decisions: Admin #4).

Before deploying: migration 0093 runs with `CI=1 bun run deploy:backend`;
the new cron needs no other setup. If the feed check fails with a 403 from
pinkslip.work, the zone's bot protection is blocking the Worker's request
and the check should call the API in-process instead. The app reporters
ship with `bun run deploy:web` and an over-the-air update.

### Step 2: notifications foundation (2026-10-16, live 2026-10-17)

- **Kinds** (`worker/notification-kinds.ts`): every kind in Decisions #1
  with its default, whether it's time-sensitive and whether it sends yet.
  Live now: `new_jobs` (N1, N2), `saved_job_closed` (N9), `follow_up` (N10).
  The rest are listed, off the apps' lists until their steps.
- **Settings per kind** (migration 0094, `notification_settings`): one row
  per person and kind; no row means the default. It replaces the two copies
  of the job-alert switch, which are still written for TestFlight builds
  (`PUT /push/settings` and the search profile both write the new row).
  `GET/PATCH /api/v2/notifications` reads and changes them, with the time
  zone; only live kinds are listed.
- **Time zone:** `users.time_zone`, sent by the iPhone app on launch.
  Without one, US Eastern (as outreach already did). The time helpers moved
  to `worker/local-time.ts`.
- **The log** (`notification_log`): one row per notification, with its
  kind, text, link, status, devices, sent and opened. New-job alerts write
  to it as they go; everything else is scheduled into it. "Never the same
  thing twice" is a unique key per person (`saved_job_closed:<job>`,
  `follow_up:<message>`, `new_jobs_daily:<local date>`).
- **The scheduler** (`worker/notification-scheduler.ts`) runs on the
  every-minute tick: due follow-ups are queued, once-a-day alerts whose
  time has come go out, then everything due in the log is sent. Same-kind
  notifications due together go as one push where the kind groups ("3
  saved jobs closed"). Failed sends retry twice, five minutes apart; dead
  tokens are removed.
- **Deep links per kind** (`notificationLinks`): job, feed, saved,
  applied, Today, Alerts, a follow-up's thread, an application. The iPhone
  app now opens `/today` in its Today tab.
- **The daily cap:** passive pushes are at most three in any 24 hours and
  at least 4 hours apart (owner, 2026-10-17), so the three fall across the
  day. A push that can't go yet is rescheduled for the moment it can.
  New-job alerts neither wait for it nor count toward it
  (`UNCAPPED_KINDS`): how often is the person's choice, as they post or
  once a day (owner, 2026-10-17). Follow-ups skip the spacing but count
  toward the three (`UNSPACED_KINDS`, owner, 2026-10-18). A person's
  new-job alert covers at most 100 jobs; any more wait for their next one,
  never a second push in the same run. Time-sensitive pushes skip the cap and carry iOS's
  `time-sensitive` interruption level (it takes effect once the native
  build has the entitlement).
- **N2, once a day:** people on Once a day keep their matches until their
  time (8:00 until a time can be picked), then get one push: "12 new jobs
  today" / "Datadog, Ramp, Mercury and 9 more", opening the feed.
- **N9, a saved job closed:** the notification cron finds saved jobs the
  poller closed in the last day (enough missed polls, so jobs Pinkslip
  took out of its own catalog don't count). One push: "Stripe" / "Software
  Engineer has closed", opening the job's CLOSED page; several: "3 saved
  jobs closed", opening Saved.
- **N10, follow-ups:** now queued through the log, so they count, are
  logged, and respect the kind's switch.
- **Opens:** pushes carry `notification_id`; `POST /push/opened` takes it
  (newer apps) or the job ids (older apps, matched to the new-job alert).
- **Apps:** the iPhone Alerts screen (the approved design) now shows Once
  a day with its time chip, saves through the new endpoint, and the app
  sends its time zone and the notification id. Ships with an over-the-air
  update after the backend deploy.

Liberties for the owner to keep or veto:

1. The cap is a rolling 24 hours, not a calendar day, so held alerts never
   pile up for midnight.
2. New jobs as they post go as one push per person per delivery run (the
   push names up to 50 jobs; the title counts them all), instead of one per
   20 jobs.
3. Once a day starts at 8:00 local; there's no time picker yet (needs a
   Paper round). The once-a-day push also counts toward the cap.
4. N9 opens the job when one closed (its CLOSED page) and Saved when
   several did, and only looks back one day, so a deploy doesn't announce
   old closings.
5. Without a time zone from the phone, US Eastern.

**Decided 2026-10-17:** in production a person with alerts on got about
20 new-job pushes a day (up to 48), so three in 24 hours alone would have
spent all three in the first hour of new jobs. The owner chose spacing:
passive pushes at least 4 hours apart as well. Later the same day, after
the review: new-job alerts leave the cap entirely, so "as they post" stays
as testers have it (one push per check with everything new), and the cap
keeps the other kinds from piling on. Follow-ups stay passive. On
2026-10-18 the owner had follow-ups skip the 4-hour spacing, since a
follow-up has its moment (9am where the person is); they still count
toward the three.

Checked from "Fix what we have" (production, read-only, 2026-10-16):

- **Web push still sends:** 4 web subscriptions (one is the owner's); 221
  web deliveries in 30 days, the last on 2026-10-17 02:56 UTC.
- **Dead phones are pruned:** two tokens removed in the last 30 days (the
  latest 2026-10-15); no failed deliveries in the last 7.
- **Matching keeps up:** the backlog is empty; a job reaches a phone 0.2
  minutes after it's found on average (0.9 at most) over the last week.
- **Grouped alerts:** five jobs at once say "5 new jobs" with the
  companies ("Stripe (2), Ramp, Datadog…") and open the first job named.
  Pushes average 1.6 jobs (14 at most). Opens: 149 of 5,452 jobs sent in
  30 days (2.7%).
- **Still for the phone:** a job alert opening its job, and "Send a test"
  on a fresh install (code reviewed; needs a device).

Not in step 2: showing sent and opened per kind in Admin (Paper first), a
time picker for Once a day (Paper), the badge (step 3), and N3/N4 (step 3).

### Step 3: the Activity stream and Today (2026-10-17, live 2026-10-17)

- **The stream** (migration 0095, `activity`; `worker/activity.ts`): one
  row per thing that happened: a stage move (you, an email, later
  auto-apply), an email needing a choice, a date set, a follow-up coming
  due, a reply ("They replied"), a saved job closing, a new-jobs alert
  sent. A stage move is written in the same batch as its timeline entry
  and points at it, so undoing an email's step or deleting an application
  removes both.
- **Backfilled** from every timeline entry, the emails still waiting for a
  choice, saved jobs the company closed and follow-ups already due.
- **Notifications start from it** (`notifyActivity`): N3 when an email
  moves an application to assessment, interview (time-sensitive), offer
  (time-sensitive) or rejected: "Zephyr Labs" / "Interview invite ·
  Software Engineer", opening the application's page. N4 when an email
  matches several applications: "Zephyr Labs" / "Which application is
  this?", opening Today. N9 and N10 now go through it too.
- **`GET /api/v2/today`** with the app's rules: Needs you (an offer, an
  interview without a date, an email needing a choice, a follow-up due),
  What changed (steps emails filed and saved postings that closed, last 3
  days, one row per application), Coming up (dated steps and planned
  follow-ups through 2 weeks in the person's time zone). Each row carries
  the application, email or thread it's about; the app words and lays out
  rows as before.
- **Seen per person:** `POST /api/v2/today/seen` (the app calls it when
  Today opens); What changed rows say whether they're new since then.
- **The badge:** Needs you's count rides every push as the app icon's
  badge, and the app sets it from Today too.
- **Apps:** the iPhone Today tab reads `GET /today` (the samples still plan
  on the phone, with the same row builders); Alerts shows "Application
  changes" (the approved design's switch, now that N3 sends); pushes open
  `/applications/:id` (the web sends those to Applied, having no
  application page).

Liberties for the owner to keep or veto:

1. Needs you and Coming up are read from the applications, emails and
   threads as they are now, not stored as stream rows, so they clear
   themselves the moment something's resolved with nothing to keep in step.
2. N3 is for emails filed automatically. Filing a "Which application?"
   email yourself sends nothing, and a receipt ("Application received")
   isn't news enough for a push. It still shows in What changed.
3. N4 has no switch of its own on Alerts (the design has none); it's on.
4. Older TestFlight builds will show the server's badge on the app icon
   from their next push, but only newer builds update it when you act in
   the app.
5. What changed's "new since you looked" is in the data but not shown:
   showing it needs a Paper round.

Not in step 3: the "new" mark on Today (Paper), an application page on the
web, reminders from dates (step 4).
