# Poll failures, 2026-11-14

Read-only look at production D1 (`companies`, `source_polls`) and the
worker's deployments at about 02:45 UTC on 2026-11-14.

## Summary

Polling itself is healthy: about 2,600 polls an hour ran all day, and
Apple, Greenhouse, Ashby, Amazon and SmartRecruiters jobs kept arriving. Two
outside sources started refusing us, and nothing on our side changed: the
last worker deploy was 2026-11-10 22:41 UTC.

| Source | Companies failing | Since (UTC) | Error |
|---|---|---|---|
| YC company job pages | 607 (all of them) | 2026-11-14 00:00 | `YC jobs page 429` |
| Workday (`*.myworkdayjobs.com`) | 26 of 47 | 2026-11-13 22:00 | `Workday API 521` |
| Workday | 6 (Adobe, Snap, CrowdStrike, Barclays, Blue Origin, Citi) | intermittent since at least 2026-11-12 | `Cannot read properties of undefined (reading 'replace')` |
| Others | 10 | scattered | timeouts, two Ashby 404s, one Workable 429 |

Errors per hour went from 1–17 to 620–645 at 00:00 UTC; the jump is all YC.

## YC

Every YC company is polled once an hour, one page each
(`ycombinator.com/companies/<slug>/jobs`), about 606 requests an hour. That
was steady and error-free for days, then at 00:00 UTC almost every request got
429. The same page loads with 200 from outside Cloudflare, so YC is rate
limiting traffic from Workers (or requests without a browser User-Agent:
`worker/http.ts` sends none), not the page.

Quarantine handles it on its own: after 3 failures a source is retried once a
day (`QUARANTINE_RETRY_MS`) and clears on its first success. At the time of
reading, 319 YC companies were quarantined, and the rest will follow. No YC
jobs arrive until YC lets us back in.

## Workday 521

521 is Cloudflare's "origin is down" error, returned in front of Workday. The
same request from outside Cloudflare (Visa, Adobe) also gets 521, so this is
Workday's side, not a block on us. Quarantine applies the same way.

## Workday `replace` crash

A small, steady crash for some boards, unrelated to tonight. Not traced yet.

## Options for YC (owner picks)

1. **Wait.** Quarantine already cuts YC to one try per company per day and
   recovers by itself. Cost: no YC jobs until the block lifts, and daily
   retries may keep the block going.
2. **Poll YC less often.** For example every 6 hours instead of hourly (about
   100 requests an hour). YC startups post rarely, so little is lost.
3. **Back off the whole host on 429.** The first 429 pauses every YC poll for
   a while, so we stop hammering the site and the block can lift.
4. **Send a User-Agent** that names Pinkslip, in case the rule targets
   anonymous clients.

2 + 3 together is the most likely to get us unblocked and keep us unblocked.

## Decision (owner, 2026-11-14): 2 and 3

- YC sources are due every 6 hours (`YC_POLL_INTERVAL_MS`); the rest of
  tier 2 stays hourly.
- While any YC poll got `YC jobs page 429` in the last hour
  (`YC_RATE_LIMIT_PAUSE_MS`), the dispatcher claims no YC source, and a YC
  message already queued is dropped without fetching and stays due. The pause
  is read from `source_polls`, so there is no new table or migration.
- The watchdog and the latency view use the 6-hour cadence for YC, and the
  watchdog doesn't count YC as overdue during a pause.

While the block holds, each pause ends with one dispatcher tick of YC
attempts (up to the tier-2 per-tick limit, about 45), then another hour off:
roughly 45 requests an hour instead of 600. Quarantined YC sources keep their
daily retry and clear on their first success.

Not done: a User-Agent (option 4), and a separate per-tick cap for YC. The
cron cycle still polls YC hourly if tier 2 is ever taken off the queue
(`QUEUE_POLLING_TIERS`); production queues both tiers.
