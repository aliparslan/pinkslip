# pinkslip

Pinkslip is an early-career job discovery app focused on new-grad and junior
roles requiring no more than three years of experience. It combines a
personalized feed, job alerts, application tracking, and AI-assisted resume and
cover-letter tailoring.

## How it is built

- A Cloudflare Worker exposes the Hono API and serves the built frontend.
- Cloudflare D1 stores accounts, search profiles, jobs, and product events.
- Cloudflare R2 stores uploaded resume assets.
- A Svelte 5/Vite web app provides the responsive browser experience and
  installable web capabilities.
- A separate Capacitor 8.5 iOS app composes the shared product code around an
  iOS-specific shell, lifecycle, secure session, APNs, haptics, and share UI.

`user_search_profiles` is the canonical source for matching and notification
preferences. The old `user_preferences` table is read only as an import path for
profiles created before the typed schema existed.

## Local setup

Install Bun, then install the workspace from the repository root:

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

Run the Worker and web app in separate terminals:

```sh
# Repository root: repairs and migrates local D1, then starts the API.
bun run dev

# Repository root: starts the responsive web app and proxies /api to the Worker.
bun --filter @pinkslip/web dev
```

The local email binding simulates delivery and records the message in local
development output; it does not send real email. `bun run dev:prod-data` uses
remote Cloudflare resources and should only be used deliberately.

## Verification

```sh
bun test
bun run check
bun run build:frontend
bun run build:ios
bun run db:migrate
```

Tests use Bun's built-in test runner. `bun run check` covers Worker TypeScript,
shared client code, both app entrypoints, and CSS. See `IOS.md` for native builds
and physical-device push testing.

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
- `apps/web/` — browser/PWA entrypoint, responsive shell, and web platform adapter
- `apps/ios/` — Capacitor entrypoint, iOS shell, native adapter, and Xcode project
- `packages/client/` — shared screens, components, routing, state, and API client
- `shared/` — scoring constants and role-affinity logic used across layers
- `tests/` — Worker and pure-domain tests
- `migrations/` — D1 schema history
- `scripts/` — local database maintenance
- `IOS.md` — iOS build, APNs setup, and device testing
- `docs/ARCHITECTURE.md` — ownership rules, release boundaries, and workflows

The current polling and matching pipeline is live. Future source expansion,
deduplication, and ingestion hardening are tracked in
`ATS_INTEGRATION_ROADMAP.md`.
