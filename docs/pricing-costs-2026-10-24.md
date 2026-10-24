# What each person costs, and prices from it (2026-10-24)

The owner, after picking model D (Free + Pro that ends when you're hired,
[pricing-models-2026-10-24.md](pricing-models-2026-10-24.md)): "i want to
come up with pricing with a strategy. i dont want to follow what the market
has settled on, because looking at it as a student its pretty expensive. we
could do a weekly plan. i also dont want to make it so predatory that people
basically have to sign up for the 3 month plan … can you estimate what the
costs could be for me based on usage?"

## Today, from production

- **People:** 67 used the app in the last 7 days (6 signed in), 128 in 30.
- **Applications:** 16 to 42 a week across 6 to 14 people; the busiest
  person added 29 last week.
- **AI:** $0.39 for October so far, 2,000 Jev calls: about $0.0002 a call.
  Tailoring is off, so no tailoring spend yet.
- **Auto-apply** doesn't run on the server yet; the assisted fill runs in
  the phone's in-app browser and costs Pinkslip nothing.

## Unit prices

| What | Price | Source |
| --- | --- | --- |
| Jev (classifying, answering) on Workers AI | $0.042 per million input tokens; output free | `worker/jev.ts`; October's real spend |
| GLM-4.7-Flash (tailoring, resume import) | about $0.06 per million in, $0.40 out | third-party listings; check Cloudflare's page |
| Headless browser (server auto-apply, decided Oct 16) | 10 hours a month included, then $0.09 an hour; 10 browsers at once included, then $2 a month each | Cloudflare Browser Run pricing |
| Sending email (outreach) | 3,000 a month included, then $0.35 per 1,000 | Cloudflare Email Service pricing |
| Receiving email (tracking), push, the API, D1 | inside the $5 Workers plan at this size | Workers Paid |
| Apple | 15% of each payment (Small Business Program) | |
| Stripe | 2.9% + 30¢ per payment (13% of a $2.99 charge) | |

## Per action

| Action | Cost | How |
| --- | --- | --- |
| One auto-apply send (server) | about **$0.005** | ~2 minutes of browser time ($0.003) plus a few Jev calls for the answers ($0.001) plus the rest. A slow 5-minute form is still under $0.01 |
| One tailored resume | about **$0.004** | ~6,000 tokens in and 2,000 out, with up to three tries |
| One outreach email | **$0.0004** | sending only; drafting from the template is free |
| A day of the feed, alerts, Tracker, email tracking | **under $0.001** | requests and pushes inside the plan |

## Per person per week

| Who | What they do in a week | Cost |
| --- | --- | --- |
| Free, typical | feed and alerts daily, tracks 5 applications, 3 auto-apply sends | about **$0.02** |
| Pro, typical | 30 auto-apply sends, 5 tailored resumes, 10 outreach emails | about **$0.18** |
| Pro, heavy | 100 auto-apply sends (14 a day), 20 tailored, 40 emails | about **$0.60** |

**Shared costs** don't grow with each person: the $5 Workers plan, Apple's
$99 a year, polling and classifying jobs (under $1 a month in AI today),
recruiter sourcing ($0.005 a company). About **$15 to $20 a month** in all.
Two weekly subscribers would cover it.

**Where cost could surprise:**
- **A morning rush:** if everyone's Ask first goes out at 8am, many browsers
  run at once. Pinkslip queues sends so no more than a few run together;
  then even 1,000 sends a day stays inside the included 10 browsers and
  costs about $90 a month in browser hours.
- **A runaway loop** in AI or the browser. The monthly AI budget already
  stops AI at its cap; the browser needs the same guard.
- **Support time and blocked applications**, not money, are the real cost
  of heavy auto-apply (Decisions: Auto-apply #7).

## What this means

1. **Limits aren't about cost.** Even the heaviest Pro user costs about
   $0.60 a week. Limits protect the ATSs and response rates (decided:
   bounded by daily and per-company caps, strong matches only) and give
   Free a reason to upgrade.
2. **Prices can be low.** A $2.99 week keeps about $2.54 after Apple's
   15%; the heaviest user costs $0.60 of it.
3. **A third, uncapped tier isn't needed for cost**, and "uncapped"
   auto-apply runs into Decisions: Auto-apply #7 (mass applying lowers
   response rates and can get Pinkslip blocked for everyone). If a third
   tier ever comes, it raises caps for people whose interview rate shows
   it works, and that waits for data.

## Prices, without the market's habits

The idea: **one fair weekly rate, however you buy it.** The monthly plan
costs about what four weeks do, so nobody is pushed into a long plan, and no
3-month plan at all. A search that ends in three weeks pays for three weeks.

| | Weekly | Monthly | Per week, monthly | Keeps after Apple, a week |
| --- | --- | --- | --- | --- |
| **Lean** | $1.99 | $7.99 | $1.84 | $1.69 |
| **Middle (recommended)** | $2.99 | $11.99 | $2.76 | $2.54 |
| Market-ish, for comparison | $9.99 | $24.99 | $5.75 | $8.49 |

- **Middle** is under a Spotify student plan a month and a quarter of what
  Teal and Huntr charge, and it still leaves a wide margin over the
  heaviest user's $0.60.
- **Lean** is the friendliest; it works too, but leaves less room for
  later costs (a paid email checker, more AI).
- Prices stay the same on the web (decided), where Stripe's 30¢ makes
  weekly charges cost more to take; the monthly plan suits the web better.

## "Pro ends when you're hired", with the rest back

- **On the web (Stripe),** Pinkslip can cancel and refund the unused part
  itself, prorated.
- **On iPhone,** Apple doesn't let developers refund in-app purchases;
  Pinkslip can turn off renewal (by opening Apple's subscription page) and
  offer Apple's own refund request (`beginRefundRequest`), which Apple
  decides, usually all or nothing.
- With weekly pricing this mostly takes care of itself: at most a week is
  left, so "let it run out" costs little. The offer can say exactly that:
  "Pro stays on until Thursday, then ends."

## Limits to start with (Free stays generous)

| | Free | Pro |
| --- | --- | --- |
| Feed, alerts, Tracker, email tracking, applying yourself, outreach from your own mail | everything | everything |
| Auto-apply sends | 3 a week (decided) | up to 10 a day, at most 2 per company a week, strong matches only |
| Tailored resumes (when tailoring returns) | 3 a week | as many as you like (a quiet fair-use ceiling, say 50 a week, against loops) |
| Outreach drafted by Pinkslip (later) | none | included |

## For the owner to decide

1. The price ladder: Lean or Middle (or other numbers).
2. Pro's caps: 10 auto-apply sends a day, 2 per company a week?
3. Free's tailoring: 3 a week?
4. Third tier: later, raising caps on interview-rate data (recommended), or
   now.

## Sources

- [Cloudflare Browser Run pricing](https://developers.cloudflare.com/browser-rendering/pricing/); [changelog, July 2025](https://developers.cloudflare.com/changelog/2025-07-28-br-pricing/)
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- GLM-4.7-Flash on Workers AI: [LLM Reference](https://www.llmreference.com/model/glm-4.7-flash/cloudflare); [Maxim](https://www.getmaxim.ai/bifrost/llm-cost-calculator/provider/cloudflare/model/glm-4.7-flash) (third-party; check Cloudflare's model page)
- Production numbers: D1 queries on 2026-10-24 (auth_sessions, applications, classification_daily_budget, product_events)
