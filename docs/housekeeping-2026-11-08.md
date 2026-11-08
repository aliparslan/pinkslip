# Housekeeping (2026-11-08)

Findings came from production D1, read-only, and every board and domain below
was checked on 2026-11-08.

**Deployed 2026-11-08:** API Worker `44a1690e`, web Worker `0dfd62fb`, migrations
0112 to 0114, and 243 logos in the R2 bucket `pinkslip-logos`. Jev is unchanged.

## 1. Failing sources

15 sources were quarantined and none had open jobs. A 16th, Commonwealth Fusion
Systems, had one timeout and needs nothing.

Migration `0112_source_repair_2026_11.sql`:

| Source | Was | Now | Jobs (US) |
|---|---|---|---|
| Autodesk | Workday `Ext` (4 jobs, none US) | Eightfold | 308 (74) |
| CrowdStrike | Greenhouse | Workday | 198 |
| Hudson River Trading | Greenhouse `hudsonrivertrading` | Greenhouse `wehrtyou` | 83 |
| Hugging Face | Greenhouse | Workable (new adapter) | 6 (3) |
| Mistral AI | Ashby `mistral` | Ashby `mistral.ai` | 235 |
| Old Mission Capital | Greenhouse | Ashby | 38 |
| Prisma | Greenhouse | Rippling | 2, both general applications |
| Retool | Ashby | Gem | 25 |
| Slingshot Aerospace | Greenhouse | Ashby | 3 |
| Two Sigma | Greenhouse | Avature (new adapter) | 66 (56) |

Retired, disabled rather than deleted: Deno (joining Cloudflare), Ona (part of
OpenAI), Levels (careers are a Notion page), Decart (no board found), Shopify
(its roles are on Ashby with the public API off; they'd need a scraper for
shopify.com/careers).

Avature and Workable were tested from this machine only. Two Sigma's site could
treat Cloudflare's network differently, so check its first poll after deploying.

## 2. Logos

Google's favicon is the only source today. Of 1,061 enabled companies, 115 had
no website and so showed initials, 27 got no favicon, and 132 got one under 64px.

- Migration `0113_company_websites_2026_11.sql` fills 112 websites. Each domain
  was opened and its title compared. Same-name cases were checked against the
  postings or the Ashby board's own website field, which changed Causal to
  causallabs.ai and Mem to mem0.ai.
- Axiom and Sweep have no open jobs and no way to confirm which company they
  are, so they stay blank. GOAT's only icon is a solid black square, so it stays
  on initials.
- `/api/v2/logo` and `/api/v2/logo/shape` now look in R2 (`LOGO_BUCKET`, key
  `logos/<domain>.png`) before Google, so neither app changes.
- 243 replacements, sourced from Y Combinator's logo field (148), official
  GitHub org avatars checked against the org's website (46), and the companies'
  own site icons (49). SpaceX uses the mark from x.ai, which merged into it and
  now goes by SpaceXSI.
- Still low-res, nothing better found: Saronic, Hadrian, Wing, Five Rings,
  Belvedere Trading, Coalition, Current, Relay, Flatiron Health.

Devices cache logos for up to a week, so replaced ones arrive gradually.
Companies that had no logo show theirs right away.

## 3. Reported and problem postings

### Open reports

| Report | Finding |
|---|---|
| Snowflake, Data Engineer: "location is in india" | Correct. `IN-Pune` read as Indiana. Fixed in `worker/us-jobs.ts`. |
| Betterment: "Just a test" (Nov 8) | Looks like a test, not a real report. |

### The location filter, `worker/us-jobs.ts`

Two bugs, both fixed, with tests:

- **Foreign jobs let in.** Snowflake writes the country first (`IN-Pune`,
  `CA-Ontario-Toronto`, `DE-Berlin`, `IL-Israel-Remote`, `CO-Colombia-Remote`),
  and each code is also a US state.
- **US jobs turned away.** Places joined by `•`, `&` or `or` were read as a
  city, region and two-letter country, so "San Francisco, CA • New York, NY"
  counted as country NY. "San Francisco HQ", "Seattle Office", "Hybrid - San
  Francisco", "Hub - Seattle" and "San Mateo" were also rejected.

Replaying the 4,673 logged location rejections, about 200 now pass. Sources
pick these up on their next poll, so expect some "new" alerts.

Migration `0114_close_non_us_jobs_2026_11.sql` closes the 27 open jobs entirely
outside the US: Snowflake 14 (India, Canada, Germany, Israel, Colombia), Pinterest
8 (Toronto), AiPrise 2 and Instawork 1 (Bengaluru), Kalpa Labs 1 and Strada 1.
These are the ones the filter now rejects. Once closed they stay closed, because
the poller won't reopen a job that fails the filter. Skild AI's "Pittsburgh, San Francisco, Bengaluru" (2 jobs)
is a real US role and stays open.

