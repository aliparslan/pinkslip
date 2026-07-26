# pinkslip

Pinkslip is an early-career job discovery app focused on new-grad and junior
roles requiring no more than three years of experience. It combines a
personalized feed, job alerts, application tracking, and AI-assisted resume and
cover-letter tailoring.

## How it is built

- A Cloudflare Worker exposes the Hono API and serves the built frontend.
- Cloudflare D1 stores accounts, search profiles, jobs, and product events.
- Cloudflare R2 stores uploaded resume assets.
- A Svelte 5 and Vite PWA provides the web interface.
- Capacitor packages the same interface as an iOS app with native APNs push.

`user_search_profiles` is the canonical source for matching and notification
preferences. The old `user_preferences` table is read only as an import path for
profiles created before the typed schema existed.

## Local setup

Install Bun, then install dependencies in both packages:

```sh
bun install
cd frontend && bun install
```

Create `.dev.vars` at the repository root for the secrets needed by the feature
you are testing. Common entries are:

```dotenv
VAPID_PRIVATE_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
APNS_PRIVATE_KEY=
ACCESS_CODE=
```

Non-secret defaults and binding names live in `wrangler.toml`. Never commit
real secret values.

Run the Worker and frontend in separate terminals:

```sh
# Repository root: repairs and migrates local D1, then starts the API.
bun run dev

# frontend/: starts Vite and proxies /api to the local Worker.
bun run dev
```

The local email binding simulates delivery and records the message in local
development output; it does not send real email. `bun run dev:prod-data` uses
remote Cloudflare resources and should only be used deliberately.

## Verification

```sh
bun test
bun run check
bun run build:frontend
bun run db:migrate
```

Tests use Bun's built-in test runner. `bun run check` covers Worker TypeScript
and Svelte diagnostics. See `IOS.md` for native builds and physical-device push
testing.

## Database and deployment

Schema changes are ordered SQL files under `migrations/`:

```sh
bun run db:migrate          # local D1
bun run db:migrate:remote   # production D1
```

`bun run deploy` applies remote migrations, builds the frontend, and deploys
the Worker. Review the migration and verify the full local suite before using
it because it changes production data and code.

## Project map

- `worker/` — API routes, authentication, scoring, notifications, and tailoring
- `frontend/src/` — Svelte screens, components, client state, and API client
- `shared/` — scoring constants and role-affinity logic used across layers
- `tests/` — Worker and pure-domain tests
- `migrations/` — D1 schema history
- `scripts/` — local database maintenance
- `IOS.md` — iOS build, APNs setup, and device testing

Scheduled polling and source expansion are intentionally parked for a later
workstream. The current refactor keeps the existing schedule and adapters
unchanged while improving everything downstream of ingestion.
