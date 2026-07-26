# pinkslip — deep audit

Started 2026-07-26. Working document; one section per pass.

## Method & caveats

- Findings are backed by running code, not reading it. Simulations score the **real
  catalog** with the **real scorer** (`scoreJobForProfile`), varying one input at a time.
- Data comes from the **local D1 snapshot** (`.wrangler/state/.../*.sqlite`), last written
  **2026-06-12**. It holds 754 jobs / 189 open at enabled companies, 292 companies,
  68 users, 10 search profiles. Production numbers will differ.
- Production was queried read-only and tailed across the 16:15 and 17:30 cron ticks on
  **2026-07-26**. Production facts are called out separately from the older local snapshot.
- Priority = (Impact + Risk) × (6 − Effort), each 1–5. Higher is more urgent.

## Baseline health

| Check | Result |
| --- | --- |
| `bun test` | 153 pass, 0 fail (263ms) |
| `svelte-check` | clean — 0 errors, 849 files |
| root `tsc --noEmit` | **39 errors** |
| CI | **none** — no `.github/` |
| Migrations | 43, over ~6 weeks |
| Root README | absent |
| Last commit | 2026-06-12 (~6 weeks dormant) |

---

# The whole audit in one table

Ordered by what I would actually do first. "Effort" is rough implementation size, not risk.

| # | Finding | Effort | Why it's here |
| --- | --- | --- | --- |
| **P0-1** | Cron has not completed since 17 Jun — unindexed queries, oversized backlog scoring, and an unbounded cascading purge exhaust D1 | **low** | The product does not function; three individually cheap faults compound |
| **S-3** | Failures are structurally invisible; Worker reports `outcome: "ok"` while dying | **trivial** | Why P0-1 lasted six weeks. Fix this *first* or the next one hides too |
| **P0-2** | 0 notifications ever delivered to anyone | med | The core promise of the product |
| **P1-1** | Seniority filter is one-sided — widening removes the floor | **low** | Your original complaint. `Math.max` + allowance |
| **P0-3** | 33 companies 404 on every poll; 1 adapter crashes | low | 17% of the catalog silently dead |
| **T-2** | No CI whatsoever | **trivial** | Would have caught T-3, and will catch the next one |
| **P1-7** | `95` duplicated 4×, two as magic numbers in SQL | trivial | Silent, undetectable breakage waiting to happen |
| **S-1** | LLM rate limit bypassable by dropping a cookie | low | Paid endpoint, denial-of-wallet |
| **U-1** | Onboarding buries push + account behind primary "skip" buttons | low | 0.4% enable push, 0.09% sign up |
| **U-3 / P1-4** | Feed is 90% two companies; 43 jobs → 4 distinct scores | med | Ranking doesn't rank |
| **P1-8** | Three stacked scorers; A/B framework at 94 profiles, 28k audit rows | low | Pure overhead, inside the loop that's dying |
| **P1-5 / U-6** | TPM offered in onboarding, can never match | **trivial** | One regex |
| **T-3** | Root typecheck red (39 errors) | trivial | One `exclude` entry |
| **P1-2** | Catalog is 67% senior/staff+, 6% early-career-or-below | high | The product decision, not a bug |
| **P1-3** | 60% of funnel lost to binary title matching | med | No role adjacency |
| **A-2 / A-3 / P1-10** | 5 preference tables, dual-write, orphaned 2,250-row table | med | Schema archaeology |
| **T-1** | 14 of 15 route files untested; every P0 is in untested code | med | — |
| **C-1 / C-2 / C-5** | 8 dead exports, 18 over-exports, doc rot, no README | low | Housekeeping |

**The through-line:** three of the top five are not "the code is wrong" but "the code was wrong
and nothing said so." A `.catch()` that swallows, a status column nobody reads, a typecheck
nobody runs. The cheapest high-value work in this repo is making failure visible.

---

# Production reality check (queried 2026-07-26)

Once production access was available, the picture changed materially. **The core loop
has never worked in production.** Everything in Pass 1 is real, but it is downstream of this.

## Scale

| | |
| --- | --- |
| Jobs | 17,279 total / **3,593 open** |
| Companies | 220 (195 enabled) |
| Users | 2,294 |
| Auth sessions / **real signed-in identities** | 429 / **2** |
| Search profiles / completed onboarding | 94 / **64** |
| `user_job_matches` | 27,660 |
| Push subscriptions / users with notifications on | **10** / **2** |

## The funnel

| Stage | Users | Share |
| --- | --- | --- |
| user rows created | 2,294 | — |
| completed onboarding | 64 | 2.8% |
| ever viewed a job | 8 | 0.3% |
| ever saved a job | 10 | 0.4% |
| ever applied | 15 | 0.7% |
| ever used resume tailoring | 1 | 0.04% |
| **ever received a notification** | **0** | **0%** |

Users are still arriving daily (10 today, 12 on 19 Jul, 69 on 2 Jul). Traffic is not the
problem. Nobody has ever received the thing the product exists to deliver.

---

## P0-1 — The cron has not completed a run since 2026-06-17

**Highest priority finding in the audit.**

`fetch_runs` status counts: **5,949 `running`**, 1,869 `error`, 138 `ok`. The most recent
row with a `finished_at` is **2026-06-17T02:16** — nearly six weeks ago. Every run since
starts and never records completion.

It is not simply dead, which is what makes it hard to notice:

- `preferences.last_polled_at` = **2026-07-26T16:01** (minutes before this query)
- newest job `first_seen_at` = **2026-07-26T00:45**