### Live jobs Jev would remove, not yet reviewed

| Company | Title | Jev says |
|---|---|---|
| DoorDash | Technical Sourcer, Engineering | Not technical |
| Faire | AV Engineer | Other engineering |
| Figure | Product Compliance Engineer | Other engineering |
| Figure | Senior Engineering Technician | Other engineering |
| GitLab | Solutions Architect - SLED (East) | Not technical |
| Relativity | Quality Engineer II | Other engineering |
| Wayve | Principle Engineer, 3D Reconstruction | Too senior |
| xAI | Sr. Software Engineer, Consumer Subscriptions | Too senior |
| xAI | Fire Protection Engineer - Memphis | Other engineering |
| xAI | Fluids Engineer, Power Generation - Memphis | Other engineering |
| Cohere | Member of Technical Staff - Post-training | Too senior |

From the titles alone, Jev looks right on all but possibly Cohere. These stay
open until the Jev discussion below.

## 4. Jev

**Status:** the owner is holding this for a later discussion (2026-11-08). Nothing
about Jev changed.

3,473 postings compared, $0.69 spent since October 5. 2,749 are comparable, and
Jev and the rules agree on 2,462 of those (90%). Where they differ, Jev would
add 157 and remove 35, and it was unsure on another 95. 500 more are queued
against a limit of 100 a day.

Your 110 reviews split evenly overall (Jev 51, rules 56, neither 2, unclear 1).
By field the picture is sharper:

| Field | Jev right | Rules right |
|---|---|---|
| US eligibility | 18 | 1 |
| Work mode | 32 | 21 |
| Job family | 21 | 37 |
| Seniority | 4 | 11 |
| Minimum years | 4 | 7 |

Jev's wins on location are strings no filter can read: "Americas", "North
America", "Remote, AMER", "Hybrid". The filter fix above takes the simple ones
(about 100 jobs). The rest need the posting's text.

**Recommendation:** keep the rules in charge, and let Jev decide only the
locations the filter can't. "Hybrid" alone was 127 rejections and "In-Office" 34.
A Jev "yes" on US eligibility would admit them. Jev also has a good case as a
veto on scope, given the table above, but that needs a test first since the rules
beat it on job family overall.

## 5. Recruiter batching and finding

Read from `worker/outreach/sourcing/`, production and a LinkedIn sample.

**How batching works.** Nothing runs on a schedule. An admin starts a run of up
to 10 companies, processed one after another inside a single request, at 6
search credits each. Older builds send a count and get random companies with a
website. Only 7 companies have ever been run: 5 random on Oct 14, Google and
Uber on Nov 7.

**What it has found.** 151 people, 29 kept (19%):

- 55 weren't recruiters (36%).
- About 45 worked somewhere else or couldn't be confirmed.
- 10 people have been labelled.

**Problems.**

1. **Random picks waste the batch.** Of the 5 random companies, Wardstone and
   ArchiLabs kept nobody, Miro kept 2 and has no open jobs, Retell kept 1, and
   Weave's 7 look like the other Weave, in Utah. Companies should be picked by open jobs and
   size. The website fill above adds 112 companies that weren't eligible before,
   including Palantir and Applied Intuition.
2. **The Oct 14 runs predate the fixes and are still live.** Weave still lists
   its 7 people at weaveinc.org, and Retell AI uses re-tell.ai, which came from
   the format pages. Both should be re-run or cleared.
3. **Addresses are weakly grounded.** Google's format won 3 of 5 votes and
   Uber's 3 of 7, so every address there is "format uncertain". Nothing checks
   delivery.
4. **Experience-line matches can be stale.** The one wrong person in the
   LinkedIn sample below was matched this way. Headline-only matches held up.
5. **One request does all the work.** Ten companies at 6 searches each, in
   sequence, inside one admin request. A queue would suit this and would let it
   run steadily.

**LinkedIn check (2026-11-08).** 10 of the 22 kept at Google, Uber, Miro and
Retell were opened by hand, weakest evidence first:

| Evidence the run had | Opened | Still there |
|---|---|---|
| Headline only | 5 | 5 |
| Experience line | 2 | 1 |
| Current employer | 3 | 3 |

The three rows with a location all matched. The miss is a Miro candidate whose
profile says open to work, with no current employer. Eight of the nine confirmed
are clearly technical recruiters; the ninth just says "Talent".

So the people it keeps are mostly right. The weak parts are which companies it
picks and the guessed addresses. Keep any further checks to small samples by
hand: scraping LinkedIn at scale breaks its terms and would put the account at
risk.
