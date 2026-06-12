# pinkslip — frontend (Svelte 5 + Vite + Capacitor)

A mobile-first job-alert app. The frontend is a **Svelte 5 single-page app built
with Vite**, served as static assets by the Cloudflare Worker in `../worker`, and
wrapped as a native iOS app by **Capacitor** (`ios/`).

> ⚠️ This file used to be the generic `bun init` template and told agents to use
> `Bun.serve()` + React + "don't use Vite." **That was wrong** and never matched
> this project. The stack described below is authoritative.

## Stack

- **Svelte 5** with runes — `$state`, `$derived`, `$props`, `$effect`. Do **not**
  use the legacy `export let` / `$:` API.
- **Vite 8** — dev server + bundler. `vite build` → `dist/`, which the Worker
  serves via `[assets]` and Capacitor packages into the iOS app.
- **Tailwind CSS v4** — CSS-first, **no `tailwind.config.js`**. Design tokens live
  in the `@theme {}` block in `src/app.css` (OKLCH colors, radii, font families).
- **Capacitor 6** — native iOS shell (push, haptics, share, status-bar, keyboard).
  Native setup + on-device testing live in `../IOS.md`.
- **TypeScript**, strict mode.

## Toolchain: Bun and Vite are not alternatives — they sit at different layers

Bun is the **package manager / script runner / test runner**. Vite is the
**frontend bundler**. You use both: `bun run build` runs `vite build`.

| Task | Command |
| --- | --- |
| Install deps | `bun install` |
| Frontend dev server (LAN-exposed, proxies `/api` → wrangler `:8787`) | `bun run dev` |
| Production build | `bun run build` (→ `vite build`) |
| Type-check | `bun run check` (→ `svelte-check`) |
| Re-sync the iOS app after a web change | `bun run ios:sync` |
| Run the Worker locally (from repo root) | `bun run dev` (wrangler) |
| Tests (from repo root) | `bun test` |

**Do not** replace Vite with `Bun.serve()` / HTML-imports: the Svelte and
Tailwind-v4 integrations are Vite plugins, and the deploy model is a static
`dist/` bundle (Worker assets + Capacitor), not a Bun server.

## Layout

- `src/pages/` — route screens, named after their routes: Feed, JobDetail,
  Tailor, Tracker, Events, Profile (`/profile` — account + settings sections,
  composed from `src/pages/profile/*Section.svelte`), ResumeProfile
  (`/resume`), Corpus (`/corpus`), Companies.
- `src/components/` — shared UI (JobRow, TabBar, Modal, FilterChips, Switch,
  Slider, …). All dialogs go through `Modal.svelte` (backdrop + focus trap +
  Escape, primary button LAST in action rows) — never `window.confirm`/`prompt`
  or hand-rolled overlays.
- Overlay roles are deliberate: dense temporary view controls use the feed
  bottom sheet; short forms and confirmations use centered `Modal.svelte`;
  row-scoped actions may use an anchored popover. Do not swap patterns without
  changing the interaction's role.
- `src/lib/` — non-UI logic: `api.ts` (typed client), scoring, formatting,
  pdf/typst resume generation, native bridges (`native-*.ts`), stores
  (`feed-store.svelte.ts` holds the shared feed state).
- `src/router.ts` — tiny hash router. `App.svelte` drives the iOS-style
  push/pop + edge-swipe-back.
- `src/app.css` — global design system: `@theme` tokens + shared component
  classes (`.btn-primary`, `.chip`, `.surface-card`, `.alert-*`,
  `.section-eyebrow`, …).

## Styling conventions

1. **Tokens, not literals.** Use the CSS variables from `@theme` and `:root`
   (`var(--color-ink)`, `var(--radius-md)`, `var(--fs-sm)`, `var(--space-4)`).
   Don't hardcode hex/oklch, one-off px radii, or off-scale font sizes in
   components. Minimum text size is `--fs-2xs` (11px).
2. **Shared primitives** (buttons, chips, cards, sheets, alerts) stay as
   classes in `src/app.css`.
3. **Component-specific styles** go in the component's scoped `<style>` block
   (see the bottom of `JobRow.svelte` for the reference pattern).
4. **Reserve inline `style="…"`** for genuinely dynamic values only
   (e.g. `transform: translateX({x}px)`), not static styling.
5. **Theming is `data-mode` only.** JS resolves "system" and always sets
   `data-mode` on `<html>` (inline script in `index.html` + `lib/theme.ts`), so
   light-mode CSS lives in the single `[data-mode="light"]` block. Never add
   `@media (prefers-color-scheme)` blocks — that's how the old duplicated
   theme CSS happened.

We are consolidating styling onto the above — don't add new inline-style soup,
and don't introduce a competing styling system.

## UI primitives (Bits UI)

Interactive primitives use **Bits UI v2** (headless: behaviour + ARIA + keyboard)
wrapped in thin components that wear our CSS. Prefer these over raw inputs:

- Toggles → `components/Switch.svelte` (not `<input type="checkbox">`)
- Sliders → `components/Slider.svelte` (not `<input type="range">`)

Bits parts render `data-*` attributes (e.g. `[data-state="checked"]`); style via
our classes in `app.css`. Keep custom gestures (swipe rows, pull-to-refresh,
back-swipe) hand-rolled — Bits only covers standard primitives.

## API + data

- Client: `src/lib/api.ts` — typed `api.*` namespaces; all calls hit `/api` with
  credentials. Add new endpoints here, typed.
- Backend: Hono Worker in `../worker`, routes under `../worker/routes/`.
  Storage: Cloudflare D1 (SQLite, `../migrations/`) + R2 (resume assets).

## Tests

`bun test` from the repo root. Tests use **`bun:test`** (Jest-style API), not
vitest. (`vitest.config.ts` at the root is legacy and unused.)

## Don'ts

- Don't remove `Wrench`-icon / "coming soon" placeholders — they're intentional
  roadmap markers, not dead code.
- Don't add `tailwind.config.js` (v4 is CSS-first via `@theme`).
- Don't reach for `any`; the API client and worker types are fully typed.
