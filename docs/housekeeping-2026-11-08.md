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

Read against the postings, Jev is right on 9. xAI's Sr. Software Engineer asks
for 5+ years, which is within policy, and Cohere's is unclear. These stay open
until the Jev discussion below.

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
   its 7 people at weaveinc.org and should be re-run or cleared. Retell AI's
   re-tell.ai is genuinely its own domain: it redirects to retellai.com and uses
   the same mail provider.
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

**Added to People (2026-11-08).** The owner's bar: technical, early-career or
university recruiting, specifically for tech. Every person added was opened on
LinkedIn and confirmed at the company, in the US, in a recruiting role of that
kind: 19 added (Google 13, Uber 5, Retell AI 1), for 21 in total at those three.

Three of the Google additions had been left out as "may work at another Google",
and one Uber addition as "company not confirmed", so those two checks produce
false negatives. Going the other way, four people the search tied to these
companies were wrong: one at Fanatics, one at Siemens, one at Uber Freight, and
one based in India.

Not added: two with no last name (no address can be guessed), a recruiting
manager with no stated tech focus, Miro's "Talent" title with a risky first-name
address, and everyone at Weave.

Addresses remain guesses from each company's format, and nothing checks delivery
before the first send. A bounce marks the contact as bounced.

## 6. Admin queues (2026-11-08)

The owner asked for every queue to be worked through. Each decision made here is
marked as Claude's: job reviews carry an `admin_note`, Jev verdicts have
`reviewed_by = 'claude'`.

### Flagged jobs: 123 approved, 42 rejected

Judged against the current policy in `docs/JOB_CLASSIFICATION.md`: up to five
years, including senior titles within that limit, with staff, management,
non-US and clearance roles out. Each posting's requirement sentences were read.

Update, same day: three of the 12 "PhD required" rejections were wrong, because
the requirement text was read from a cut-off extract. Google's Research
Scientist, Science AI and Meta's Research Scientist, Robotics accept equivalent
experience, and Plaid's Senior Machine Learning Engineer only prefers a PhD. Those
three are now approved. Classifier v25 marks the real PhD-only roles as doctoral,
so eight more are approved and reach only doctorate holders. The ninth is
Isomorphic's toxicology leader, which stays rejected as out of scope.

**PhD required on every route (12)**

- 1X Technologies: Biomechanics Researcher
- DoorDash: Operations Research Scientist
- Generate Biomedicines: Scientist I, Computational Protein Design
- Generate Biomedicines: Senior Scientist I, Computational Protein Design
- Google: Research Scientist, Science AI, Google Research
- IMC Trading: Graduate Machine Learning Researcher - Chicago
- Isomorphic Labs: Research Leader (Toxicology), Cambridge, MA
- Meta: Research Scientist Intern, FAIR Chemistry
- Meta: Research Scientist, Machine Learning for Wearables
- Meta: Research Scientist, Robotics - Meta Superintelligence Labs
- Oura: Senior ML Data Scientist - Women’s Health
- Plaid: Senior Machine Learning Engineer (Research Scientist) - Fraud

**Outside software, data or security (14)**

- Apple: Exploratory Design Scientist - Platform Architecture
- Apple: Exploratory Device Scientist - Platform Architecture
- Form Energy: Battery Modeling Engineer II
- Isomorphic Labs: Research Leader / Senior Scientist (Medicinal Drug Design), Cambridge, MA
- Kairos Power: System Engineer III
- Micron: FIB-TEM Automation Engineer
- Pacific Fusion: OBA Research Scientist/Engineer – Fusion Energy Systems
- Relativity: Loads and Dynamics Engineer II
- Relativity: Quality Engineer II
- Scale AI: Research Advisor - Human Frontier Collective (US)
- Shield AI: Aerostructures Design Engineer II (R5156)
- Shield AI: Engineer II, Flight Test (R6222)
- Shield AI: Engineer II, Future Concepts (R5910)
- Snap: Senior Marketing Scientist, Level 4

