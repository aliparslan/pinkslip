# The ticket's visa and experience facts, measured (2026-11-10)

A job's ticket said Experience "Not listed" and Visa sponsorship "Not listed"
on a posting that states "2–4 years" and "Visa sponsorship is not offered for
this role". This is how often that happens, what was built for the visa fact,
and what is left for you to decide on experience.

Nothing here is switched on or deployed. The postings and labels
are in `docs/superpowers/job-facts-2026-11-10/`, which git ignores, because
they are other people's text.

## What to decide

1. **Turn on the wider visa reading.** It is built and off
   (`WIDER_SPONSORSHIP_PATTERNS` in `worker/sponsorship.ts`). Turning it on
   means that switch, a bump of `JOB_CLASSIFIER_VERSION` and `MATCHER_VERSION`
   in the same commit, and a backend deploy. Roughly twice as many jobs would
   then say "won't sponsor" and leave the feed of people who need it.
2. **Jobs that need a U.S. person.** One open job in eight asks for a U.S.
   citizen, permanent resident or a clearance, and almost none are held back
   from someone who needs sponsorship. Nothing is built for this.
3. **What a row says when the posting gives no years.** One open job in five
   reads "1–3 yrs" with no number behind it. Design call, so Paper first.
4. **Three shapes the years reader misses.** Small, but they move jobs between
   stages, so they need their own labelled check and a switch.

## Visa sponsorship

### Today

Of 15,827 open jobs, the five original patterns mark 264 "won't sponsor" and
208 "sponsors". About 1,600 postings mention sponsorship at all.

In Your search, "I'll need sponsorship" removes only jobs marked "won't
sponsor". So every miss is a job shown to someone who can't take it.

### The samples

All drawn from the live database, read-only, and labelled by hand before the
reading under test was run on them. One person labelled them (the assistant),
so treat the numbers as estimates.

| Sample | Postings | What it is |
| --- | --- | --- |
| A | 300 + 200 | 300 that mention sponsorship, visas or work authorization, and 200 random open jobs |
| B | 400 | More that mention it, drawn after the patterns were written. 125 use wording not in A |
| C | 300 | Drawn after the last pattern change. 80 use wording not in A or B |

Labels: **no** (won't sponsor, or the applicant must not need it), **yes**,
**maybe** ("for some roles", "transfers only", "may be available"), **U.S.
person** (citizen, permanent resident or clearance required) and **none**
(company-sponsored perks, Visa the company, a plain "authorized to work").
Only no and yes should produce a fact.

### Results

"Found" is how many labelled postings got the fact. "Right" is how many of
the answers given were correct. A wrong "no" is the costly one: it hides a job
from someone who could have had it.

| | Today: no | Today: yes | Wider: no | Wider: yes |
| --- | --- | --- | --- | --- |
| A, all that mention it | found 35 of 71, right 35 of 37 | found 25 of 49, right 25 of 26 | (written from half of these) | |
| A, 200 random | found 2 of 5 | found 3 of 5 | found 5 of 5, right 5 of 5 | found 5 of 5, right 5 of 5 |
| B, unseen wording | found 8 of 42, right 8 of 8 | found 1 of 11 | found 40 of 42, right 40 of 41 | found 6 of 11, right 6 of 6 |
| C, unseen wording | found 6 of 22, right 6 of 7 | found 1 of 10 | found 21 of 22, right 21 of 22 | found 10 of 10, right 10 of 10 |

C is the fair test: nothing changed after it. On the 190 random postings in
A with no position stated, the wider reading said nothing.

Across the three samples today's patterns find 103 of 227 "won't sponsor"
postings, which is where "roughly twice as many" comes from.

### What the scoring caught along the way

- The first run on A's held-out companies had two wrong answers. "Does not
  offer" didn't match because of a slip in the pattern, so a "we do not offer
  … sponsorship" sentence read as an offer. Fixed, then re-run.
- B turned up four things, all fixed before C was drawn: a sentence starting
  "All candidates must…" was read as a hedge; "no sponsorship or transfers"
  was read as partial; a benefits line ("Visa sponsorship and green card
  support") wasn't read as a yes; and "we take H-1B transfers" said without
  the word "sponsor" didn't soften a later "no new visas".

### Still wrong

- "Authorized to work in the U.S. now and in the future" means no, without
  the word. Left alone: too easy to misread.
- A posting with a plain no and a line about remote roles stays unknown.
- An internship that won't sponsor, whose full-time role afterwards will,
  reads as no. I labelled it maybe.
- "Is supportive of immigration sponsorship for this role" isn't read as yes.

### How it reads a posting

Sentence by sentence, only sentences with "sponsor" in them:

- A **won't** sentence that covers only part of the ground ("for every role",
  "roles outside engineering", "we take transfers but…") decides nothing.
- A **may** sentence decides nothing.
- A no and a yes in the same posting decide nothing.
- Export licences can be "sponsored" too; those sentences are skipped.

## U.S. person, citizen or clearance

In sample A, 82 postings require a U.S. person, a citizen or a clearance: 25
of the 200 random ones. The clearance flag is on for 6 of the 82.

These are mostly space and defence employers quoting export rules. Someone on
a student or work visa usually can't take them, and today they all show.
Whether they should leave that person's feed, or just say so on the ticket,
is your call. Nothing is built.

## Experience

Not changed. The years reader is long and careful, and any change moves jobs
between career stages, so it gets its own labelled check first.

### What the 200 random postings show

| | Postings |
| --- | --- |
| Years known | 146 |
| Years unknown | 54 |
| …of which the text states a number | 7 |

I didn't check the 146 known ones for wrong numbers.

The seven:

- **The reader's gaps (2).** "4 years of software engineering or related
  experience" (only a short list of words may sit between "years of" and
  "experience"), and "MS or PhD … or equivalent experience with 12+ years".
- **The shape from the phone.** "2–4 years … and a bachelor's or master's
  degree" is read as two routes, bachelor's with 2–4 years or a master's with
  none, and the easier route wins.
- **Under a heading the reader treats as optional (5).** Three under
  "Preferred Qualifications" (one says 20+ years, one 10+), one under
  "Ideally, you have", one under "Desirable skills". Two of those employers
  use that heading for their whole requirements list. This is the reader
  working as designed; whether it should is a policy question.

### "1–3 yrs" with nothing behind it

A title with no level word and a posting with no stated years is filed as
early career. Its row then reads "1–3 yrs" and its ticket "Early career".

In the random 200 that is 40 postings, one in five, and one of the 40 has
junior, associate or early career in its title. The rest are plain titles
such as "Software Engineer" at employers that don't publish levels, and a
"CPU Performance Architect" whose preferred experience is 20+ years.

The ticket's Experience line reads "Not listed" for these, correctly. The row
is the part that says more than the posting does.

## Run it again

```sh
bun scripts/benchmarks/job_facts.ts docs/superpowers/job-facts-2026-11-10 --misses          # today
bun scripts/benchmarks/job_facts.ts docs/superpowers/job-facts-2026-11-10 --wider --misses  # the wider reading
bun scripts/benchmarks/job_facts.ts docs/superpowers/job-facts-2026-11-10/fresh --wider --misses  # sample B
bun scripts/benchmarks/job_facts.ts docs/superpowers/job-facts-2026-11-10/third --wider --misses  # sample C
```

In B and C the script's "held-out companies" line is the unseen wording.

`labels-frozen.json` in that folder holds each label file's hash from before
it was scored.
