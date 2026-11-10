# What the 30-day age rule costs (2026-11-09)

A measurement. Nothing was changed.

## How the rule works

`MAX_POSTED_AGE_DAYS` (`shared/job-policy.ts`) rejects a posting that is 30 or more
days old **the first time Pinkslip sees it**. A posting admitted while fresh stays for
as long as the board lists it (the `evergreen` flag). So a job first seen on day 29
can stay for a year, and the same job first seen on day 30 is never admitted. In
practice the rule falls on companies that were just added, whose whole backlog is
old on the first poll.

Half the open catalog is already past 30 days: 7,896 of 15,764 open jobs.

## What was measured

All 841 enabled Ashby, Lever and Greenhouse boards were read live through Pinkslip's
own adapters (one board failed). Each posting went through the real gate twice, once
as it stands and once with its age ignored. Workday, Amazon, Apple, Google, Meta and
YC weren't read, so the totals below understate the whole catalog.

The earlier figure of about 11,500 came from `source_job_decisions`, which is never
pruned and so includes postings that have since come down. The live numbers below
replace it.

## What each cutoff would add

Age-rejected postings still listed and not in the catalog: 3,442. With age ignored,
2,491 pass every other gate, at 466 companies. The rest fail on seniority (900),
clearance (47) or have no description (4).

| Posting age | Would be added | Running total | At a company that posted in the last 30 days |
|---|---|---|---|
| 30–44 days | 309 | 309 | 95% |
| 45–59 days | 297 | 606 | 95% |
| 60–89 days | 409 | 1,015 | 96% |
| 90–179 days | 662 | 1,677 | 88% |
| 180+ days | 814 | 2,491 | 86% |

About 5% of the 2,491 have entry-level-looking titles (118) and a third say Senior,
Staff, Principal or Lead (846). This mostly helps mid-career people, not new grads.

## Reading a sample

80 of them were read by hand, 16 per age group, drawn at random. None was visibly
dead: no past cohort in a title, no passed deadline, no standing-pipeline post.
Eleven weren't software roles and seven were borderline, the same leak measured in
the current catalog (15%, `docs/filter-eval-2026-11-09.md`), and it didn't vary with
age.

## What this can't show

Whether a listed role is still being filled. Nothing on our side can see that.

- Closed jobs are deleted after 7 days (`worker/poller.ts`), so `jobs` only holds
  survivors and can't give an honest closing rate.
- Only 7 applications in Pinkslip went to postings 30 or more days old, against 464
  to fresher ones, so outcomes by age can't be compared yet.

## Two faults found along the way

**About 4,800 tracked jobs are hidden by accident.** They're open, listed at the last
poll, older than 30 days, and not flagged evergreen, so the feed's query drops them.
1,004 are already matched to someone.

| Source | Hidden |
|---|---|
| Greenhouse | 2,607 |
| Apple | 679 |
| Workday | 534 |
| Google | 456 |
| YC | 355 |
| Meta | 138 |
| Ashby | 47 |

The flag is worked out from the date on the latest listing, but the feed filters on
the date stored at first sight. Greenhouse's listing date keeps moving, and some
sources send no date in their list, so the two disagree. The code's stated policy is
that a still-listed posting stays visible.

**Greenhouse's posted date is its last edit.** The adapter uses `updated_at`. The API
also has `first_published`. Of 3,766 Greenhouse postings that look under 30 days old,
2,727 (72%) were first published 30 or more days ago, and 1,446 of those 90 or more.
In the catalog, 3,759 Greenhouse jobs look fresh and 1,037 really are. This breaks the
rule that only a source's real posting date goes in `postedAt`.

## What the owner decided (2026-11-09)

The first recommendation here was to unhide the 4,800 and raise the limit to 90 days.
The owner's objection: at most companies, applying after 30 days rarely helps, because
the early applicants fill the role. Startups are the exception. So:

- The 30-day limit stays, and the 90-day idea is dropped.
- The 4,800 stay hidden for now.
- Greenhouse moves to its real date.
- Older jobs from startups may stay up.