So companies *are* being polled and jobs *are* being discovered. The invocation dies
partway through. Ordering in [`runPollCycle`](worker/poller.ts:314) locates the window:

| Step | Code | Evidence |
| --- | --- | --- |
| 1 | insert `fetch_runs` status `running` | ✅ 5,949 of these |
| 2–3 | poll companies, write per-company status | ✅ statuses are current |
| 4 | write `preferences.last_polled_at` | ✅ updated 16:01 today |
| 5 | `matchJobsForAllProfiles` | ❓ |
| 6 | `sendNotificationsForJobs` | ❌ 0 notifications ever |
| 7 | `advanceBacklogScoring` | ❓ |
| 8–10 | purges | ❓ |
| 11 | update `fetch_runs` → finished | ❌ never runs |

### Root cause — confirmed from a live log capture

Tailing production across the 16:15 cron tick:

```
Poll cycle failed: D1_ERROR: D1 DB exceeded its CPU time limit and was reset.
    at D1DatabaseSessionAlwaysPrimary._sendOrThrow (cloudflare-internal:d1-api:182:19)
    at async runPollCycle (index.js:6301:3)

wallTime: 70697ms   cpuTime: 5312ms   outcome: "ok"   exceptions: []
```

Three things to read off this:

- **It is D1's CPU limit, not the Worker's.** Worker CPU is 5.3s of a generous budget. A
  single D1 statement is too expensive and the database is reset mid-run.
- **The Worker reports `outcome: "ok"` with zero exceptions**, because
  [index.ts:271](worker/index.ts:271) catches and logs the rejection. Cloudflare's dashboard
  therefore shows a *healthy* cron. Nothing anywhere goes red. That is why this ran unnoticed
  for six weeks.
- The throw escapes `runPollCycle` before step 11, so `fetch_runs` is never closed out.

### Why a query is that expensive: `datetime()` defeats every index

The index exists — `idx_jobs_first_seen` on `first_seen_at DESC` — but essentially every
query wraps the column in a function, which makes SQLite unable to use it:

```sql
ORDER BY datetime(j.first_seen_at) DESC          -- index unusable, full scan + sort
```

There are **40 occurrences of `datetime(<column>)`** across the worker. The worst is
[user-job-scores.ts:445](worker/user-job-scores.ts:445), a *correlated* subquery in
`advanceBacklogScoring`:

```sql
SELECT usp.user_id FROM user_search_profiles usp
WHERE usp.match_cursor_seen_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jobs j JOIN companies c ON c.id = j.company_id
    WHERE c.enabled = 1 AND j.closed_at IS NULL
      AND datetime(j.first_seen_at) < datetime(usp.match_cursor_seen_at)
  )
ORDER BY datetime(usp.updated_at) ASC
```

For each of 94 profiles this scans up to 17,279 jobs joined to companies, calling
`datetime()` twice per row — on the order of **1.6M datetime conversions in one statement**.
The other prime suspect is the closed-job purge at [poller.ts:428](worker/poller.ts:428),
a full scan of 17,279 rows with two `NOT IN` subqueries and `datetime(closed_at)`.

**The `datetime()` calls are unnecessary.** These columns are written with
`new Date().toISOString()`, and ISO-8601 strings in that fixed format sort lexicographically
exactly as they sort chronologically. Plain `<` / `ORDER BY` comparison is both correct and
index-usable. (`posted_at` is the one exception — it comes from ATS APIs in varying formats
and needs care.)

Compounding this: **P1-8's unused A/B framework doubles the D1 write volume inside the same
loop.** `scorer_audits` holds **28,231 rows** written for an experiment nobody reads.

### Follow-up after the first repair was deployed

Version `9123fb38` went live at 17:07 with the ISO-string query fixes, the new open-job
index, stale-run reaping, and exception rethrowing. The rethrow worked: the 17:30 Cron Event
was finally recorded as **Exception Thrown** instead of `outcome: "ok"`. The cron still did
not complete, which proved the first root-cause analysis was incomplete.

Read-only production checks narrowed the remaining failure window:

- All 195 company polls finished and `preferences.last_polled_at` advanced to 17:31:02.
- Backlog scoring then updated matches before D1 reset again.
- `advanceBacklogScoring` attempted **15 users sequentially × up to 750 jobs each**. The live
  run began updating matches and then reset D1; multiplying that batch 15× is not bounded
  safely for the poller's critical path.
- The next maintenance statement found **13,447 closed jobs eligible for deletion in one
  `DELETE`**. Its foreign-key plan scanned `viewed_jobs`, `scorer_audits`,
  `notification_candidates`, `user_job_matches`, `user_job_scores`, `dismissed_jobs`,
  `saved_jobs`, and `applications` for each deleted job because their keys lead with
  `user_id`, not `job_id`.

The completed local repair therefore adds three controls, not just the timestamp rewrite:

1. Score one backlog user per cron tick; active users still warm on demand.
2. Disable the unused 100%-shadow scorer before rebuilding match caches.
3. Purge at most 100 jobs per tick and add reverse `job_id` indexes for every cascading child
   table. `EXPLAIN QUERY PLAN` now shows direct indexed lookups throughout—no child-table scans.

## P0-2 — Notifications have never been delivered

14 candidates have ever been created. **13 are `skipped`, 1 is stuck in `retry` since
2026-06-09, 0 are `sent`.** `notification_deliveries` is empty.

The `skipped` reason is "No registered push subscription" — but
[`createNotificationCandidates`](worker/notification-delivery.ts:53) only creates a
candidate when a subscription exists. So subscriptions are disappearing between candidate
creation and delivery, most likely via the dead-token cleanup at
[notification-delivery.ts:268](worker/notification-delivery.ts:268).

