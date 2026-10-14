# Building the early-career recruiter list (2026-10-14)

Outreach has no real contacts yet (`docs/outreach-readiness-2026-10-14.md`).
The owner decided to build Pinkslip's own list, aimed at early-career
recruiters specifically: university, campus, early-career, emerging-talent,
intern and new-grad recruiters. This note covers how to build that list in
bulk.

## Size of the job

- The catalog has 1,143 companies, 961 of them with a website (local D1,
  from migrations). Most bulk lookups work by company domain, so the
  website is the key.
- Many startups have no dedicated early-career recruiter, so the real list
  is probably well under 2,000 people. One pass costs hundreds of dollars,
  not thousands, whichever way it's built.
- Recruiters change jobs often, so the list needs a refresh about every
  quarter.

Cost isn't the hard part. The hard parts are whether a provider's licence
lets Pinkslip show its emails to users, and the privacy rules.

## Ways to find people

### 1. A data provider, searched by title (fastest)

For each catalog domain, search for people with early-career recruiting
titles, and get their work email.

- **People Data Labs:** an API priced per match. Third-party 2026 reviews
  put the entry plan at about $98 a month for 350 records, and one
  directory says its licence allows embedding data in a product. Neither
  figure is from PDL itself.
- **Hunter:** domain search returns a company's known addresses, with
  position and department. Third-party sources list Growth at $149 a month
  for 10,000 credits. Its licence for showing data to end users isn't
  confirmed.
- **Apollo:** cheap and large, but its standard API terms are for internal
  business use only. Integrating it into a product needs Apollo's
  approval. Not usable without a deal.

Before buying, confirm in writing that Pinkslip may show the emails to its
users.

### 2. Do it yourself: public pages, the address pattern, a checker

- Find names on companies' student and early-careers pages, university
  career-centre employer pages, and conference sponsor pages.
- Work out the company's address pattern (first.last@ and similar).
- Check the guessed address with a bulk email checker. MillionVerifier is
  about $37 for 10,000 checks, so the whole list costs a few dollars.
- This is the cheapest in money and the best quality, but it takes the
  owner's time. At about 5–10 minutes a company, the full catalog is over
  100 hours. It's realistic for the top 50–100 companies.
- Shared early-career inboxes (`university@`, `campus@`, `earlycareers@`)
  are quick to find and check, and they aren't one person's data. They make
  a fallback, though cold email to a shared inbox likely gets fewer
  replies.

### 3. Learn from forwarded mail (later, opt-in)

Real recruiters email Pinkslip users about interviews, and those emails
already pass through the forwarding inbox. The sender and the title in
their signature are exactly the people this list wants. It costs nothing
and grows with users. However, it reuses one user's correspondence for
everyone, so it needs explicit opt-in and a privacy-policy change. Not for
now.

### 4. LinkedIn, read through a search engine (owner's preference)

The owner wants LinkedIn as the source and won't do this by hand. There are
two ways to read LinkedIn in bulk:

- **Scraping LinkedIn directly** doesn't work well.
  - Firecrawl blocks LinkedIn and other social sites.
  - Logged-out profiles hit a sign-in wall after a few requests, and
    logged-in scraping needs bot accounts.
  - LinkedIn sued Proxycurl in January 2025 over hundreds of thousands of
    fake accounts, and Proxycurl shut down that July.
- **Searching LinkedIn through a search engine** ("X-ray search," a
  standard recruiter technique) gets the same fields without touching
  LinkedIn.
  - A query like `site:linkedin.com/in "university recruiter" "Stripe"`
    returns results titled "Name – Title – Company | LinkedIn": the
    name, current title, company and profile link.
  - About one query per company covers the catalog, so roughly
    1,000–2,000 queries.
  - Serper (Google results) gives 2,500 free queries, then $50 for
    50,000. Brave's API is about $5 per 1,000, after its free plan ended.
    Google's own Custom Search API is closed to new customers.
  - Weak points: search results lag when people change jobs, and short
    company names collide ("Ramp", "Notion"). The CSV review catches
    both.

## Working out emails without a lookup service

The owner's idea: learn each company's address pattern, then apply it to
the names found.

1. **Learn the pattern for each domain**, from these sources:
   - **The forwarding inbox.** A human email from `jane.doe@stripe.com`
     shows Stripe uses first.last. Keeping only "stripe.com: first.last"
     stores nobody's data.
   - **Search results** that show addresses at the domain.
   - **A checker.** Test the usual candidates (first.last, flast, first,
     f.last, firstl, first_last) for one person. The first that's
     accepted gives the domain's pattern.
2. **Apply it** to everyone found at that company.
3. **Check** each address with a bulk checker. Checking it ourselves isn't
   practical: it needs outbound port 25, which Cloudflare Workers and most
   clouds and home connections block. MillionVerifier is about $37 per
   10,000 checks.
4. **Catch-all domains** accept any address, so they can't be checked.
   Use the learned pattern (or the most common one) and mark the address
   "inferred".
5. **Bounces** that come back through the forwarding inbox mark the
   address bad and lower confidence in that domain's pattern.