**Over five years on every non-doctoral route (16)**

- Generate Biomedicines: Scientist I, Synthetic Biology
- Generate Biomedicines: Senior Scientist I, Protein Analytics & Biophysics
- Meta: Research Scientist - Demand Forecasting
- Meta: Research Scientist - Demand Forecasting
- Meta: Research Scientist, Infrastructure Modeling and Reliability
- Meta: Research Scientist, Server Demand Forecasting
- Meta: Research Scientist, Systems ML - HW/SW Co-Design
- Meta: Software Engineer, Machine Learning - Ads Products
- Meta: Software Engineer, Multimedia & Multimodal AI
- Meta: Software Engineer, Multimedia & Multimodal AI
- Meta: Software Engineer, Product - Ads Products
- Meta: Software Engineer, Systems
- NVIDIA: Senior High-Performance LLM Training Engineer
- Nuro: Senior Software Engineer, Devices Platform
- Nuro: Senior Software Engineer, Sensor Platform
- Reddit: Senior Data Scientist, Safety Enforcement

### Reports and notes

Snowflake's report is resolved (the job closed and the filter is fixed), and
Betterment's is dismissed as a test. Three notes ("Hu", "Kys" and "liquid
death") came from the same account as that test report and are declined.
Atlassian's request is still open: it passes the company bar, and has a public
listings endpoint with 351 roles, 175 in the US, including 2027 graduate and
intern software roles. Adding it needs a small adapter and the owner's approval.

### Jev disagreements: 82 judged

Rules right 45, Jev right 33, unclear 4. This changes nothing users see. Jev's
role is still on hold. On US eligibility Jev was right on all 10 rows the rules
rejected, which matches the owner's own 18 to 1.

### Recruiters: 73 labelled, none listed

Everyone left in the queue was labelled from their title, employer and, where
it could change the answer, their LinkedIn. Two real recruiters, at Google and
Uber, have no last name and so can't be listed. Three people who work at their
companies but aren't clearly tech recruiters are left for the owner.

## 7. The October company research