This sits on top of an adoption problem: only 10 push subscriptions and 2 users with
notifications enabled, out of 2,294.

## P0-3 — 17% of enabled companies fail every poll

34 of 195 enabled companies error on every cycle:

| Error | Companies |
| --- | --- |
| Greenhouse API 404 | 22 |
| Ashby API 404 | 9 |
| Lever API 404 | 2 |
| `Cannot read properties of null (reading 'trim')` | 1 |

The 404s are dead or renamed ATS slugs — exactly the "broken guessed source" problem the
[ATS roadmap](ATS_INTEGRATION_ROADMAP.md) anticipates. The `null.trim()` one is a genuine
adapter crash on unexpected payload shape. Nothing surfaces these: `last_poll_error` is
recorded but no alert, digest, or admin view forces anyone to look.

---

# Pass 1 — Product vision & the relevance regression

## The headline

Your hypothesis was right, and it is worse than a tuning problem. Widening the catalog
to senior/staff hurt recommendations through **two independent mechanisms at once**:

1. A scorer bug that removes the *floor* on seniority rather than raising the *ceiling*.
2. A catalog that no longer contains the jobs the original audience needs.

Fixing (1) is a few lines. Fixing (2) is a product decision about who pinkslip serves.

## Evidence

Scoring the 189 open jobs with the real scorer, varying only `target_levels`:

| Profile (`stretch_tolerance: balanced`) | Feed size | Seniority mix of the feed |
| --- | --- | --- |
| `early_career` | 14 | unknown 10, mid 2, early 2 |
| `early_career + mid_level` | 14 | *(identical)* |
| `early_career + mid + senior` | 43 | **staff_plus 29**, unknown 10, mid 2, early 2 |
| `+ staff_plus` | 43 | *(identical)* |

Two things stand out. Adding `senior` triples the feed and **every job it adds is
`staff_plus`** — not one is `senior`. And adding `staff_plus` on top changes nothing,
because `senior` already admitted it.

`stretch_tolerance` sensitivity, same catalog:

| Target | Tolerance | Feed | staff+/manager/exec |
| --- | --- | --- | --- |
| early_career | strict | 12 | 0% |
| early_career | balanced | 14 | 0% |
| early_career | ambitious | 23 | 0% |
| senior | strict | 12 | 0% |
| senior | balanced | 43 | **67%** |
| senior | ambitious | 58 | **60%** |

Selecting "senior" on the default tolerance yields a feed that is two-thirds staff,
principal, manager and executive roles.

---

## P1-1 — Seniority filtering is one-sided: widening removes the floor

**Priority 40** (Impact 5, Risk 5, Effort 2) — *the single highest-value fix in this pass*

[worker/user-job-scores.ts:154](worker/user-job-scores.ts:154):

```ts
const targetRank = Math.max(...profile.target_levels.map((level) => seniorityRank[level]));
const levelAllowance = stretch_tolerance === "strict" ? 0 : "balanced" ? 1 : 2;
const seniorityDisqualified = featureRank >= 0 && featureRank > targetRank + levelAllowance;
```

Only the **maximum** selected level is consulted, and only an upper bound is enforced.
Selecting `[early_career, senior]` does not mean "show me both bands" — it means "show me
everything at or below senior + 1", which is the entire catalog above your level too.
There is no lower bound anywhere in the scorer.

The `+ levelAllowance` compounds it: `senior` (rank 4) + balanced (1) = 5, and
`staff_plus` is rank 5. **Choosing "senior" silently opts you into staff+ roles.** That is
why rows C and D of the table above are identical, and why the 29 jobs that appear are all
staff_plus.

The same one-sidedness applies to years, [user-job-scores.ts:141](worker/user-job-scores.ts:141):

```ts
const experienceDisqualified = features.min_years !== null
  && features.min_years > profile.years_experience + stretchYears;
```

`profileExperienceRange()` computes both `minYears` and `maxYears`, but `minYears` is never
used for disqualification anywhere.

**Fix:** score against the selected *band* (min and max of `target_levels`), and stop
letting `levelAllowance` push past the top selected level. Treat `target_levels` as a set
membership test with a small tolerance either side, not a ceiling.

---

## P1-2 — The catalog no longer contains early-career jobs

**Priority 20** (Impact 5, Risk 5, Effort 4) — *the actual product problem*

Seniority mix of the 189 open jobs at enabled companies:

| Seniority | Count | Share |
| --- | --- | --- |
| staff_plus | 58 | 30.7% |
| unknown | 53 | 28.0% |
| senior | 40 | 21.2% |
| manager | 16 | 8.5% |
| mid_level | 15 | 7.9% |
| **early_career** | **7** | **3.7%** |
| new_grad | 0 | 0% |
| internship | 0 | 0% |

Nearly a third of the catalog is staff+, another 8.5% is management, and **7 jobs in the
entire catalog are early-career**. Zero new-grad, zero internship — despite `new_grad` and
`internship` both being offered as target levels in onboarding, and `early_career` being
the **default** in `DEFAULT_SEARCH_PROFILE`.

This is a supply problem and no scorer change fixes it. A new user taking the defaults is
matched against a catalog containing 7 jobs they could plausibly get. That is the "reel it
back in" instinct, quantified.

**This is the decision that gates everything else in the audit.** Three coherent options:

- **Narrow again** — curate companies and levels back to early-career software, accept a
  small catalog, serve you and your friends well. Cheapest, and the scorer already suits it.
