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

## What gets through

The other half: 300 open jobs drawn at random from the catalog. 216 pass the feed's
career-stage rules, so a user could see them, and 117 of those are matched to at least
one person today. Each of the 216 was judged by its title, location and stated
requirements.

| Problem | In the 216 | Matched to someone |
|---|---|---|
| Other engineering (hardware, facilities, power, propulsion) | 28 | 1 |
| Not technical (a trader, trading operations, a sector analyst) | 3 | 0 |
| Requires a clearance the applicant must already hold | 2 | 0 |
| **Total** | **33 (15%)** | **1 of 117 (under 1%)** |
| Pre-sales solutions roles (a policy call, not counted) | 7 | 0 |
| Couldn't tell | 4 | 0 |

No job in the 216 was outside the US, and none was above the five-year limit once
preferred-only experience is set aside. Staff and principal roles sit in the table but
never reach a feed: none of the 300 was matched to anyone at those levels.

People's preferences catch nearly all of the leak today. The match count reflects
current users' settings, so someone with broader preferences would see more of it.

The leak is mostly titles that sound general: SpaceX's Fire Protection, HVAC Design and
Operations Engineers, xAI's power plant roles, Rocket Lab's vehicle and fluids roles,
and chip roles like Micron's DFT and NVIDIA's verification engineers.

## Where to look next

- Widen the other-engineering filter for the titles above, then re-score both samples,
  since a wider filter can also start rejecting good jobs.
- "(Manager, IC)" shouldn't count as management.
- A rule for security analysts would need care: SpaceX's Insider Threat Analyst and
  similar roles aren't technical.
- Research internships often have no technical words in the title, so they'd need the
  description to be read.
