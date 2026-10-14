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
