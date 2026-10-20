# Recruiter addresses: getting them right, staying legal, keeping them ours (2026-10-19)

The owner's questions after the sourcing review
([recruiter-sourcing-review-2026-10-19.md](recruiter-sourcing-review-2026-10-19.md)):
what "format pages" are, choosing which companies to search, founders'
addresses at YC startups, how accurate guesses can get without a paid
checker, how Hunter does it, niche or free methods, the legal side, and
keeping paying users from scraping the list. Not legal advice; the legal
part needs a lawyer before Pinkslip opens outreach to everyone.

## What "format pages" are

Sites like RocketReach, LeadIQ and Mailmo publish an "Acme email format"
page ("The most common format is first.last@acme.com (58%)"). Pinkslip
doesn't open them: it searches Google for "Acme email format" and reads the
**snippets** of those pages, then votes. They're guesses themselves; they
disagree when the answer isn't clear (Notion); one site (Mailmo) said
first-name for every company tried, so it's ignored; and the page can be
about a same-name company, which is how Weave's mail ended up at
weaveinc.org.

## Choosing the companies

Yes. Admin → Recruiters gets a company picker (search the catalog, tick a
few, "Search these"); the random "Search 5 more" goes. Hiring companies can
be suggested first, but you choose.

## Getting the format right

| Way | How good | Cost | Notes |
| --- | --- | --- | --- |
| **You check Hunter once per company** and type the format in Admin ("first.last@stripe.com") | Good: Hunter's pattern comes from addresses it has actually seen | Free for 50 companies a month; $49 a month for 2,000 | A fact you looked up; Pinkslip applies it to names |
| **GitHub's public commits** for companies with open-source code: real employee addresses at the domain | Very good where it exists (most tech companies with public repos) | Free with a token (5,000 requests an hour) | Keep only the format. GitHub's terms forbid using its data for unsolicited email, so the engineers' addresses are never stored or written to |
| **Forwarded mail**: recruiters and coordinators who write to Pinkslip users from the company's domain | Very good, and it grows with users | Free | Keep only the format unless the privacy notice covers more |
| **Our own job postings** | Weak | Free | Checked: 33 of 946 companies' postings mention an address at their domain, almost all shared (accommodations@, hr@); one personal |
| **Format pages** (today) | Mixed | Part of today's 4 searches | Kept as a tiebreaker, never over the website's own domain |

First-name formats at big companies stay risky whatever the source: emily@
usually belongs to whoever joined first. Those people show the address as
"might be someone else" or wait for a better source.

## Checking an address without paying

- **Bounces and replies** through forwarding (built in step 8): a bounce
  takes the address off for everyone; a reply confirms it.
- **Hunter's free credits** also verify (half a credit each), so a few a
  month can spot-check a sample.
- **Gravatar** (an avatar registered to the address) proves an address is
  in use when it hits, but recruiters rarely have one; a miss means
  nothing.
- **A homemade server check** isn't possible from Workers (no port 25) and
  gets addresses blocklisted when run from our own server.

Off limits, though they're the "loopholes" people mention: sign-in pages
that reveal whether a Microsoft 365 or Google account exists (abusing
sign-in systems, against their terms, and treated as unauthorized access),
making many free accounts to dodge a service's limits, and LinkedIn
scrapers (Proxycurl shut down in July 2025 after LinkedIn sued).

## What Hunter does, and how much we can copy

Hunter crawls about 30 million public pages a day, keeps every address it
finds with its source and date, shows a domain's pattern once a few
personal addresses are known, and verifies by talking to mail servers from
its own infrastructure. The crawl at that scale is a business of its own,
and the verification needs servers we don't run. The narrow version for
our ~1,000 companies is the table above: GitHub commits, forwarded mail and
the website, with your one Hunter check as the answer key.

## YC startups and founders

- At small startups the format is usually first@ (one Hunter check
  confirms it), and the people who hire are the founders.
- Names come from the company's own site or its YC directory page;
  Pinkslip applies the format.
- The sanctioned route is YC's Work at a Startup, where candidates message
  founders directly. For YC companies, People could offer that link beside
  (or instead of) a guessed address.
- The legal position is the same as for recruiters (below).

## The legal side, briefly

- **Sending:** a job seeker's one-to-one email is likely not a
  "commercial" message under CAN-SPAM (sources call it a grey area), and
  users send from their own mail, not Pinkslip.
- **Holding and showing addresses:** work emails are personal information
  in California since the B2B exemption ended in January 2023: a privacy
  notice, deletion on request (the removal path is built), and no use
  beyond outreach.
