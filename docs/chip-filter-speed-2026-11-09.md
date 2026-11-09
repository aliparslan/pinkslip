# How other services keep filtering fast (Nov 9)

The owner asked how other services keep chip filtering fast, so Pinkslip can
learn from them. Dropdown chips make this matter more: today's chips are each
loaded ahead of the tap, and a dropdown has too many options to do that for
all of them.

## Where our time goes

Timed from the iPhone simulator on the Mac, as a guest, against production.
Three to five runs each, medians in ms, so treat these as rough. A real phone
on a real network will differ.

| Request | First page | A later page |
| --- | --- | --- |
| No filter | 767 | 360 |
| Remote | 390 | 328 |
| New grad | 487 | 384 |
| Remote and New grad | 453 | 342 |
| Pay $150K+ | 872 | 807 |

| Rows asked for, no filter | Time | Rows' JSON |
| --- | --- | --- |
| 25 | 393 to 1181 | 18 KB |
| 1,000 | 480 to 594 | 760 KB before compression |

Everything the guest's feed matches is 2,594 jobs.

What that says:

- **About 330ms is the floor,** on every request however small. Asking for 40
  times the rows costs almost nothing extra, so reading rows isn't the slow
  part. The trips to the database are. Before the list query, a request does
  session lookup, `ensureEligibleJobs`, then `ensureUserJobMatchesReady`
  (`removeStaleMatches`, `catchUpNewJobMatches`, a count), each its own trip.
- **The database is far from the Worker.** D1 runs in Western North America,
  read replication is off, and `wrangler.toml` has no placement, so the Worker
  runs near the user and pays that distance on each trip.
- **The exact count costs 60 to 400ms** on a first page (`COUNT(*)` over every
  match). It's the difference between the two columns.
- **Pay is the slowest filter.** It fetches up to 1,000 rows and filters them
  in Worker code (`hasAdvancedFilters`), so every page pays that.

Four of the 46 test requests failed in a row (two Pay, two Remote and New
grad). Nothing reached the `errors` table, and the cause isn't known.

## What others do, and what it would mean here

| What they do | Who | Here |
| --- | --- | --- |
| **Keep the list on the device and filter it there.** Each client holds a local database, so moving around needs no round trip. Repliear, a rebuild of Linear's filters: 11,000 issues, 2.5 MB of metadata, about 5ms to scan. | [Linear](https://linear.app/blog/rebuilding-delta-sync-read-path), [Replicache](https://blog.replicache.dev/blog/how-we-built-repliear-compound-filters) | The biggest win. Our whole list is small. Filtering and sorting on the phone would be instant, and sort by pay needs no server sort. |
| **Show the choice before the network answers.** The picked filter appears selected at once, and results catch up. 100ms is where a reaction stops feeling instant. | [Algolia](https://www.algolia.com/blog/engineering/maintaining-speed-perception-with-neuralsearch-and-optimistic-ui) | Done: the chip lights and the rows dim at once. |
| **Don't count what nobody reads exactly.** Counts stop at 500 and show "500+". Cache time depends on how many items match: a day above 50,000, none at 500 or fewer. | Vinted, read in a [repost](https://hacklines.com/en/editions/297086/click); the original wasn't found | A cap on our `COUNT(*)` takes out most of that 60 to 400ms. |
| **Remember answers and share requests in flight.** Repeated queries come from a local cache, and identical requests running at once become one. | [Algolia](https://www.algolia.com/doc/libraries/sdk/caching) | Done: TanStack Query does both, with a five-minute cache kept on the phone. |
| **Run the code next to the database.** A Worker making several database calls: 20 to 30ms a call becomes 1 to 3ms when it's placed beside the database. | [Cloudflare](https://developers.cloudflare.com/workers/configuration/placement/) | A few lines in `wrangler.toml`. Our request is the case they describe. |
| **Read from a nearby copy.** Replicas in each region, no extra charge, but every read has to go through the Sessions API. | [Cloudflare](https://developers.cloudflare.com/d1/best-practices/read-replication/) | Later. It's a code change on every read, and US-only users gain less. |
| **Fetch during the moment before the tap.** Requests are made in the user's think time. | [PALOMA paper](https://arxiv.org/pdf/1810.08862) | Opening a dropdown is that moment: load its options then. |

Not found: first-party posts from Airbnb, Indeed, Zillow or Google Flights on
how their filter chips work. LinkedIn's faceting post no longer loads.

## What to do

Before 1.4, in this order, measuring after each:

1. Place the Worker beside the database.
2. Stop the housekeeping on every read. Pages after the first, and requests
   made ahead of a tap, don't need it.
3. Move the pay filter into the query. Sort by pay needs that anyway.
4. Cap the count.
5. Load a dropdown's options when it opens.

All but the last need a Worker deploy, with the owner's go-ahead.

After launch, the real step: send the newest 1,000 rows with their location,
level and numeric pay, and filter and sort them on the phone, with the server
confirming behind it. The rows need those fields added, and the phone's
matching has to agree with the server's.
