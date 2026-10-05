# Deployment modes

Use `bun run deploy` (or its explicit alias, `bun run deploy:web`) for every
release that changes the browser app. It builds the frontend, applies remote
database migrations, and publishes the worker with the new static assets.

`bun run deploy:backend` intentionally preserves the already-published static
assets through `wrangler.backend.toml`. It is only for worker or API changes
that do not depend on a new frontend. The command prints this distinction
before it starts so a backend-only release cannot be mistaken for a web
release.

The service worker checks for a new release at startup and when a tab becomes
active. New workers activate immediately, clear the retired navigation cache,
and reload controlled tabs once. HTML navigations always revalidate the
network; revisioned assets under `/assets/` remain long-lived and immutable.

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

Rollout is controlled by `QUEUE_POLLING_TIERS` in both `wrangler.toml` and
`wrangler.backend.toml`:

1. Deploy with `""`. Behavior is unchanged, but every cron poll is now logged
   to `source_polls`. Admin → Runs → Alert speed shows the cron baseline.
2. Set it to `"2"` and deploy the backend. YC and long-tail sources move to the
   hourly queue. Compare Alert speed against the baseline.
3. Set it to `"1,2"` once tier 2 looks healthy.

To roll back, remove a tier from the list and deploy. The cron cycle picks
that tier up again on its next tick.

The polling watchdog pushes to admin devices in two cases:
- a queued source misses two cadences;
- a new job waits more than 30 minutes to be matched for notifications.
