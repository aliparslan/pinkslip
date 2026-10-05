# Deployment modes

Use `bun run deploy` (or its explicit alias, `bun run deploy:web`) for every
release that changes the browser app. It builds the frontend, applies remote
database migrations, and publishes the worker with the new static assets.

`bun run deploy:backend` is disabled. It deployed through `wrangler.backend.toml`
with `keep_assets`, which keeps the published files but not the `ASSETS`
binding or `run_worker_first` routing, because those belong to each worker
version. On 2026-10-05 a backend-only deploy served every web page as a 404
for about 20 minutes. Wrangler rejects an `[assets]` block without a local
directory, so the config can't carry the binding. Deploy every release with
`bun run deploy` from a clean checkout of `main`, so the web bundle always
matches committed code.

The service worker checks for a new release at startup and when a tab becomes
active. New workers activate immediately, clear the retired navigation cache,
and reload controlled tabs once. HTML navigations always revalidate the
network; revisioned assets under `/_app/immutable/` remain long-lived and immutable.
SvelteKit builds the worker, which is published at the existing `/sw.js` URL.
The static HTML includes a CSP with hashes for Kit’s bootstrap; `_headers`
adds the frame-ancestor policy, cache policy, and crawl directives.

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
To roll a tier back, remove it from the list and run `bun run deploy`; the 15-minute cron cycle polls it again on its next tick. Admin → Runs
→ Alert speed shows cadence and discovery-to-push latency per tier.

The polling watchdog pushes to admin devices in two cases:
- a queued source misses two cadences;
- a new job waits more than 30 minutes to be matched for notifications.