At least 4,000 of the 10,945 jobs people can see today are really over 30 days old:
3,008 kept because the board still lists them, and 999 more that Greenhouse's date
shows as recent.

On 2026-11-10 the owner chose the smaller plan instead of hiding those older jobs:
the feed is newest first, so older jobs only reach someone who has run out of fresh
ones. So: Greenhouse gets its real date, the hidden jobs stay hidden, older jobs
that are still listed stay at the bottom, and there's no startup list for now.
Revisit hiding after launch, once there are numbers on how often people reach older
jobs and whether those applications get answers.

## What the change needs

- **The Greenhouse date can't ship alone.** A real date makes a Greenhouse job count
  as old but still listed, which is what sets the `evergreen` flag and makes it
  visible. The 2,607 hidden Greenhouse jobs would appear. The rule for older jobs has
  to change in the same step.
- **There's no reliable way to tell a startup yet.** `companies` has no size. Size is
  known for 92 of 849 companies with open jobs, and 199 are on a fund list. A small
  job count doesn't work: it catches Lyft, Jump Trading and BNY.
- Sorting older jobs last costs nothing: the feed already orders newest first by date.
- Keep it switched off on `main`, since other sessions deploy `main`.
- Older postings must not go out as new-job alerts. The `evergreen` flag is passed to
  the alert check, but that it blocks these needs testing.
- Feed labels such as "New today" will change for Greenhouse once dates are real.
- Re-measure applications and responses by age after a few weeks.

## What was built (2026-11-10)

All of it sits behind one switch, `REAL_POSTED_DATES_FROM` in `shared/job-policy.ts`,
which is off. Turned on, it's set to the moment it goes on, and:

- Greenhouse postings carry `first_published`. One without it stores no date and
  reads "Found", as the posted-dates rule says.
- On each poll, a Greenhouse job already in the catalog moves to that date.
- A job that had aged out of the window before that moment, and wasn't being kept,
  stays hidden (`keepsPastWindow`). A job that ages out later is kept at the bottom
  as before. This applies to every source, so the whole set of about 4,800 stays
  hidden, not just Greenhouse's share.
- The first-sight gate now sees the real date, so an old Greenhouse posting that was
  edited recently is no longer added as new.

Older jobs already never go out as new-job alerts or Apply for me prompts. Alerts
are only made for jobs being added, and delivery and the strong-match check both
turn away a posting 30 or more days old. The poller test checks that moving dates
queues no alerts, and `tests/apply-asks.test.ts` checks the send side.

### Dry run against production

All 293 enabled Greenhouse boards were read and the change was replayed over two
polls on the stored rows. Nothing was written.

| | Today | After two polls |
|---|---|---|
| Visible Greenhouse jobs | 3,198 | 3,194 (5 have left their boards) |
| Hidden Greenhouse jobs | 2,601 | 2,600, none brought back (2,600 would come back without the hold) |
| Looked new, really 30+ days | 1,284 | Move into the older part of the feed |
| Under 48 hours old ("New") | 170 | 99 |

Five postings have no `first_published` (four at one company, one standing
requisition); they would read "Found".

**What it stops.** Of 2,155 Greenhouse jobs first seen in the last 14 days and still
listed, 1,235 (57%) had been published 30 or more days before Pinkslip saw them, so
the real date would not have added them. Over those 14 days, 319 of these jobs went
out as new-job alerts. 148 of them (46%) were already over 30 days old, and they
account for 456 of the 839 alerts sent.

### To turn it on

1. Set `REAL_POSTED_DATES_FROM` to the current time and deploy the Worker from `main`.
2. In the same change, stop calling a Greenhouse date "Updated", and drop the extra
   "Discovered" line (`packages/core/src/job-timing.ts`, the stub in
   `apps/native/src/features/redesign/job-facts.ts`). The website gets it with its
   deploy. The iOS app needs an update, so it waits until App Review is done. Until
   then, iOS calls the first-published date "Updated".
3. After a day, check that the hidden count hasn't moved and that Greenhouse's
   share of new-job alerts drops.