The candidate review from 2026-10-05 ([Pinkslip Company Candidates](https://claude.ai/artifact/82EqHoBh3wd67RRnjGbjwY))
covered 6,510 companies, including 2,595 from 15 venture funds' portfolio boards. The
owner approved 113 new companies and skipped 986, but the approved ones were never
added.

80 of the approved are on platforms Pinkslip reads. Re-read through the adapters
on 2026-11-08, 77 still work and they carry about 1,587 catalog candidates.
Migration `0116_add_approved_companies.sql` adds 76. Left out:

- Lumos: its board is Lumos Fiber, not the identity software.
- U-Haul: over Workday's 2,000-job cap, and no tech roles to speak of.
- CVS Health: its Workday answered 500 on the day.
- Old Mission: already in the catalog as Old Mission Capital.

31 more approved companies need a reader or a closer look, including JPMorgan,
Goldman Sachs, Microsoft, Visa, Walmart, Oracle, AMD, Citadel, Intuit, TikTok and
American Express. 564 of Claude's picks from that review were never decided.


## 8. Recruiters, Lever and the filters, later the same day

**Recruiters.** Searches ran at 11 of the biggest hiring companies. Of the 49
shortlisted at Amazon, Apple, NVIDIA, Meta and OpenAI, 42 were checked by hand on
LinkedIn and added to People. Six other companies (SpaceX, Databricks, Anthropic,
Waymo, Roblox, Stripe) have 68 technical or early-career candidates still to check.

Amazon's catalog website is its careers site, `amazon.jobs`, which takes mail, so
every guessed address went there. Its format is now set to `amazon.com`.

Some people who met the bar were left off because the guessed address would
probably reach someone else: first-name-only addresses at OpenAI for common first
names, and first-initial-plus-surname addresses for very common surnames.

**Lever.** Apply myself opened Lever's posting, which only links to the form. It
now opens the form, and the phone's reader takes Lever's labels cleanly. Read
against six live Lever forms. Lever stays off Apply for me because of its captcha
on Submit; in Apply myself the person finishes that themselves.

Workday is not a small step: each employer's site asks for its own account, and the
form runs across several screens without a page load.

**What the filters drop.**

| Reason | Rows |
| --- | --- |
| Management title | 16,020 |
| No technical signal | 12,021 |
| Stale | 7,506 |
| Other engineering discipline | 6,981 |
| Non-technical function | 6,252 |
| Catalog candidate (kept) | 6,195 |
| Outside the US | 4,964 |
| Too senior | 3,590 |
| Needs description | 2,550 |
| Clearance | 1,026 |

- "Needs description" is not a backlog. 2,130 of those rows are already stored as
  jobs, and only 25 recent ones are not.
- About 40 early-career product and program roles are out on purpose, because any
  `manager` title is management and product management counts as non-technical.
  They include associate product manager new-grad programs and technical program
  manager internships. Whether to admit them is the owner's call.

**Readers.** Of the 31 approved companies still missing, six looked like they fit
existing readers (Visa, Sandisk, Unity, Qualcomm, Walmart, Electronic Arts). None
answered at the obvious address, so each needs its own look. Eight are on Oracle
Recruiting Cloud, which needs a new reader.

## 9. The November company batch

The owner went through the 564 companies Claude had picked: 544 approved, 4
skipped, 16 left open. Migrations 0117 and 0118 add 529 of them, on the hourly
tier: Ashby 289, Greenhouse 172, Lever 44, Workday 17, SmartRecruiters 7.

**How they went in.** A company added as enabled has its whole open catalog
treated as new, so they were added disabled, each catalog was backfilled through
`POST /api/v2/companies/:id/poll?backfill=true`, and only then were they turned
on. 1,456 open jobs came in at 310 companies, with 0 alerts. The other 219 have
no early-career job today and are being watched.

**Held out (15).**

- Speechify: its board is three roles repeated across 246 cities, with the city
  in the title, so it would put 246 copies of one job in the feed.
- Boards that didn't read (11): Aircall, G-Research (no US filter on its Workday
  site), Klarity, AQR, Pryzm, Carbon Robotics, Tilde Research, LiveRamp (Workday
  403), Beacon Software, Anything, Legend Labs.
- No reader yet (3): Fortinet (Oracle), SAS (iCIMS), Tyler Technologies (Jobvite).

**Websites.** Each was opened and its title compared with the company. Greenhouse
board pages link to greenhouse.com in the footer, so that source needed a filter.
Aquatic Capital, Hilbert and Ricursive Intelligence have no website stored,
because nothing could be confirmed or their icon was a host's default.

**Logos.** 115 went into R2: GitHub org avatars 34, Ashby's square logo 33, site
icons 17, App Store icons 12, job-board logos 11, Y Combinator 5, other site
icons 3. 394 use Google's 128px favicon, 15 are right but under 128px, and 5 show
initials. Every one was checked by eye, which caught blank white-on-clear icons,
hosts' default favicons (WP Engine, Vercel), GitHub's generated identicons and
App Store apps from a different company of the same name.

## 10. Oracle, moved boards and the rest of the list

**Oracle reader.** `worker/adapters/oracle.ts` reads Oracle Recruiting Cloud's
public candidate API. A source is `host/site`, each poll asks for United States
postings only, and descriptions are fetched per job. Live as Worker `85c745c6`.

Migrations 0119 to 0121 add 15 companies, using the same off, backfill, on order
as section 9: 750 open jobs and no alerts.

| Company | Source | Jobs loaded |
|---|---|---|
| JPMorgan Chase | Oracle | 344 |
| Oracle | Oracle | 166 |
| Texas Instruments | Oracle | 54 |
| Honeywell | Oracle | 47 |
| American Express | Oracle | 32 |
| Visa | Workday | 22 |
| BNY | Oracle | 21 |
| Fortinet | Oracle | 19 |
| Akamai | Oracle | 18 |
| Unity | Workday | 13 |
| LiveRamp | Ashby | 6 |
| AQR | Greenhouse | 4 |
| Beacon Software | Ashby | 3 |
| Aircall | Greenhouse | 1 |
| Within (was Klarity) | Ashby | 0 |

**Not added, and why.**

- Qualcomm: 793 US jobs, more than the Eightfold reader's 600 cap, and its board
  rate-limits a full read.
- Walmart: its own GraphQL site. Electronic Arts: `jobs.ea.com/en_US/careers`,
  which the Avature reader's path check refuses. Sandisk: no board link found.
- Fanatics: its Oracle site holds one US job, so the real board is elsewhere.
- Sainsbury's: UK only. G-Research: its Workday site has no US filter.
- Tilde Research and Legend Labs: Ashby's public API is off for them. Pryzm,
  Anything and Carbon Robotics: no public board found.
- SAS (iCIMS) and Tyler Technologies (Jobvite) still need readers.
- Tesla stays off: its careers site refuses the reader (403).

**Jev.** 8 of the 11 flagged jobs were rejected in review; GitLab's had gone, one
Relativity row was already rejected, and xAI's senior role and Cohere's stay open.
Jev's role is unchanged and still waits on the owner. 253 of about 5,000 location
rejections have text no filter can read ("Hybrid", "In-Office", "Americas"). Jev
sampled 27 of those and said US-eligible on all 27.

**Apply for me.** Greenhouse and Ashby hold 7,506 open jobs. No new platform is
worth building yet: SmartRecruiters has 46 open jobs, Lever's submit is behind a
captcha, and Workday, Oracle and the big companies' own sites need an account per
employer. Of 65 real sends, 17 went through and 40 stopped to ask a question, so
the gain is in answering more of those.

## 11. a16z-only companies (2026-11-09)

The review page gained "backed only by" and "10+ people" filters. Of 140 a16z-only
companies with 10+ people, the owner approved 20 more. 17 went live through 0124 and
0125. Their backfill stored 18 jobs and sent no alerts.

**Corrected.** Lumos's scan had matched a fiber internet provider's Greenhouse board,
so it now uses the identity company's Ashby board. Pryzm renamed itself Belisar and
is listed under the new name.

**Logos replaced.** Belisar's Google favicon was its host's default, and Town's App
Store search matched a farming game. Backflip and Standard Nuclear only had low
resolution versions.

**Held out.**

- ZeroMark: approved, but it's a defense company (AI targeting). Waits on the owner.
- Legend Labs: its Ashby board no longer exists.
- Revolut: approved, but it runs its own careers site. Needs a custom reader. Come
  back to it.

**Why so few jobs.** Town's 10 engineering roles were posted 55 to 200 days ago and
Braintrust has 8 that are 32 to 955 days old. Both fail the freshness rule. Startups
leave roles open for months, so that rule costs more on these boards than on big
employers'. Nothing was changed.

## 12. Recruiters, the Nov 9 round

30 more people were opened by hand on LinkedIn, and 18 passed. People now lists 134
with an address, across 22 companies. Coinbase went from none to two.

**The 12 left off.**

- Their hiring isn't software (6): construction, rocket programs (2), factory lines,
  account managers, and one Amazon University recruiter whose role is warehouse
  operations.
- The guessed address is too doubtful (3): a surname that may have changed, and two
  common names where a first initial plus surname could reach someone else.
- Couldn't be confirmed (3): a profile that's gone, one with no employer shown, and
  one whose role ended in July.

**What's left in the queue.** 16 technical and university recruiters at Stripe,
Anthropic and OpenAI wait because those companies' guessed addresses are first names
only, which often reach someone else. Anthropic has nobody listed because of it. 48
more are plain "recruiter" titles that would each need the Experience page read.
