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

## Recommendation

1. Stop hiding the 4,800, by deciding visibility from the stored date alone. It's the
   largest gain and adds no new kind of job.
2. Use `first_published` for Greenhouse, with a backfill. Ship this with (1): alone,
   it would age out most of Greenhouse.
3. Raise the first-sight limit from 30 days to 90. That adds about 1,000 jobs on these
   boards. Past 90, more of the companies have stopped posting and the evidence gets
   thinner, so wait for outcomes.

Before any of it reaches people:

- Keep it switched off on `main`, since other sessions deploy `main`.
- Older postings must not go out as new-job alerts. The `evergreen` flag is passed to
  the alert check, but that it blocks these needs testing.
- Feed labels such as "New today" will change for Greenhouse once dates are real.
- Re-measure applications and responses by age after a few weeks.
