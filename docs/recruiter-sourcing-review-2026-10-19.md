# Finding tech recruiters: how it works, and the options (2026-10-19)

The owner: "we only care about tech recruiting by the way, so maybe we need
to refine our searches and how we are even sourcing these guys for review."
This follows the Weave mix-up: three recruiters confirmed for the catalog's
Weave (weaveos.com, a San Francisco startup) worked at Weave Communications
in Utah, with guessed addresses at a third company's domain.

## How it works today

1. **You tap "Search 5 more companies"** in Admin → Recruiters
   (`POST /api/v2/recruiters/run`). It picks catalog companies at random
   that have a website and haven't been searched.
2. **Four Google searches per company** through Serper, all at once:
   - two pages for early-career titles: `site:linkedin.com/in ("university
     recruiter" OR "campus recruiter" OR "early talent" OR …) "Weave"`
   - one page for any recruiter: `("technical recruiter" OR "recruiter" OR
     "talent acquisition") "Weave"`
   - one for `Weave email format` (RocketReach, LeadIQ and similar pages).
3. **Each LinkedIn result is read** without visiting LinkedIn: the name, the
   headline, the snippet, and Serper's line "location · role · employer".
4. **The mail domain:** the website's domain if it takes mail, unless the
   format pages show another domain that does. For Weave they showed
   weaveinc.org, which belongs to yet another Weave.
5. **The address format** (first.last@ and so on) by vote, from the format
   pages and any name-and-address pairs in the snippets.
6. **A kind for each person** from their title, by keyword: early-career,
   technical, recruiter, coordinator, recruiting intern, other.
7. **Who's kept:** someone is left out with no usable name, not a recruiter,
   a recruiting intern, gone from the company, outside the US, or when their
   employer isn't the company. "Is the company" means **the name matches**,
   so every Weave is Weave.
8. **An address is guessed** from the format, with a note on how far to
   trust it ("risky: first-name addresses…"). Nothing checks it.
9. **You label each person** (Works there now? Their role). Since step 8,
   "works there: yes" lists them on the company's People.

Cost today: 4 Serper credits per company, about half a cent.

## What's weak, for tech recruiting

- **Same-name companies.** The company is matched by name only. Weave,
  Notion, Ramp and Mercury all share names with other companies. This is the biggest
  accuracy problem, and you can't see it while labelling.
- **The mail domain can come from another company** when format pages for a
  same-name company show a different domain.
- **Not tech-focused.** The second search takes any recruiter, so sales,
  operations and HR recruiters come in; the early-career search doesn't ask
  for engineering either.
- **Random companies.** The search spends credits on companies with no open
  jobs instead of the ones people apply to.
- **Small startups have no recruiter.** At 10 to 50 people, a founder or an
  engineering lead hires; the search finds nobody, or an agency recruiter.
- **Guessed addresses.** No check (your call: no paid checker for now), and
  first-name formats at big companies are often someone else.
- **Google lags LinkedIn.** People who moved can still show at the old
  company for weeks.

## The options

| | What changes | Fixes same-name companies? | Tech focus | Cost | Showing to users |
| --- | --- | --- | --- | --- | --- |
| **A. Sharpen today's search** | Tech-only queries, a company identity check, hiring companies first, a stricter mail domain | Mostly | Yes | About $0.005 a company; ~$5 a catalog pass. Serper sells $50 for 50,000 credits (may expire after 6 months); 2,500 free to start | Our own guesses, no licence question |
| **B. People Data Labs** | Search people by the company's **website** and title instead of Google | Yes (by domain) | Yes (title filters) | $0.28 per person returned ($98 a month minimum). 5 people at 420 hiring companies ≈ $590 a pass. 100 free a month to test, emails hidden | Licence to show users unconfirmed; ask PDL in writing |
| **C. Hunter domain search** | Addresses Hunter has actually seen at the company's domain, with position and department | Yes (by domain) | Partly (department "HR", title text) | Free: 50 credits a month. Starter $49 a month for 2,000 | Licence to show users unconfirmed |
| **D. You, with Sales Navigator** | You look up recruiters for the top companies by hand and paste them in (the import exists) | Yes (LinkedIn's own company pages) | Yes | $119.99 a month, plus 3 to 5 minutes a company of your time | Your own research; LinkedIn's terms bar exporting its data in bulk |
| **E. Keep it as is** | Only the Skip and site-on-the-card fixes | No | No | $0 | — |

Not options: Apollo's terms rule out product use without a deal, and
LinkedIn scrapers carry real legal risk (Proxycurl shut down in July 2025
after LinkedIn sued it).

### What A would change

1. **Tech-only searches:** early-career titles with an engineering word
   (`"university recruiter" (engineering OR software OR technical)`), and
   `"technical recruiter" OR "engineering recruiter" OR "technical
   sourcer"` instead of any recruiter. Titles that say sales, GTM,
   operations, finance or HR business partner are left out ("not tech").
2. **A company identity check,** so a name match isn't enough:
   - the company's LinkedIn page found once by search
     (`site:linkedin.com/company "Weave" weaveos.com`), whose name and
     location become the company's LinkedIn identity;
   - a person counts only when their employer line matches that identity,
     and someone whose location is far from every office the company lists
     is marked unsure;
   - names known to collide get a flag in Admin, and the card shows the
     site (R1).
3. **The mail domain stays the website's** unless the website takes no
   mail; a format-page domain that differs needs a second source before
   it's used, and the card warns when it differs (R2).
4. **Hiring companies first:** the next companies searched are the ones
   with open early-career tech jobs, most first.
5. **Startups:** with nobody found and under ~50 people, the search notes
   "no recruiter; try the founders" instead of keeping an agency recruiter.

About a day to build; it costs the same per company as today, plus one
search for the company page.

## Built (2026-10-19)

Option A on the server, plus the owner's format and GitHub's (see
[recruiter-emails-2026-10-19.md](recruiter-emails-2026-10-19.md) and the
backend inventory's step 8). The screens wait for Paper approval.

## Recommendation

**A now**, and **C's free tier** on the side to spot-check guessed
addresses for a sample (50 a month, no money). If, after a few weeks of your
labels, "works there" accuracy on tech recruiters stays under the 90% bar,
try **B** on 100 people free and ask PDL about showing their data to users
before paying.

## Sources

- Serper: [2,500 free queries](https://serper.dev/); [$50 for 50,000, expiry unclear](https://apiserpent.com/blog/serper-pricing-credits-explained)
- People Data Labs: [pricing details](https://docs.peopledatalabs.com/docs/pricing-detail); [2026 per-record guide](https://www.cleanlist.ai/blog/2026-09-01-people-data-labs-pricing-guide)
- Hunter: [2026 plan breakdown](https://marketbetter.ai/blog/hunter-io-pricing-breakdown-2026/)
- Sales Navigator: [2026 tiers](https://www.joinvalley.co/blog/linkedin-sales-navigator-cost-explained-2026)
- Proxycurl: [LinkedIn wins case against scrapers](https://www.socialmediatoday.com/news/linkedin-wins-legal-case-data-scrapers-proxycurl/756101/); [founder's note](https://nubela.co/blog/goodbye-proxycurl/)
- Earlier notes: [recruiter-contacts-sourcing.md](recruiter-contacts-sourcing.md), [treg-evaluation-2026-10-18.md](treg-evaluation-2026-10-18.md), [recruiter-types-2026-10-19.md](recruiter-types-2026-10-19.md)