- **Serve both bands honestly** — keep the wide catalog, fix P1-1, and make level a
  first-class, obvious filter rather than a preference buried in onboarding.
- **Follow the catalog** — accept that what you actually built indexes senior/staff roles
  at good companies, and aim it at experienced engineers. Requires rethinking defaults,
  onboarding copy, and the resume-tailoring pitch.

---

## P1-3 — 60% of the funnel is lost on title matching

**Priority 21** (Impact 4, Risk 3, Effort 3)

Funnel for an early-career user, 189 jobs in:

| Stage | Lost |
| --- | --- |
| title matches none of the user's selected roles | **113** |
| disqualified on level/experience | 62 |
| scored below the plausible floor | 0 |
| **kept in feed** | **14** |

Only 2% of jobs (3 of 189) match *no* role option at all — so the catalog is on-topic.
But 60% match none of the **user's selected** roles, because
[the default profile](shared/search-profile.ts:161) picks 4 of 13 roles and title matching
is a binary substring test: full 30 points or zero, [scoring.ts:169](worker/scoring.ts:169).

There is no partial credit for an adjacent role. A "Platform Engineer" posting is invisible
to someone who selected Backend but not Infrastructure, even though the work overlaps
heavily. Nothing in the scorer expresses role *proximity*.

Note also that `containsKeyword` uses plain substring for multi-word keywords
([scoring.ts:366](worker/scoring.ts:366)), so "software engineer" matches "Senior Software
Engineer", "Director, Software Engineering", and "Software Engineering Manager" equally —
title contributes nothing to seniority discrimination, which is what pushes all that
responsibility onto the broken P1-1 path.

---

## P1-4 — Ranking is effectively unsorted

**Priority 21** (Impact 4, Risk 3, Effort 3)

In the widened feed, **43 jobs share only 4 distinct scores**: 22 tied at raw 85, 18 at
raw 75, 2 at 60, 1 at 70.

Every component is a small discrete set — title {0,30}, yoe {0,10,15,25}, location
{0,15,20}, department {0,5,10}, recency {0,3,7,10}. The product presents a ranked feed
with a per-job match percentage, but within the top bucket there is no ordering signal at
all; 22 jobs are genuinely tied and their relative order is whatever SQL returns.

For a product whose core claim is "we rank jobs for you", this is the gap between the
promise and the mechanism.

---

## P1-5 — TPM roles can never match

**Priority 20** (Impact 3, Risk 3, Effort 1) — *cheap fix*

[worker/job-features.ts:81](worker/job-features.ts:81):

```ts
if (/\b(?:manager|director)\b/.test(text) && !/\bproduct manager\b/.test(text)) return "manager";
```

"Technical Program Manager" contains "manager" and is not "product manager", so it
classifies as `seniority: "manager"` — rank 5. An early-career user has
`targetRank + allowance` = 3, so every TPM posting is disqualified.

`technical_program_management` is an **offered role option** in onboarding
([search-profile.ts:70](shared/search-profile.ts:70)). Anyone who selects it gets an
permanently empty feed for that role. The `product manager` carve-out shows the trap was
noticed once but not generalised.

---

## P1-6 — The YOE fallback scans the whole job description for seniority words

**Priority 18** (Impact 3, Risk 2, Effort 2)

[worker/scoring.ts:226](worker/scoring.ts:226):

```ts
const lower = [title, description ?? ""].join("\n").toLowerCase();
const senior = /\b(?:senior|sr\.?|lead)\b/.test(lower);
```

This tests the **entire description**. Ordinary phrasing — "you'll work with senior
engineers", "lead projects end to end", "reports to the Director of Engineering" — flips a
genuine entry-level posting into the senior branch.

Impact is limited because `scoreJobForProfile` discards this function's `disqualified`
flag, so the job is penalised 25 points rather than dropped. But it is live: it is the
fallback whenever the classifier cannot extract `min_years`, which is **259 of 750 jobs
(35%)**. Seniority should be read from the title only, as
[`classifySeniority`](worker/job-features.ts:75) already correctly does.

---

## P1-7 — `SCORE_RAW_MAX = 95` is duplicated in four places, two as magic numbers

**Priority 30** (Impact 2, Risk 4, Effort 1) — *cheap, prevents silent breakage*

| Location | Form |
| --- | --- |
| [worker/scoring.ts:26](worker/scoring.ts:26) | derived from `SCORE_COMPONENT_MAX` |
| [frontend/src/lib/scoring.ts:1](frontend/src/lib/scoring.ts:1) | hardcoded `95` |
| [worker/notification-delivery.ts:48](worker/notification-delivery.ts:48) and `:125` | SQL `* 0.95` |
| [worker/user-job-scores.ts:205](worker/user-job-scores.ts:205) | `Math.min(95, …)` |

The SQL `* 0.95` is a correct but undocumented conversion from the 0–100 threshold scale
to the 0–95 raw scale. Adjust any component maximum — say, giving recency more weight —
and the scorer, the displayed percentage, and the notification threshold silently disagree.
Notifications would fire at the wrong cutoff with no error anywhere.

`shared/` exists for exactly this and currently holds only the search profile.

---

## P1-8 — Three scoring systems are stacked, one of which cannot work at this scale

**Priority 24** (Impact 3, Risk 2, Effort 2) — *cut candidate*

1. `scoreJob` — legacy keyword scorer, [worker/scoring.ts](worker/scoring.ts)
2. `scoreJobForProfile` — recomputes title/yoe/disqualification from `job_features`, reuses
   `base.location_score`, `base.department_score`, `base.recency_score`