- **Data broker:** California's registry covers businesses that sell
  personal information about people they have no direct relationship
  with; brokers have had to process deletion requests through DROP since
  August 1, 2026, and not registering costs $200 per person per day.
  Whether Pinkslip counts turns on "selling": keeping the contact list
  free (the Oct 15 plan already says "the contact list isn't paywalled")
  keeps it far from that line. A lawyer should confirm.
- **Staying on the safe side:** US recruiters only, work addresses only,
  the source kept for each, removal for good, the caps, and no bulk access.

## Keeping the list ours

| Way | What it stops | Cost to users |
| --- | --- | --- |
| **One person at a time:** People shows names and titles; the address loads on their page (O2, as designed) | Lists copied in one go | None |
| **A quiet daily limit on addresses opened** (about 40, from the Oct 15 plan) next to the 5 new people a day | Scraping: the whole list would take months | None for real use |
| **Signed in only, no export, no public API** | Bots and bulk pulls | None |
| **Unusual-use flags:** many companies opened fast, steady round-the-clock opening; an admin push, then a pause | Scripts that stay under the limit | None |
| **Canary records:** a few decoy contacts unique to each account, at addresses Pinkslip receives; mail to one that didn't come through Pinkslip names the leaker | Proving a leak | Someone may write to a decoy, so keep them few and last on People; never anyone real |
| **Freshness as the moat:** recruiters move (US turnover is about 22% a year, more in recruiting); Pinkslip's labels, bounces and replies keep the list current, and the follow-ups and reply detection only work inside Pinkslip | A copied list goes stale within months | None |
| **Terms:** no extraction or resale; accounts that do it are closed | Gives you the right to act | None |

Hiding addresses entirely (Pinkslip sending for the user through a relay
address) would stop copying but hurts replies and trust, so it isn't
recommended.

## Recommendation

1. **Now:** the company picker; your one Hunter check per company sets the
   domain and format in Admin; the search goes tech-only with the company
   identity check (option A in the sourcing review); GitHub commits as a
   free second opinion on the format.
2. **When outreach opens:** one person at a time, the daily limit, signed
   in only, unusual-use flags, and the contact list stays free.
3. **Later:** formats learned from forwarded mail; canary records if a
   leak is suspected; a lawyer's read on the data-broker question before a
   public launch.

## Sources

- Hunter: [how Domain Search finds addresses](https://help.hunter.io/en/articles/1922677-how-does-hunter-find-the-email-addresses-returned-in-the-domain-search); [Domain Search FAQ](https://help.hunter.io/en/articles/15921145-faqs-about-finding-emails-in-hunter); [extension listing, pattern shown](https://addons.mozilla.org/firefox/addon/hunterio/); [2026 plans](https://marketbetter.ai/blog/hunter-io-pricing-breakdown-2026/)
- GitHub commit addresses: [hadi.icu on commit metadata and author-email search](https://hadi.icu/blog/github-users-osint); [commit-stream](https://pentestreports.com/tool/commit-stream)
- Gravatar checks: [hashtray](https://github.com/balestek/hashtray); [email OSINT notes](https://www.skills.sh/useosint/osint-skills/email-osint)
- Proxycurl: [LinkedIn wins case](https://www.socialmediatoday.com/news/linkedin-wins-legal-case-data-scrapers-proxycurl/756101/)
- CAN-SPAM and job seekers: [Whali: is cold emailing legal](https://whali.co.uk/blog/is-cold-emailing-legal); [Mailtrap: CAN-SPAM and cold email](https://mailtrap.io/blog/can-spam-cold-emails/)
- California: [B2B exemption ended (TrueVault)](https://www.truevault.com/learn/ccpa/ccpa-employee-and-b2b-data); [Manatt](https://www.manatt.com/insights/newsletters/privacy-and-data-security/ca-fails-to-extend-privacy-exemptions-for-b2b-and); [DROP for data brokers](https://privacy.ca.gov/drop-for-data-brokers/); [Clark Hill on the Delete Act](https://www.clarkhill.com/news-events/news/is-your-business-a-data-broker-californias-drop-goes-live-and-calprivacy-continues-to-enforce-delete-act); [TrustArc](https://trustarc.com/resource/california-delete-act-drop-platform-data-brokers/)
- YC: [how to find YC founders](https://www.vcbacked.co/blog/how-to-find-yc-founders)
- Scraping defenses: [Security Boulevard: protecting an API from scraping](https://securityboulevard.com/2022/09/how-do-you-protect-an-api-from-scraping)