Free "find the email from a LinkedIn link" sites give only a few lookups a
month and block automation. Learning the pattern and checking it does the
same job automatically.

## Trying one company

```sh
bun scripts/contacts/try-company.ts Stripe stripe.com
```

It reads `SERPER_API_KEY` from the environment or the root `.dev.vars`, and
uses about five credits. It prints:

- the company's mail provider
- early-career and other recruiters, with their profile links and email
  guesses
- the people it left out, and why
- the email pattern it learned, and any shared inboxes

Nothing is checked or saved. The parsing lives in `worker/outreach/sourcing/`
so the scheduled job can reuse it.

### First try: Stripe, Datadog, Notion (2026-10-14)

Four Serper credits per company: two pages of early-career results, one
page of recruiters, and one "email format" search.

| | Stripe | Datadog | Notion |
|---|---|---|---|
| Early-career recruiters kept | 5 | 6 | 1 |
| Other recruiters kept | 12 | 9 | 7 |
| Left out | 10 | 13 | 20 |
| Mail domain | stripe.com | datadoghq.com | makenotion.com, learned from format pages (notion.so takes no mail) |
| Pattern | {first}, 6 of 7 sources | {first}.{last}, 6 of 6 | {f}{last} vs {first}, a tie |

What it showed:

- **Serper's free plan:**
  - It refuses address searches (`"@stripe.com"`) and more than 10
    results per request. Format pages replace the address search, and a
    second page replaces `num: 20`.
  - Results vary between identical searches, so repeated runs find more
    people.
- **The subtitle is the best signal.** For LinkedIn profiles, Serper returns
  "location · current role · current employer". Spot-checking the
  left-outs found them correctly excluded:
  - people who had moved to another company
  - recruiters outside the US
  - non-recruiters
  - matches for "Notion" the software

  Before the subtitle was used, "Recruiter @ Stripe | Ex-Flipkart" was
  wrongly read as having left Stripe.
- **Format pages agree when the answer is clear** (Datadog) and disagree
  when it isn't (Notion).
  - Pages state the format in several ways, all of which are parsed:
    `first@`, `[first_initial][last]`, stock examples like
    `John.Smith@`, and plain words like "the first.last email format".
  - One site (mailmo.io) answers "{first}, 98%" for every company, so it's
    ignored.
- **First-name formats are a trap at large companies.** RocketReach says
  Stripe uses 14 formats, with {first} for about 31% of addresses. A common
  first name's address (emily@, amy@) most likely belongs to an earlier
  employee. An email checker would call it valid, and a bounce would never
  reveal the mistake. Guesses in a {first} format need special handling
  before any are trusted: the secondary format, a lookup service, or only
  rare first names.
- **Recall gaps:**
  - Titles cut off by Google ("Campus Recruiting at …") with no subtitle.
  - Names shown with only a last initial ("Jordan T.") are kept with the
    initial, which is enough for {first} and {first}{l} formats.

## What a search result gives

Serper returns a title, link and snippet for each result.

- **Title:** usually the name plus the LinkedIn headline or current company.
- **Snippet:** often adds the location or current experience.
- **Profile link:** a stable ID, so a person is never imported twice and
  can be found again on a refresh.

The headline is self-written. "University Recruiter at Stripe" is easy to
classify; "Talent @ Stripe | We're hiring!" is vague; and it can name an
old employer. Rules rank people by title, as `contactRank` already does.
How regular the formats are will show in the evaluation run.

Email lookup sites that take a LinkedIn link (Prospeo and Snov, roughly
$0.01–0.04 per email found on paid plans) are a fallback for companies
whose mail server accepts every address or whose pattern is unknown. Their
free tiers are a few dozen lookups a month and block scripts, so they can't
do bulk. Their terms on showing results to users still apply.

## Keeping it current

General US turnover is about 22% a year, roughly 5% a quarter. Recruiting
teams are often the first cut in layoffs, so expect more.

- **Signals, as they happen (free):**
  - A bounce, or an auto-reply saying "no longer with," arriving through
    the forwarding inbox marks the contact gone.
  - A reply confirms the contact.
- **Check the address before use:** when a user opens outreach and the
  address was last checked over 30 days ago, check it again. It costs a
  fraction of a cent. A mailbox is usually shut down when someone leaves,
  so this catches most departures when they matter. It can't help with
  catch-all domains.
- **Search again every quarter**, spread over the quarter rather than all
  at once. Also do a full pass in late July, before fall new-grad and
  intern recruiting opens.
- **Don't drop people on one miss.** Search results lag, so only drop
  someone after a bounce, a failed check, or two searches in a row that
  don't find them.

## Adding companies

The pipeline works per company and keeps its state, so a new batch of
companies is picked up on the next run, with no per-company setup.

1. **Email domain.** Start from the website and confirm it receives mail
   (an MX lookup over DNS-over-HTTPS). If it doesn't, learn the real
   domain from evidence:
   - addresses in the company's own job descriptions (for example
     "accommodations@…")
   - senders in the forwarding inbox
   - search snippets