3. `shadowScore` + `scorer_rollouts` + `scorer_audits` + `scorerCohortBucket` — a full
   A/B experimentation framework

Layer 2 calls layer 1 and then overrides most of its output, which is why the scorer is
hard to reason about: to know what a job scores you must read both, and know which fields
survive.

Layer 3 is live — `scorer_rollouts` holds one row, `mode='shadow'`, `cohort_percent=100`,
set 2026-06-07. Every scoring run computes a second score and writes `scorer_audits` rows
that nothing reads. With 10 search profiles, an A/B framework cannot reach significance on
anything; it is pure overhead and extra failure surface.

---

## P1-9 — The poller still runs the legacy global scorer on every new job

**Priority 16** (Impact 2, Risk 2, Effort 2) — *cut candidate*

[worker/poller.ts:241](worker/poller.ts:241) scores every newly discovered job with
`scoreJob(job, prefs)`, where `prefs` comes from the **global** `preferences` table
([poller.ts:121](worker/poller.ts:121)) — a single set of role keywords and locations for
the whole installation. The result populates `jobs.score`, `jobs.title_score`, etc.

Those columns are read only as a fallback: `COALESCE(us.score, j.score)`
([routes/jobs.ts:34](worker/routes/jobs.ts:34)). So a user with no `user_job_matches` row
sees a score computed from *someone else's* preferences — the original single-user
configuration. This is the clearest surviving artifact of the personal-tool origin.

Notifications are unaffected: they correctly use per-user `user_job_matches` scores.

---

## P1-10 — Schema archaeology: orphaned and empty tables

**Priority 16** (Impact 2, Risk 2, Effort 2)

`user_job_scores` holds **2250 rows** — more than any other user-scoped table — and is
referenced **only by its own migration** (`0030_user_job_scores.sql`). No worker code reads
or writes it. It is superseded by `user_job_matches` (78 rows).

`profile` holds 1 row and has no code references at all — the original single-user profile.

Five tables now cover preferences/profile: `preferences` (9), `user_preferences` (66),
`user_profiles` (3), `profile` (1), `user_search_profiles` (10). Note **68 users but only
10 search profiles** — 85% of users have never completed onboarding, which is itself worth
understanding.

Twelve tables are empty: `access_attempts`, `account_merge_backups`, `auth_identities`,
`blocked_jobs`, `content_reports`, `email_login_tokens`, `feedback_submissions`,
`notification_candidates`, `notification_deliveries`, `resume_assets`, `tailorings`,
`user_blocked_companies`. Some are transient by design; `auth_identities` being empty while
`auth_sessions` has 23 rows is worth a look in Pass 5.

---

## What Pass 1 did *not* find wrong

Worth stating plainly, because it should not be touched:

- **The notification delivery pipeline is well built.** Per-user scoring, claim-based
  concurrency control with expiry, per-device delivery rows, bounded retries, dead-token
  cleanup for both APNs and web push. [worker/notification-delivery.ts](worker/notification-delivery.ts)
  is the strongest code in the repo.
- **The poller's job-closure logic is careful** — `responseLooksComplete` guards against
  closing jobs on a partial response, and closed jobs are preserved when a user has applied
  or saved them.
- **CORS and security headers are correctly restrictive**, with a comment explaining why
  credentialed CORS must not reflect arbitrary origins ([worker/index.ts:31](worker/index.ts:31)).
- **`parseExperienceRequirement` is genuinely good** — it requires a requirement cue rather
  than grabbing any "N years" from the text, with the "founded 3 years ago" trap called out
  in a comment.

## Product decision — confirmed

- **Audience direction (confirmed 2026-07-26).** Pinkslip now serves one fixed
  new-grad/early-career band, with postings requiring more than three years and senior/staff/
  management titles filtered out. This matches the original audience and removes the broken
  level selector.

## Pass 1 priority order

| # | Finding | Pri | Effort |
| --- | --- | --- | --- |
| P1-1 | Seniority filter is one-sided; widening removes the floor | 40 | low |
| P1-7 | `95` duplicated 4× incl. two magic numbers | 30 | low |
| P1-8 | Three stacked scorers; A/B framework at 10 users | 24 | low |
| P1-3 | 60% of funnel lost on binary title matching | 21 | med |
| P1-4 | Ranking effectively unsorted (22-way ties) | 21 | med |
| P1-2 | Catalog has 7 early-career jobs | 20 | high |
| P1-5 | TPM roles structurally unreachable | 20 | trivial |
| P1-6 | YOE fallback scans description for seniority | 18 | low |
| P1-9 | Poller runs legacy global scorer | 16 | low |
| P1-10 | Orphaned tables (`user_job_scores`, `profile`) | 16 | low |

---

# Pass 2 — UX walkthrough

Walked the running app at 375×812 (its target size), from cold onboarding through to the feed.

