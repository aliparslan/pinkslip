# pinkslip — frontend

Mobile-first job-alert app. A **Svelte 5 SPA built with Vite**, served as static
assets by the Cloudflare Worker (`../worker`) and wrapped as a native iOS app with
**Capacitor** (`ios/`).

## Develop

```bash
bun install          # install deps
bun run dev          # Vite dev server (LAN-exposed; proxies /api → wrangler :8787)
```

Run the Worker API in a second terminal from the repo root:

```bash
bun run dev          # wrangler dev (Worker + local D1)
```

## Build & check

```bash
bun run build        # vite build → dist/ (served by the Worker, packaged by Capacitor)
bun run check        # svelte-check (type-check)
bun test             # run from the repo root (uses bun:test, not vitest)
```

## iOS

```bash
bun run ios:sync     # rebuild web + cap sync
bun run ios:open     # open in Xcode
```

See `../IOS.md` for native setup and on-device testing.

## Structure

- `src/pages/` — route screens (Feed, JobDetail, Tailor, Tracker, Events, …)
- `src/components/` — shared UI (JobRow, TabBar, ScoreBadge, …)
- `src/lib/` — API client, scoring, resume/PDF generation, native bridges, stores
- `src/app.css` — design tokens (`@theme`) + shared component classes
- `src/router.ts` — hash router; `App.svelte` drives the iOS-style push/pop

Stack details, toolchain, and styling conventions: see `CLAUDE.md`.
