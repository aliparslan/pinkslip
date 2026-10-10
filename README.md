# pinkslip

Pinkslip is an early-career job discovery app focused on new-grad and junior
roles requiring no more than three years of experience. It combines a
personalized feed, job alerts, application tracking, and AI-assisted resume and
cover-letter tailoring.

## How it is built

- A Cloudflare Worker (`pinkslip`) runs the Hono API, crons and queues.
- Cloudflare D1 stores accounts, search profiles, jobs, and product events.
- Cloudflare R2 stores uploaded resume assets.
- A React web app (TanStack Start, Base UI, CSS Modules) runs as a second
  Worker (`pinkslip-web`), owns the hostnames and forwards API paths to the API
  through a service binding.
- An Expo iOS app with native screens is planned (Phase 6 of
  `docs/REACT_EXPO_PORT_PLAN.md`). The earlier Svelte web app and Capacitor iOS
  app are preserved at the `svelte-final` tag.

`user_search_profiles` is the canonical source for matching and notification
preferences. The old `user_preferences` table is read only as an import path for
profiles created before the typed schema existed.

## Local setup

Install Bun and Node 22.17+, then install the workspace from the repository root:

```sh
bun install
```

Create `.dev.vars` at the repository root for the secrets needed by the feature
you are testing. Common entries are:

```dotenv
VAPID_PRIVATE_KEY=
APNS_PRIVATE_KEY=
ACCESS_CODE=
```

Non-secret defaults and binding names live in `wrangler.toml`. Never commit
real secret values.

From the repository root, `bun run dev` migrates local D1 and starts the web
app at http://127.0.0.1:3000 with the Hono API running beside it. That
development API reads the root `.dev.vars`. Run one dev server at a time: they
share Vite's dependency cache. `bun run dev:api` starts the API alone.

The local email binding simulates delivery and records the message in local
development output; it does not send real email.

## Verification

```sh
bun test
bun run check
bun run build
bun run test:e2e   # Playwright, against the dev server
```

Tests use Bun's built-in test runner. `bun run check` covers Worker TypeScript,
the shared packages, tokens and fonts, and the web app's types, CSS and
governance rules.

## Database and deployment

Schema changes are ordered SQL files under `migrations/`:

```sh
bun run db:migrate          # local D1
bun run db:migrate:remote   # production D1
```

`bun run deploy:backend` applies remote migrations and deploys the API Worker.
`bun run deploy:web` builds and deploys the web Worker. `bun run deploy` runs
both, API first. Review the migration and verify the full local suite before
deploying, because these commands change production data and code.

## Project map

- `worker/` — API routes, authentication, scoring, notifications, and tailoring
- `apps/webapp/` — the React web app and its `pinkslip-web` Worker
- `apps/native/` — Expo experiments from the port's foundations (Phase 1.6)
- `packages/data/` — TanStack Query hooks and the session, shared by the apps
- `packages/core/` — framework-free API client and client logic for any app
- `packages/tokens/` — design tokens for web and native, plus the font checks
- `shared/` — `@pinkslip/domain`: types and rules used by the Worker and clients
- `tests/` — Worker and pure-domain tests
- `migrations/` — D1 schema history
- `scripts/` — local database maintenance
- `IOS.md` — APNs setup and device testing (written for the retired Capacitor app)
- `docs/ARCHITECTURE.md` — ownership rules, release boundaries, and workflows

The current polling and matching pipeline is live. Future source expansion,
deduplication, and ingestion hardening are tracked in
`ATS_INTEGRATION_ROADMAP.md`.
