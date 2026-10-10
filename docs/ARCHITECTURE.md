# Client architecture

Since chunk 3.4 of the port (`docs/REACT_EXPO_PORT_PLAN.md`), Pinkslip has one
client in production: the React web app. The Expo iOS app follows in Phase 6.
The Svelte web app, `packages/client` and the Capacitor iOS app were deleted;
read them with `git show svelte-final:<path>`.

```text
apps/webapp (pinkslip-web Worker) ── packages/data ── packages/core ── shared (@pinkslip/domain)
      │  service binding                                                     │
      └──────────────► Hono API Worker (pinkslip) ── D1 / R2 / queues / crons
apps/native (Phase 6) ── packages/data, packages/core, packages/tokens
```

Dependencies only point inward: apps → data → core → shared. `packages/tokens`
is the design-token source for both apps.

## Ownership

### `apps/webapp`

TanStack Start with React, Base UI and CSS Modules, deployed as the
`pinkslip-web` Worker. It owns both hostnames:

- It renders pages: SSR only where search or link previews need it, and
  client-only for personal pages.
- It forwards `/api/*`, the email sign-in callback and the Apple association
  files to the API through its `API` service binding (`src/server/routing.ts`).
- Every screen is built from the kit in `src/kit` (rules in
  `src/kit/COMPONENTS.md` and AGENTS.md). Base UI is imported only inside the kit.
- Route metadata (title, shell, depth, access) lives in
  `src/features/navigation/pages.ts`. The session gate reads `access`.

### `packages/data`

TanStack Query: query keys, option factories, the `/me` session hook and its
access states, and optimistic job updates. It is shared by the web and native apps.

### `packages/core`

Client logic with no UI framework or DOM: the typed API client (injectable
transport), resume parsing and import quality, the Typst resume document,
career-stage filtering, and job timing and formatting. Its TypeScript project
omits the DOM library, so `window` or `document` fails `bun run check`.

### `packages/tokens`

`tokens.ts` generates the web stylesheet, the native values and the kit's prop
unions. A check compares them with the frozen Svelte values kept in
`reference/`.

### Worker and shared domain

`shared/` is the `@pinkslip/domain` package: types and rules used by the Worker
and every client. The Worker remains the boundary for authorization and data,
and it serves no web assets. Browser sessions use secure first-party cookies;
native sessions use revocable `auth_sessions` IDs as bearer tokens.

## Where a change belongs

- A screen or route: `apps/webapp/src/routes`, composed from `src/kit` and
  `src/features`.
- A reusable visual control: `apps/webapp/src/kit`, with a `/_kit` demo and a
  `COMPONENTS.md` entry.
- Server data, caching or a mutation: `packages/data`.
- Logic with no UI or DOM dependency: `packages/core`.
- A domain rule or data shape: `shared`.

## Build and release

```sh
bun run dev          # web app with the API beside it, at http://127.0.0.1:3000
bun run check
bun test
bun run build
bun run deploy:backend   # API Worker: migrations, crons, queues
bun run deploy:web       # web Worker
```

The two Workers deploy independently. A backend deploy can't take the site down,
because the API carries no assets. Older native builds can outlive a deployment,
so API routes stay additive. A breaking contract gets a new version instead.
