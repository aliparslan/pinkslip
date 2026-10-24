# Recruiter types (2026-10-19)

The owner: "recruiter type can be multiple by the way - university, early
career, etc. … i wanna make sure we have granular enough possible
classifications." Today Admin → Recruiters asks one question with three
answers (Early-career, Other recruiter, Not a recruiter), and the search
guesses one kind per person (early-career, technical, recruiter,
coordinator, intern, other).

## What the reading says

- **There's no standard list.** Titles vary by employer, and the sources
  are mostly job postings and vendor pages, not a formal taxonomy. NACE,
  the US body for campus recruiting, groups its staff by level
  (coordinator, campus recruiter, campus manager, program manager,
  enterprise manager), not by type.
- **"University", "campus", "college" and "graduate" recruiter are one
  job under different names.** "Early careers", "early talent" and
  "emerging talent" are the umbrella over it: interns, co-ops and new grads.
  "University relations" adds school partnerships and campus events.
- **Titles combine two things, so one person often has several types.**
  Who they hire (interns, new grads, experienced people) and what they hire
  for (engineering, business, research). Databricks posts "University
  Recruiter, Tech"; others post "Technical Recruiter, Early Careers". A
  single "kind" can't say both.
- **What they do in recruiting differs too.** A full-cycle recruiter owns a
  role from first contact to offer; a sourcer only finds people; a
  coordinator schedules interviews; an intern-program or university
  relations manager runs programs and events; a head of talent leads the
  team (and at a startup often recruits too). Employer branding and
  recruiting operations rarely talk to candidates.
- **Who employs them matters.** Contract recruiters are common in campus
  season (Databricks posts 9- and 12-month university recruiter
  contracts), so they leave sooner. Agency and RPO recruiters work for an
  outside firm: they don't "work there" in the sense that matters for
  People.
- **For a new grad's email,** the cold-outreach guides say to write to the
  recruiter for the team over a generic inbox, and that technical
  recruiters are measured on pipeline and time to fill. Nothing found says
  whether university or technical recruiters answer more; Pinkslip's own
  reply data will tell.

## A proposed set

Three short questions instead of one, the first two allowing more than one
answer. The search pre-selects from the title, so most people need a check
rather than taps.

| Question | Answers | Several? |
| --- | --- | --- |
| Who they hire | Interns · New grads · Experienced · Leadership | Yes |
| What for | Engineering · Product and design · Business · Research · Everything | Yes |
| Their job | Recruiter · Sourcer · Coordinator · Programs and events · Leads the team · Not in recruiting | No |

Plus one mark: **Agency or contract**, for someone hired through an outside
firm or on a fixed term.

How People would use it:

- **Listed** only with "Works there now? Yes", a job other than "Not in
  recruiting", and not agency.
- **Ranked** for each person looking: someone who hires their level (new
  grads) and their field first, then recruiters and sourcers over
  coordinators, programs and leaders. At a company with one person in
  talent, that person shows whatever they're labelled.
- **Shown** with a plain title ("University recruiter, engineering"), so
  users see who they're writing to.

Two lighter options, if three questions slow labelling too much:

1. **One question, more answers, several allowed:** University and early
   careers · Interns · Technical · Business · Sourcer · Coordinator · Leads
   the team · Not a recruiter. Faster, but "who" and "what for" blur.
2. **Keep today's three answers, add "several allowed"** with Technical
   and Coordinator. The least work, the least to rank by.

## Decided (owner, 2026-10-24)

**The proposed set: three short questions plus the agency or contract
mark.** The search pre-fills them from the title, so labelling is mostly
one confirm.

- **Who they hire:** interns, new grads, experienced, leadership. Several
  allowed.
- **What for:** engineering, product and design, business, research,
  everything. Several allowed.
- **Their job:** recruiter, sourcer, coordinator, programs and events,
  leads the team, not in recruiting. One.
- **Agency or contract:** a mark.

What it does:

- **Listed:** only someone who works there now, isn't "not in recruiting",
  and isn't agency.
- **Ranked:** level and field first for the person looking, then
  recruiters and sourcers ahead of the rest.
- **Shown:** the recruiter's own title. The types only rank and filter.

The Admin labelling screen changes in Paper first.

**Built 2026-10-24, not deployed:**
- **The fields:** migration `0104_recruiter_types.sql` adds `hires`,
  `hires_for`, `job` and `agency`, and carries older single answers over.
- **The pre-fill:** `recruiterTypesFromTitle` in `shared/recruiter-review.ts`.
  Older Admin builds' one answer still works and fills the job it implies.
- **Labelling:** `PUT /api/v2/recruiters/candidates/:id` takes `hires`,
  `hires_for`, `job` and `agency`; confirming sends the suggestion back as
  it is.
- **People:** lists only people in recruiting and not through an agency,
  ranked for the person looking (`recruiterScore`, from their search levels
  and roles).

## Sources

- [Yardstick: campus vs corporate recruiter](https://yardstick.team/compare-roles/what-is-the-difference-between-a-campus-recruiter-and-a-corporate-recruiter)
- [Workable: campus recruiter job description](https://resources.workable.com/campus-recruiter-job-description) (alternative titles)
- [Dice: Recruiter (Early Careers)](https://www.dice.com/job-detail/0d050a79-b7a2-4853-9fad-1cf4d6b45d54)
- [Zoox: University Relations Recruiter](https://jobs.lever.co/zoox/2c4a7c44-8f46-42ea-943a-eb07f61fd5d6)
- [Path Robotics: Early Career & University Relations Recruiter](https://www.purpose.jobs/discover/companies/path-robotics/jobs/95431021-early-career-university-relations-recruiter)
- [Databricks: University Recruiter (Tech)](https://www.databricks.com/company/careers/recruiting/university-recruiter-tech-7988104002) and [its contract roles](https://startup.jobs/recruiter-tech-ur-12-month-ftc-databricks-7881400)
- [NACE: organizational structure](https://naceweb.org/talent-acquisition/organizational-structure) and [standards and competencies](https://naceweb.org/talent-acquisition/standards-competencies/)
- [Yardstick: technical recruiter vs recruiting coordinator](https://www.yardstick.team/compare-roles/what-is-the-difference-between-a-technical-recruiter-and-a-recruiting-coordinator)
- [factoHR: recruitment team structure](https://factohr.com/recruitment-team-structure/)
- [Hothawk: cold email for a job](https://hothawk.ai/blog/cold-email/cold-email-for-a-job)
