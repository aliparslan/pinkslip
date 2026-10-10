# Deployment

Two Workers deploy independently:

- `bun run deploy:backend` applies remote D1 migrations and deploys the Hono API
  Worker (`pinkslip`: API, crons, queues). It carries no web assets, so it can't
  take the site down. The 2026-10-05 outage happened because the old single
  Worker served both the API and the site.
- `bun run deploy:web` builds `apps/webapp` and deploys `pinkslip-web` from the
  built `dist/server/wrangler.json`. It owns `pinkslip.work` and
  `pinkslip.alip.dev` and reaches the API through its `API` service binding.
- `bun run deploy` runs both, API first.

Deploy from a clean checkout of `main`. Roll back either Worker with
`wrangler rollback`.

The web app registers no service worker. `/sw.js` is a kill switch for the
retired Svelte site's worker: it deletes every cache, unregisters itself and
reloads open pages. Keep it until no installed copies of the old app remain.
Personal and API responses carry `X-Robots-Tag: noindex`, and the whole site
carries a `noindex` meta tag until the search-launch slice (4.16).

## Queue-based source polling

Polling can move off the single 15-minute cron one tier at a time.

- Tier 1 (the competitive set) keeps a 15-minute cadence.
- Tier 2 (YC and other long-tail startups) is polled hourly.

An every-minute cron dispatches due sources to Cloudflare Queues. Each source
polls in its own consumer invocation. New jobs trigger notification matching
within seconds, and the 15-minute notification cron stays as a backstop.

One-time setup, before the first deploy that includes the queue bindings:

```sh
bunx wrangler queues create pinkslip-source-poll-priority
bunx wrangler queues create pinkslip-source-poll
bunx wrangler queues create pinkslip-source-poll-dlq
bunx wrangler queues create pinkslip-notify
```

`QUEUE_POLLING_TIERS = "1,2"` in `wrangler.toml` puts both tiers on the queue.
To roll a tier back, remove it from the list and run `bun run deploy:backend`; the 15-minute cron cycle polls it again on its next tick. Admin → Runs
→ Alert speed shows cadence and discovery-to-push latency per tier.

The polling watchdog pushes to admin devices in two cases:
- a queued source misses two cadences;
- a new job waits more than 30 minutes to be matched for notifications.
