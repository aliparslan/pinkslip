# treg.to for finding recruiters (2026-10-18)

The owner asked whether [treg](https://treg.to/people-search) should replace
the current way of building the early-career recruiter list
(`docs/recruiter-contacts-sourcing.md`). Short answer: not as a replacement.
It may be worth using for two gaps the current plan already has: checking
addresses, and looking up the addresses a pattern can't be trusted for.

## What treg is

- A pay-per-call gateway from Superdesign that puts 113 data providers behind
  one token: People Data Labs, Hunter, Tomba, Apollo, Icypeas, Crustdata and
  others. It calls itself "OpenRouter for agent tools".
- Plain HTTPS (`https://treg.to/call/<endpoint>`, `X-Treg-Token` header), so
  the Worker could call it the same way it calls Serper.
- Prepaid balance, no subscription, "0% markup" over each provider's price.
  New teams get $1 of credit once. Routed tools such as
  `treg.people.email.find` try providers cheapest first, and misses are free.
- Prices from its page: email find (Tomba) $0.0089 per verified email, work
  email from a LinkedIn link (Icypeas) $0.019, email check (Hunter) $0.003,
  person enrichment (PDL) $0.028.
- It's new. The GitHub repo was created 2026-07-15, the terms took effect
  2026-07-22, and it launched on Product Hunt on 2026-08-17.

## Compared with what we do now

| | Now (Serper search + learned pattern) | treg |
|---|---|---|
| Who is found | LinkedIn profiles through Google, ranked by title | Provider databases (PDL, Apollo), searched by company and title |
| Address | Learned per domain, applied to names | Looked up per person |
| Address check | Not built; plan says MillionVerifier, about $0.0037 a check | Hunter, $0.003 a check, nothing to subscribe to |
| Cost for the catalog | A few dollars a pass | Roughly $10–60 a pass, depending on how much goes through it |
| Licence to show users | Nobody's database; the address is our own guess | Each provider's terms apply (see below) |

Cost decides nothing either way. Both are small, as the sourcing note already
says.

## The licence still decides it

The sourcing note's main open question is whether a provider lets Pinkslip
show its addresses to users. treg doesn't answer that question, and it makes
the answer harder to find:

- §05 of treg's terms: calls are "subject to that provider's terms as well as
  these", and treg is "not a party to your relationship with them".
- §13 makes us indemnify treg if our calls broke a provider's terms.
- §07 allows using the hosted API inside our own product. That covers making
  the calls, not showing the data the calls return.
- Routed tools pick the provider for us, and the docs don't say whether the
  response names the one that answered. Apollo's standard terms rule out
  product use without a deal, so a routed lookup could hand back data we
  can't show.
- When treg answers with its own provider key, it's unclear whose licence we
  are under.

The terms say nothing about storing results, GDPR, CCPA or CAN-SPAM.

## The benchmark on its page

It claims first place on LessieAI's People Search Bench (Claude Code alone
43%, with treg 78.2%). That bench scores an agent answering 119 one-off
questions. It doesn't measure what our list needs, which is whether someone
works there now, and that is what the admin → Recruiters labels already
measure. LessieAI also appears in the chart as a competitor.

## Options

1. **Keep the current pipeline unchanged.** Buy MillionVerifier when stage 1
   needs checked addresses. Nothing new to depend on. The {first}-format
   companies and catch-all domains stay unsolved.
2. **Keep the pipeline, and use treg only for the hard cases (recommended, if
   the licence checks out).**
   - Check addresses through Hunter's endpoint instead of a MillionVerifier
     plan.
   - Look up the address only where the pattern can't be trusted: {first}
     formats at large companies (the Stripe trap), pattern ties (Notion) and
     catch-all domains. That's likely a few hundred people, a few dollars a
     pass.
   - Call one pinned provider endpoint, not a routed tool, so we know whose
     terms apply. Get that provider's OK in writing before anything reaches
     users.
   - It plugs in like Serper does: a function passed into `sourceCompany`,
     run after `likelyTemplate`.
3. **Replace the search with provider people search through treg.** Not
   recommended. It hits the same licence wall as route 1 in the sourcing note,
   and Apollo is ruled out without a deal. It drops the LinkedIn-first source
   the owner chose, and it puts a three-month-old intermediary in the middle.

## A cheap test before deciding

The $1 free credit is enough for about 50 lookups. Run the Tomba or Icypeas
lookup on the people already labelled "works there now: yes" at Stripe and
Notion. Then compare the results with the pattern guesses and check both sets
of addresses. If lookups beat the guesses where the pattern is weak, option 2
earns its place. If they mostly agree, option 1 is enough.
Nothing from the test should be stored or shown to users.

## Sources

- [treg people search and pricing](https://treg.to/people-search#pricing)
- [treg terms](https://treg.to/terms) (§05, §07, §13)
- [treg API (llms.txt)](https://treg.to/llms.txt)
- [Product Hunt launch](https://www.producthunt.com/posts/1220962)
- [eesel: What is Treg?](https://www.eesel.ai/blog/treg)
