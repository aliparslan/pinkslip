# Pinkslip web app

TanStack Start runs in the `pinkslip-web` Worker, which owns both hostnames.
Hono remains the only API. Since chunk 3.4 this is the production site: the
shell, session, page states and placeholders are in, and the product screens
arrive in Phase 4.

From the repository root:

```sh
bun install
bun run dev        # http://127.0.0.1:3000
bun run build
bun run test:e2e
bun run deploy:web
```

`dev` applies local migrations and starts both Workers. Run only one at a time,
because every `vite dev` here shares `node_modules/.vite`. The Vite plugin
shares the repository's `.wrangler/state` so existing local D1 data is usable.
`wrangler.api.local.jsonc` runs the real Hono entry with local D1/R2 only.
AI, email, queues and scheduled handlers are not configured for this development
companion. Production continues to use the root Wrangler configuration.
No production resource is migrated or deployed by these commands.

Browser requests to `/api/*`, the email callback and both Apple association
paths pass through the API service binding with their original
URL, request body, cookies, and response headers. Legacy-host browser visits
retain the existing redirect to `pinkslip.work`.

Public routes load through `@pinkslip/data` query options backed by the
credential-free `GET /api/v2/public/jobs` and `:id` endpoints: `credentials:
"omit"` in the browser, a fresh service-binding request on the server. SSR data
is dehydrated into the page and hydrated without a refetch. Hono returns a
bounded catalog preview and explicit job fields, excluding personal state and
internal source/moderation fields.
Closed, disabled-source, stale non-evergreen, and unapproved review-queue jobs
are excluded. This public projection is available even when the invite gate
protects personal APIs. It performs reads only: no guest creation, matching,
content backfills, or user activity writes. The personalized feed and full job
description renderer are later feature slices.

The token source and generator are implemented (chunk 1.2): `tokens.css`,
native values and kit unions are generated from `packages/tokens/src/tokens.ts`.
The current semantic CSS and font assets are preserved, with computed-value
equivalence against the frozen Svelte styles and a glyph-coverage check for the
Klim trials. The tiny theme bootstrap preserves the existing `pinkslip-theme`
preference before first paint. Foundation compositions remain in
[Quarantine](src/kit/COMPONENTS.md).

The data layer is `@pinkslip/data`: Query defaults, the public/personal key
factory, the `/me` session hook, job/Library query options and optimistic
save/apply updates. `getRouter()` creates a per-request QueryClient and API
client, passes them through router context and `DataProvider`, and
`setupRouterSsrQueryIntegration` dehydrates server-loaded data. Session
bootstrap, the invite gate and owner-change clearing in the shell arrive in 3.2.

The app loads exactly four global stylesheets in layer order: generated
`@pinkslip/tokens/tokens.css` (`@layer tokens`), `fonts.css`, `reset.css`
(`@layer reset`) and `base.css` (`@layer base`). Screens and kit components use
CSS Modules; `lint:css` enforces the ported rules (token-only colors and type,
no `!important`, nesting depth, weights 400/500/600), generated
`*.module.css.d.ts` files make class typos type errors, and
`scripts/check-webapp-governance.ts` rejects Base UI imports outside `src/kit/`,
string-literal `className`, non-custom-property inline styles and Tailwind.
shadcn and Linear are aesthetic references, with no required component API.

## Verification

The root check includes the React app, generated binding types, and browser
spec types. `bun test` covers the public projection using real SQLite queries,
private authorization boundaries, routing and header/cookie preservation.
Playwright covers public SSR without JavaScript, a real local job's SSR when
the catalog is populated, browser account reads, 404s, legal/AASA forwarding,
appearance, hydration, keyboard skip navigation, narrow layout, and axe.
Run `bun run db:seed:demo` if a fresh local database needs demo jobs.

Build packaging can be checked locally from this directory:

```sh
bun run build
bunx wrangler deploy --dry-run
```

## Brand icons

`public/favicon.svg`, the PWA and Apple touch PNGs and the notification badge are
generated from one mark by `bun run icons` (`scripts/generate-icons.mjs`). Its
geometry matches `src/features/shell/BrandMark.tsx`. The mark is a placeholder
until the commissioned logo.

## Cutover (chunk 3.4)

The Svelte site was replaced outright; its code is at the `svelte-final` tag.
`public/sw.js` replaces the old service worker at its URL and retires it
(`e2e/retirement.pw.ts`). Deploy steps and checks are in
[docs/port-chunk-3.4.md](../../docs/port-chunk-3.4.md). Keep the `noindex`
response and meta tags until the search-launch slice.

References: [Cloudflare's Start integration](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/),
[Vite auxiliary Workers](https://developers.cloudflare.com/workers/vite-plugin/reference/api/),
and [Start server entry](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point).