**Start from what's good, because it should not be disturbed.** The visual craft is high and
consistent: the design-token discipline in `app.css` is real and adhered to, empty states are
genuinely helpful (Tracker's "No applications yet" names both paths forward), the feed carries
an honest **"data may be stale · updated 2mo ago"** warning, and the iOS-style push/pop
transitions are smooth. This is not a UI that needs redesigning. The problems below are
structural and product-level, not craft.

## U-1 — Onboarding de-emphasises its two most valuable actions

Seven steps: name → roles → level → location → preview → **push** → **account**.

The last two steps each present the valuable action as the *quiet* option:

| Step | Valuable action | How it's styled | Escape hatch | How it's styled |
| --- | --- | --- | --- | --- |
| 6 | "Enable" push | small secondary outline | "Continue" | **full-width primary** |
| 7 | "Send link" | greyed, disabled until typing | "Maybe later — keep using as guest" | full-width bordered |

The production funnel matches the hierarchy exactly:

| | Users | Share |
| --- | --- | --- |
| completed onboarding | 64 | 2.8% |
| enabled push | 10 | 0.4% |
| created a real account | **2** | **0.09%** |

Step 1 also asks for your **name** before showing any value, and blocks on a network round-trip
(`api.me.update`) before advancing. It is the highest-friction possible placement for the
lowest-value field in the flow.

## U-2 — "Levels to include" promises a set; the code applies a ceiling

Step 3 is headed *"Add your real experience, then choose the levels you want us to include"* and
renders as a multi-select checklist. That is unambiguous set-membership language.

Verified live: with **2 years experience**, **Early career + Senior** ticked, and Balanced
tolerance, the preview's top four results were **`staff_plus`** roles scoring 89 —

> Member of Technical Staff – X Core Product · Member of Technical Staff - X Money ·
> Member of Technical Staff – Web Engineering

`classifyJob("Member of Technical Staff – X Core Product")` returns `seniority: "staff_plus"`,
confirmed directly. This is P1-1 reaching the user's screen on their first impression of the
product. The screen where a user tells pinkslip what they want is the screen that breaks it.

## U-3 — The feed is one company

`GET /api/jobs?limit=100` returned 43 jobs from **6 companies**, of which **xAI 26 and
Anthropic 13 — 90% from two**. The remaining four companies contribute one job each. On screen
the first seven rows are all xAI.

The mechanism chains three findings: scores are coarse (P1-4) → massive ties → the tiebreak is
`first_seen_at` → the poller inserts each company's jobs in one batch, so a company's postings
share near-identical timestamps and sort as a block. Whichever company was polled most recently
owns the feed.

The onboarding preview has the same query shape
([routes/preferences.ts:50](worker/routes/preferences.ts:50), `ORDER BY ujm.score DESC,
datetime(j.first_seen_at) DESC LIMIT 5`) with no diversity rule, which is why a new user's
"starting line" was five xAI jobs.

## U-4 — The match labels explain nothing

The preview says *"The labels explain why each one made the cut."* Every row in both the preview
and the feed showed the identical pair:

> **Software role · Onsite US**

`buildReasons` ([user-job-scores.ts:82](worker/user-job-scores.ts:82)) can emit level and
years-of-experience reasons, but with `min_years` null and specialties identical across results,
every job in a same-role feed produces the same two chips. They occupy a full line per row and
carry no differentiating information — the one place the product could explain its ranking, and
it doesn't.

## U-5 — Score ties are visible to the user

43 jobs resolve to **4 distinct raw scores** — 19 at 70, 14 at 60, 6 at 75, 4 at 85. On screen
that is four consecutive rows badged **89**, then two badged **79**. The badge presents itself as
a precise match percentage while being, in practice, a four-value bucket.

## U-6 — An offered role that can never match

Onboarding offers **Technical Program Management** as a target role. Verified:
`classifyJob("Technical Program Manager")` → `seniority: "manager"` (rank 5), so it is
disqualified for every user below staff level. Selecting it produces a permanently empty feed.
(P1-5.)

## U-7 — Minor: inconsistent `aria-pressed`

Role cards set `aria-pressed` correctly
([SearchProfileFields.svelte:109](frontend/src/components/SearchProfileFields.svelte:109)), but
the "Primary role" chips immediately below use only `class:active` with no ARIA state
([:123](frontend/src/components/SearchProfileFields.svelte:123)), so the selected primary role
isn't announced.

## U-8 — `bun run dev` cannot run without Cloudflare auth

The documented local dev command fails outright:

> You must be logged in to use wrangler dev in remote mode.

`[[send_email]] remote = true` in [wrangler.toml](wrangler.toml) forces a remote proxy session,
so an unauthenticated clone — or the author on a fresh machine — cannot start the app.
`wrangler dev --local` works. Nothing documents this.

# Pass 3 — Architecture & data model

## A-1 — Timestamps are stored as ISO strings and queried through `datetime()`

Covered under P0-1 as the cron's root cause, but it is fundamentally an architecture issue:
**40 occurrences** of `datetime(<column>)` across the worker, each defeating any index on that
column. `idx_jobs_first_seen` exists and is never usable.

The columns are written with `toISOString()`, so lexicographic ordering already equals
chronological ordering. The `datetime()` wrapper buys nothing and costs every index.

## A-2 — Five tables model preferences and profile

`preferences` (global k/v), `user_preferences` (per-user k/v), `user_profiles`,
`user_search_profiles`, and `profile` (1 row, **no code references at all** — the original
single-user table).

Worse, `saveUserPreferenceState` ([user-preferences.ts:233](worker/user-preferences.ts:233))
writes the *same* profile to **both** `user_search_profiles` and, denormalised into seven
separate k/v rows, `user_preferences` — `search_profile`, `notify_threshold`, `locations`,
`min_yoe`, `max_yoe`, `role_keywords`, `negative_keywords`. Two sources of truth kept in sync
by hand on every write.

## A-3 — `user_job_scores` is an orphaned table with 2,250 rows

Created by `0030_user_job_scores.sql`, referenced by nothing in the worker, superseded by
`user_job_matches`. It is the second-largest user-scoped table in the local snapshot.

## A-4 — One company, one source

Documented honestly in [ATS_INTEGRATION_ROADMAP.md](ATS_INTEGRATION_ROADMAP.md), so this is a
known limit rather than a discovery: `companies` carries a single `ats_type`/`ats_slug`, and a
job is unique only by `(company_id, external_id)`. It cannot represent a company that changed
ATS, appears on two boards, or paginates. **P0-3's 33 dead slugs are the first bill for this** —
there is no way to record "this company moved to a different board" other than editing the row.

## A-5 — Schema integrity is *better* than expected

Worth recording because I went looking for a problem and there isn't one: 48 `REFERENCES`
declarations, **44 with `ON DELETE CASCADE`**, and production confirms `PRAGMA foreign_keys = 1`
with **zero orphaned rows** in the two joins I checked. D1 enforces them. This is solid.

---

# Pass 4 — Code quality & bloat

## C-1 — Eight genuinely dead exports

Referenced nowhere, including inside their own file:

| File | Symbol |
| --- | --- |
| [worker/auth.ts](worker/auth.ts) | `buildClearedCookie`, **`revokeAllSessionsForUser`** |
| [worker/user-preferences.ts](worker/user-preferences.ts) | `loadUserScoringPrefs`, `completeOnboarding` |
| [worker/us-jobs.ts](worker/us-jobs.ts) | `isUsJobListing` |
| [frontend/src/lib/local-tailor.ts](frontend/src/lib/local-tailor.ts) | `clearLocalTailorDraft` |
| [frontend/src/lib/native-auth.ts](frontend/src/lib/native-auth.ts) | `isMagicLinkUrl` |
| [frontend/src/lib/job-content.ts](frontend/src/lib/job-content.ts) | `parseJobDescription` |

`revokeAllSessionsForUser` is the notable one — the capability to sign out everywhere exists
and is wired to nothing.

## C-2 — Eighteen over-exported internals

Used only inside their defining module but exported anyway; `worker/auth.ts` alone exports six
(`parseCookie`, `generateSessionId`, `ensureUserExists`, `getUserRole`, `loadActiveSession`,
`createSession`, `revokeSession`). Widens the refactor surface for no benefit.

## C-3 — `worker/routes/tailor.ts` is 917 lines and contains schema DDL

The largest file in the repo. It runs `CREATE TABLE IF NOT EXISTS tailor_usage` and two
`CREATE INDEX` statements **inside a request handler**
([tailor.ts:177](worker/routes/tailor.ts:177)) — runtime DDL on the hot path, and a table that
lives outside the 43-migration system that governs every other table.

## C-4 — Score constants duplicated four ways

See P1-7. `shared/` exists for exactly this and holds only the search profile.

## C-5 — Documentation rot

- **No root README.** The repo's entry point is undocumented.
- [frontend/CLAUDE.md](frontend/CLAUDE.md) states *"`vitest.config.ts` at the root is legacy and
  unused"* — **the file does not exist.**
- [frontend/CLAUDE.md](frontend/CLAUDE.md) carries a long correction about a previous wrong
  version of itself, which is history rather than instruction.
- Nothing documents that `bun run dev` requires Cloudflare auth (U-8).

## C-6 — Frontend build quality is good

Checked for bloat and did not find it. The heavy PDF machinery (`pdfjs-dist` 2.2 MB worker,
`pdf-lib`) is correctly behind dynamic `import()` in
[pdf-to-profile.ts](frontend/src/lib/pdf-to-profile.ts),
[local-tailor.ts](frontend/src/lib/local-tailor.ts) and
[pdf-resume.ts](frontend/src/lib/pdf-resume.ts); the only static reference is an
`import type`, which erases. `svelte-check` is clean across 849 files. The design-token
discipline described in `frontend/CLAUDE.md` is genuinely followed.

---

# Pass 5 — Correctness, security & reliability

## S-1 — The per-user LLM rate limit is trivially bypassable

[tailor.ts:38](worker/routes/tailor.ts:38) sets `APP_USER_DAILY_LIMIT = 15` per user per UTC
day, "incl. guests". But [auth.ts:300](worker/auth.ts:300) calls `createGuestSession(c.env.DB)`
— minting a **new `users` row** — for any request arriving without a valid session cookie.

Dropping the cookie yields a fresh identity and a fresh 15-request budget. The only real
backstop on a **paid LLM endpoint** is `APP_GLOBAL_DAILY_FALLBACK = 1000`, which is a
denial-of-wallet ceiling rather than an abuse control. The quota should key on something an
anonymous caller cannot mint at will (IP, or require a real account for tailoring).

## S-2 — Eager guest-user creation inflates everything

The same line explains **2,294 users against 429 sessions and 2 real identities**. A `users` row
is written for every cookie-less request — bots, crawlers, link previews, health checks. It
makes every funnel metric meaningless and turns read traffic into write traffic.

## S-3 — Failures are structurally invisible

Three independent instances of the same pattern — the system knows something is broken and
tells nobody:

| Signal | Recorded in | Surfaced |
| --- | --- | --- |
| Cron dying for 6 weeks | `fetch_runs.status = 'running'` | nowhere — Worker reports `outcome: "ok"` |
| 33 companies 404ing every poll | `companies.last_poll_error` | nowhere |
| Notifications never delivered | `notification_candidates.status` | nowhere |

[index.ts:271](worker/index.ts:271) catching the cron rejection is what makes P0-1 invisible in
Cloudflare's dashboard. Whatever else changes, that `.catch()` should rethrow or set a failure
signal.

## S-4 — Security fundamentals are sound

Reviewed and found correct: credentialed CORS restricted to an explicit origin allowlist with a
comment explaining why reflection is unsafe ([index.ts:31](worker/index.ts:31)); a strict CSP,
`X-Frame-Options: DENY` and `nosniff` on all Worker responses; IP-based rate limiting with
lockout on the access-code endpoint; bearer tokens rejected unless the user has a real sign-in
identity, with a comment explaining the privilege-escalation path that closes
([auth.ts:266](worker/auth.ts:266)); the favicon proxy deliberately preventing Google from
learning which companies a user browses ([index.ts:179](worker/index.ts:179)). All SQL uses
bound parameters; the only interpolation builds `?` placeholder lists.

---

# Pass 6 — Testing & ops

## T-1 — 4,162 lines of route code, one route file tested

Only `tests/push-apns.test.ts` imports from `worker/routes/`. The other **14 route files —
including `tailor.ts` (917 LOC, 15 handlers), `jobs.ts` (621), `auth.ts` (475, 16 handlers) and
`interactions.ts` (355, 24 handlers) — have no test that exercises a handler.**

The 153 passing tests cover adapters, scoring, and pure helpers well. They cover no HTTP
behaviour, no auth boundary, and no SQL. **Every P0 in this audit lives in untested code.**

## T-2 — No CI

No `.github/` at all. Nothing runs `bun test`, `tsc`, or `svelte-check` on push. Which is why:

## T-3 — The root typecheck is red and nobody knew

39 errors, all from [tests/salary-format.test.ts:2](tests/salary-format.test.ts:2) importing
DOM-using frontend code into the Worker tsconfig project. The config
[already excludes `resume-export.test.ts`](tsconfig.json) for this exact reason, with a comment.
This file was missed. One-line fix; six weeks unnoticed.

## T-4 — Stale toolchain and model pins

| Item | Current | Note |
| --- | --- | --- |
| `compatibility_date` | **2024-12-01** | ~20 months old |
| `DEFAULT_ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | superseded by the Claude 5 family |
| wrangler | 4.98.0 | 4.114.0 available |
| Capacitor | 6.x | 7.x available |

## T-5 — The minimum gate that would have caught all of this

In priority order, each cheap:

1. **A CI workflow** running `bun test`, `bunx tsc --noEmit`, and `bun run check`. Catches T-3.
2. **Make the cron fail loudly** — rethrow in the `scheduled` catch, or write a `fetch_runs`
   error row. Catches P0-1 on day one instead of week six.
3. **One integration test per route file** hitting the Hono app with a real D1 binding.
4. **A weekly digest** of `companies.last_poll_status = 'error'` and notification send rate.

---

# Repair status

The initial reliability repair was verified on 2026-07-26 with **161 tests passing**, clean
Worker TypeScript, clean `svelte-check`, a successful production frontend build, and local
application of migrations 0045–0047.

Deployed as Worker version `0f084ff0-f859-465e-9522-14e2ba024fe2`. The first production cron
completed end-to-end in **51.7 seconds** at 17:46:23: it closed its `fetch_runs` row, reaped
the previous stuck runs, disabled shadow scoring, and reduced the closed-job purge backlog
from 13,447 to 13,347—exactly the configured 100-row batch—with no D1 reset. The run's
application status is `error` because 34 company sources still failed, not because the cron
itself was interrupted. The deployed site returned HTTP 200 in the final smoke test.

| Finding | Local status |
| --- | --- |
| P0-1 / S-3 | Fixed: indexed ISO comparisons, bounded backlog and purge, reverse FK indexes, stale-run reaping, failures rethrown |
| P0-2 diagnostics | Fixed: dead-token cause survives the subscription cascade instead of becoming “No registered push subscription” |
| P1-1 / P1-2 | Confirmed and implemented as a fixed new-grad/early-career product band |
| P1-5 | Fixed and regression-tested: Technical Program Manager is no longer classified as a people manager |
| P1-7 | Fixed: one shared raw-score maximum and threshold scale for Worker SQL and frontend display |
| P1-8 | Disabled by migration: the unused 100%-shadow scorer no longer doubles match writes |
| T-2 / T-3 | Fixed: CI added and root typecheck restored |

## Follow-up completion

After the audience decision was confirmed, the non-ingestion roadmap was completed locally on
2026-07-26. The final gate has **169 tests passing**, clean Worker TypeScript, zero Svelte
diagnostics, a successful production frontend build and Worker dry run, and both in-place and
from-scratch application of the complete 47-migration history.

| Finding | Follow-up status |
| --- | --- |
| U-1 / S-2 | Fixed: onboarding is five focused steps, identity is created lazily on the first meaningful write, push and account CTAs have clear hierarchy, and passive traffic no longer inflates users |
| U-3 / P1-3 / P1-4 | Fixed: role affinity, explicit experience signals, smooth recency, stable score ordering, and company-diverse first screens |
| S-1 | Fixed: app-funded tailoring requires an authenticated account; guests can still use their own provider key |
| A-2 / A-3 | Fixed: typed search profiles are canonical on write, legacy preferences are import-only, and abandoned scoring/profile tables are dropped by migration 0048 |
| C-1 through C-5 | Fixed: dead exports removed, tailoring split into provider/usage modules, score constants shared, local development documented, and local email simulated |
| T-1 through T-4 | Improved: auth/preferences/push/tailoring boundaries have route or focused regression tests, CI and a root check command are present, and the Worker compatibility baseline is current |
| P0-3 / A-4 | Parked by explicit product decision: repairing sources, adding catalog supply, and redesigning company-to-source ingestion remain part of the later polling workstream |

The follow-up changes have not been deployed. The Worker version above refers only to the
initial reliability repair.