2. **The name LinkedIn uses.** If results show a different name (Meta and
   Facebook, Block and Square), learn it as an alias.
3. **People:** title queries, classified by rules.
4. **Pattern, derived rather than chosen from a fixed list.** Given any
   known name and address pair, work out the template (first, last,
   initials, separator). An unusual format is learned like a common one.
   - Evidence: inbox senders (only the pattern is kept), job descriptions,
     search snippets, checker probes.
   - The most evidence wins. Conflicts are flagged.
5. **Check** each address. Catch-all domains get "inferred".
6. **Status.** Every company ends with a status (done, no mail domain, no
   people found, pattern unknown, catch-all), so a company the pipeline
   couldn't handle shows up instead of quietly having no contacts.

Each run has a budget (for example 100 companies a day), so a large batch
drains over a few days without a cost spike.

## Evaluation, then review, then autonomy

This follows the job-classification model (`docs/JOB_CLASSIFICATION.md`):
the new source runs where users can't see it, admins review where it's
unsure, and it earns autonomy one category at a time. Here the second
opinion is the email checker and independent evidence, not a model.

**Stage 1: an evaluation script. Users see nothing.**

- **Sample:** 50 catalog companies. Use job count as a stand-in for size
  and take a mix of large, mid-size and startups. Deliberately include
  names that collide (Ramp, Notion) and websites that aren't `.com`.
- **Output, one row per person:**
  - company, name, headline and profile link
  - type: early-career recruiter, technical recruiter, other recruiter,
    or not a recruiter
  - how sure the company match is
  - the email, its status, and where the pattern came from
- **The owner labels about 100 rows once (roughly an hour):** at this
  company now? Early-career recruiter? Email can't be judged by eye, so
  it's measured automatically:
  - checker results
  - whether the pattern agrees with independent evidence (forwarded mail
    and job descriptions)
- **Proposed bars** (the owner sets the final ones). Among rows the rules
  would approve:
  - at least 90% still work there
  - at least 90% are early-career recruiters
  - at least 90% of checkable addresses are valid

  Coverage and cost per contact are reported alongside.
- **Fix, then re-test on a fresh 50**, not the labelled ones, so the rules
  aren't tuned to the sample.
- Real people's data stays out of git. Labels live in D1 or a file outside
  the repository, and parser tests use made-up names.

**Stage 2: the scheduled job, with review.** It covers the whole catalog.
Each contact gets a tier from rules:

- **Auto:** a clear early-career title, an unambiguous company match and a
  checked email. Goes live.
- **Review:** anything else, such as a vague headline, a name collision, an
  inferred address, or a pattern conflict. Goes to an admin queue with
  approve and reject, built like the Jev review page on web and iOS.
- **Drop:** clearly not a recruiter, or not at the company.

Approval rates are counted per reason. A reason approved every time over
enough reviews (say 30 out of 30) moves to auto; one mostly rejected moves
to drop. The queue shrinks as rules earn trust.

**Stage 3: autonomous.** Admins see only exceptions:

- pattern conflicts
- companies that ended with no mail domain or no people
- a bounce alarm: if more than about 5% of outreach to the list bounces in
  a week, auto-approval pauses and admins get a push (`notifyAdmins`)

## Keeping it clean

- **Email status per contact:** checked, inferred (by pattern, not
  checked), catch-all (the domain accepts every address, so it can't be
  checked), or bounced.
- **Bounces:** a failed send returns to the user's own mailbox. Users who
  forward everything also forward the bounce, so the inbox can mark that
  contact bounced for everyone.
- **Replies** (outreach reply detection) confirm a contact works.
- **Quarterly refresh:** re-check the addresses, and re-run the search for
  people who moved on.

## Privacy and legal (check with a lawyer before a public launch)

- These are people's work emails, so they count as personal data.
  California's exemption for business contact data ended on 2023-01-01.
- If Pinkslip charges for features that hand out these emails, that may
  count as selling personal information. In that case California (and
  Vermont, Texas and Oregon) may require registration as a data broker,
  and deletion requests have been processed through California's system
  since 2026-08-01.
- Start with US-based recruiters. EU contacts bring the GDPR's duty to tell
  people their data was collected.
- Keep each contact's source, and honour removal requests: a recruiter who
  asks is removed for good, not just hidden.

## What Pinkslip builds, whichever source is chosen

1. `company_contacts` gains an email status and a "checked at" date.
2. An import script: CSV in (company website, name, title, email, source,
   email status), matched to companies by website domain, with a report of
   rows it couldn't match. It writes to local D1, or to remote D1 with the
   owner's go-ahead. The admin web tool waits for Phase 6.
3. A finder script for route 1 or 4. It walks the catalog's companies with
   the early-career titles, works out emails by pattern, and writes a CSV,
   so the owner reviews the list before importing it. An evaluation run on
   25–50 companies comes first: people found per company, how many
   addresses check out, and a spot check of whether they really work
   there.
4. Bounce and reply feedback through the inbox.
5. Then remove `OUTREACH_TEST_RECIPIENT` and set `OUTREACH = "on"`.
