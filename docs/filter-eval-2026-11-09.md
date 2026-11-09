# How often the catalog filters are wrong (2026-11-09)

A first measurement of good jobs being thrown out. For each of the five biggest
rejection reasons, 80 postings were drawn at random from live, US-located rejections
in `source_job_decisions`. Each was judged against the policy in
`docs/JOB_CLASSIFICATION.md`: software, data, ML or security roles, up to about five
years' experience. Nothing was changed.

Titles were read for all 400. Where a title couldn't settle it, the posting's
requirements were read too. One person judged them, so treat these as estimates.

| Rejection reason | All rejections | Sampled | Real misses | Possible |
|---|---|---|---|---|
| No technical signal | 13,924 | 80 | 3 | 2 |
| Management | 17,988 | 80 | 1 | 1 |
| Other engineering discipline | 7,405 | 80 | 0 | 1 |
| Non-technical function | 6,588 | 80 | 0 | 0 |
| Seniority | 3,809 | 80 | 0 | 4 |

With samples this small, 3 of 80 could be anywhere from about 1% to 11%.

## What it missed

**No technical signal**

- Amazon, Associate Delivery Consultant, AIML: early-career AI consulting.
- Toyota Research Institute, Human Aware Interactions and Learning Intern: research.
- Palantir, Defensive Security Analyst: hands-on security.
- Possible: InterSystems' generic "Summer Internship 2027", and Capital One's Principal
  Data Analyst, which asks for 5 years or 3 with a master's.

**Management**

- Capital One, Data Engineer 4 (Manager, IC): "IC" says it isn't a manager, and it
  asks for 4 years.
- Possible: BNY, Vice President, Full-Stack Engineer. Banks give engineers that title,
  and the posting states no years.
- OpenAI's "Software Engineer, Ads Manager" was caught because of the product's name.
  That's the wrong reason, but it asks for 7+ years, so the result was right.

**Other engineering discipline**

- Possible: Micron, Fab Equipment Engineer - SWE. The posting had gone, so it couldn't
  be read.

**Seniority**

Every Senior or unlevelled software posting that could be read and stated a number
asked for 6 to 8+ years, so those rejections were right. Four state no years at all
(Elastic, Motional, Dropbox and Roblox, all titled Senior) and were rejected on the
title. Whether that's right is a policy question: unknown years are currently treated
as too senior.

## Where to look next

- "(Manager, IC)" shouldn't count as management.
- A rule for security analysts would need care: SpaceX's Insider Threat Analyst and
  similar roles aren't technical.
- Research internships often have no technical words in the title, so they'd need the
  description to be read.
