# React + Expo port plan

Drafted 2026-10-09. Status: **in progress**. 0.1 and 0.2 are done. The [0.3 parity inventory](port-parity.md) is drafted; architecture and design direction were reviewed on 2026-10-09, with remaining feature-scope choices still recorded there. D1–D3, D5, D6, D11 and D12–D16 are decided; the rest are due at the chunk that needs them.
**2026-10-09 (owner, after reviewing the foundation):** switch over at 3.4 and accept the gaps; the ~dozen testers know there will be downtime. Native work waits for Phase 6. Review fixes applied: page security headers on the web Worker, the public job projection limited to roles the app lists (early-career stage, US, no clearance, has a description), and the dead `{ uri, name, type }` upload path removed. See `docs/port-foundation-review.md`.
The owner reaffirmed outright replacement in 3.4: no users yet, so no preview domain and no side-by-side running. Cutover remains at the shell/placeholder stage; it does not wait for the core feature loop.

Implementation started 2026-10-09: [web foundation](../apps/webapp/README.md)
now runs in the local Workers runtime, with public job SSR and client-only
account reads through Hono. [Design references](port-design/README.md) preserve
48 current captures, 26 historical baselines, the catalog, tokens and fonts.
The shared token package now generates `tokens.css`, native values and kit
unions from `packages/tokens/src/tokens.ts`, with computed-value equivalence
against the frozen Svelte styles. The Klim trials stay in place with a glyph
check that switches to strict full coverage when the bought files land. No production deployment or Svelte removal has happened.

Claude's current-attempt `port-1.1-webapp` starter manifest was reviewed and
used for the pinned runtime dependencies. Its worktree is untouched.
`port-1.2-tokens` still contains an uncommitted color-conversion helper to
review when implementing native token generation.

Fresh start. This plan was written without consulting the earlier React/Expo
attempt (`apps/web-react`, `apps/mobile`, `packages/ui`, `stash@{0}`). The live
Svelte app (`apps/web`, `packages/client`, `apps/ios`), `packages/core`, the
route map, `wrangler*.toml`, `docs/DEPLOYMENT.md` and
`docs/seo-audit-2026-10-03.md` were read only to take inventory.

---

## 1. Decisions already made

| Area | Decision |
|---|---|
| Web framework | **TanStack Start** (React 19, Vite 8). Public pages are rendered on the server (SSR); app pages render on the client. No Next.js |
| Server data | **TanStack Query**, shared by web and iOS |
| Web components | **Base UI** primitives with product-owned components and **CSS Modules**. No Tailwind. shadcn and Linear are visual references only; no dependency, naming, or anatomy requirement |
| iOS | **Expo** (SDK 57, Expo Router) with **native screens**. Share domain rules, API contracts, and applicable data hooks; each app owns its platform execution |
| API | **Hono stays the only API.** Web and iOS both consume it. Start's server functions don't become a second API |
| Design | Match the current Pinkslip design as closely as practical through Base UI, CSS Modules, tokens, and a documented kit. Consolidate repeated controls before porting screens |
| State | Query owns server data; validated web URLs own shareable filters; local/form state owns drafts and temporary UI. Add cross-screen stores only for demonstrated needs |
| Public data | Hono exposes an explicit public job projection; personal state remains session-owned. SSR clients and caches are request-scoped |
| Order | Web product first, iOS product second; prove native data access, resume import, and application-browser capabilities during foundations |

Why the web goes first: the web is the product today and iOS wraps it. Also,
the shared layer (tokens, core, Query hooks) gets exercised by the web product
while focused native experiments check its assumptions before broad adoption.

## 2. Target layout

```
shared/            exists  domain types + validation shared with the API
packages/core/     exists  pure client/domain transformations, transport factory and platform-neutral contracts
packages/tokens/   new     design tokens in TS → tokens.css (web), tokens.ts (native), and prop-type unions for both kits
packages/data/     new     React (no DOM): TanStack Query definitions/hooks and session coordination
apps/webapp/       new     TanStack Start app; kit in src/kit/, browser adapters in src/platform/ → Worker `pinkslip-web`
apps/native/       new     Expo app; kit in src/kit/, native adapters in src/platform/
worker/            exists  Hono API Worker `pinkslip`; loses its [assets] when the new site goes live (3.4)
──────── deleted when the new site replaces the old one (3.4) ────────
apps/web, packages/client  Svelte web shell + app
apps/ios                   Capacitor iOS wrapper (iOS gets no updates until the Expo app ships)
```

**Dependency rule:** apps → data → core → shared, and apps → tokens. Shared
runtime packages do not import React DOM, Base UI, React Native, or browser
storage/PDF execution. Apps import generated token CSS or native token values.
A pure kit component never fetches data or owns navigation.

### Ownership boundaries (D12–D14)

- **Shared:** domain types/validation, matching and formatting rules, API
  request/response contracts, pure resume transformations, and applicable
  Query definitions/hooks. Define narrow capability contracts where shared
  behavior needs a platform service; apps provide the implementations.
- **App-owned:** routing/navigation, file picking and storage, PDF extraction
  and rendering, notification registration, credential storage, haptics,
  share/mail handoff, and the application-browser bridge. Browser DOM scripts
  for form filling may be shared as generated payloads; their execution lives
  in the employer WebView, never in Hermes or SSR.
- **Server state:** Query is the client cache authority. List/detail/library
  changes update or invalidate that cache; do not mirror those resources in
  a second global store. Persistence is a platform adapter and follows the
  explicit offline scope decision.
- **Navigation and drafts:** validated web search parameters own committed,
  shareable filters. Filter-sheet edits stay local until Apply. Form drafts,
  modal visibility, and edit focus remain local. Autosave sequencing and
  application-return workflows are feature behavior; Query does not replace
  them. Native route parameters and local state serve the same user intent.
- **Cross-screen state:** add a store only for a concrete workflow that does
  not belong in Query, navigation, or local state; record its owner and reset
  rules. Zustand is an option, not a foundation dependency.
- **Public versus personal:** public SSR reads only a Hono-owned public job
  projection, with no user/admin token or guest-session creation. Saved,
  applied, viewed and other personal fields load through session-scoped
  queries on the client. Keep public and personal query keys/data separate;
  scope every server API client and QueryClient to its request.

`apps/webapp` and `apps/native` are working names. Rename `webapp` → `web` once
the Svelte app is deleted, if you like.

### Hosting topology (recommended, D5)

```
pinkslip.work/api/*  ─────────────────────────────▶  pinkslip      (Hono API, D1, R2, queues, crons)
pinkslip.work/*      ──▶  pinkslip-web (Start SSR) ──service binding──▶ pinkslip
```

A separate web Worker that reaches the API through a **service binding** (an
in-process call with no network hop):
- **Makes API and web deploys independent.** This fixes the 2026-10-05 incident
  structurally: a backend-only deploy dropped the `ASSETS` binding and 404'd
  every page, and `deploy:backend` was disabled until 3.4 made it safe again.
- **Keeps React SSR code out of the API Worker's bundle and CPU budget.**
- **Lets Start use its standard Cloudflare setup** with no custom glue.

Dev runs both Workers in one `vite dev` (the Cloudflare Vite plugin runs the
API as an auxiliary Worker). Same hostname, so no CORS and no cookie issues.
There's no preview domain. The web Worker runs locally until chunk 3.4, when it
takes over `pinkslip.work` and `pinkslip.alip.dev` and the Svelte site is deleted.
There are no users yet, so production is the test site from then on.

**Cost clarification (checked 2026-10-09):** the recorded $5/month Workers plan
does not need a second subscription for the web Worker. SSR adds metered
requests and CPU, shared with existing usage. Standard includes 10 million
requests and 30 million CPU milliseconds/month; excess costs $0.30/million
requests and $0.02/million CPU milliseconds. Ordinary service-binding calls
add CPU but no second request charge; Workers Caching has separate counting
rules. Actual incremental cost depends on account usage, which this handoff
has not inspected. [Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/).

## 3. Stack

| Concern | Web | iOS | Shared |
|---|---|---|---|
| Framework | TanStack Start 1.168 | Expo SDK 57 / RN 0.87 | — |
| Routing | TanStack Router (inside Start): typed params and typed, validated search params | Expo Router: native stacks, tabs, form sheets | Route names and path shapes |
| Server state | TanStack Query 5, with the SSR cache sent to the browser through Start | TanStack Query 5, cache persisted to disk | `packages/data` hooks |
| Client state | Validated URL filters; local component/form drafts | Native navigation parameters; local component/form drafts | Only demonstrated cross-screen workflows; no duplicate server-data store |
| Forms | TanStack Form or React Hook Form (D4) | Same library | Validation schemas in `shared/` |
| Components | Base UI 1.9 + CSS Modules matching current design | Own kit on Unistyles (D8) + Expo UI for system controls | Semantic names/tokens and compatible props where the behavior matches |
| Icons | `@phosphor-icons/react` | `phosphor-react-native` | Same icon set as today |
| Long lists | TanStack Virtual | FlashList 2 | — |
| Tests | Playwright + axe (flows), bun test (logic) | Maestro (flows), bun test (logic) | bun test |

Things deliberately left out:
- **TanStack Start server functions.** Hono is the API.
- **TanStack DB.** Too young to build on.
- **TanStack Table.** Revisit for admin in 4.14 if the tables are painful.
- **Next.js, Tailwind/NativeWind.**

## 4. Styling contract (web)

### Current-design target (D15)

The current Svelte web and Capacitor screens are the visual references. Retain
Pinkslip's fonts, ink hierarchy, colors, density, spacing, surface treatment,
icon states, and responsive compositions as closely as practical. Use the
existing component catalog and semantic tokens to settle repeated decisions.
Onboarding remains the separately recorded redesign; other visual changes need
a reason and review rather than arising incidentally during the rewrite.

Build the kit in Phase 2 before the feature screens. Map actual existing
patterns to its controls, compositions, or feature components; the candidate
list is not a requirement to wrap every Base UI export. Base UI provides
supported interaction mechanics, while our CSS Modules provide Pinkslip's
appearance. Reuse those mechanics instead of rebuilding focus, menus, or
dialog behavior per screen. Document any genuine missing capability.

Chunk 0.4 preserves reference screenshots and a pattern map before Svelte is
removed. Chunk 2.4 compares controls and representative compositions against
those references; each Phase 4 screen repeats the comparison at screen scale.
Screenshots do not automatically approve a component. New implementations
remain in Quarantine under the catalog's normal promotion rules.

### Product-owned components on Base UI

The owner clarified that shadcn and Linear are aesthetic references only.
Pinkslip's current design, actual use cases, and Base UI's supported behavior
determine our component contracts:
- **We own every component's source**, in `apps/webapp/src/kit/`.
- **Choose names and composition for Pinkslip's use cases.** No obligation to
  copy another kit's anatomy, prop API, file structure, or implementation.
- **Interactive controls wrap the applicable Base UI parts.** Typography,
  layout, and feature compositions use semantic markup and documented tokens;
  they do not need an artificial Base UI wrapper.
- **No shadcn dependency or generated components.** Base UI supplies behavior;
  the current tokens and CSS Modules supply appearance.

```
src/kit/button/
  Button.tsx
  Button.module.css
  index.ts
```

```tsx
import { Button as BaseButton } from "@base-ui/react/button";
import styles from "./Button.module.css";

type ButtonProps = Omit<BaseButton.Props, "className" | "style"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ variant = "secondary", size = "md", ...props }: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={styles.root}
      data-variant={variant}
      data-size={size}
    />
  );
}
```

```css
@layer kit {
  .root {
    padding-inline: var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-control-bg);
    color: var(--color-ink);
    font-weight: 500;
  }
  .root[data-variant="primary"] {
    background: var(--color-accent);
    color: var(--color-accent-ink);
  }
}
```

### Rules

1. **Values only come from tokens.** Component CSS uses `var(--color-*)`,
   `--fs-*`, `--space-*` and `--radius-*`. The current stylelint rules carry over:
   - font weights 400/500/600 only
   - no `!important`
   - no ID selectors
   - nesting depth of 2 or less
   - a `/* intentional: why */` comment for each one-off value
2. **Variants are data attributes, not class maps.** Use `data-variant` and
   `data-size`. Base UI's own state attributes (`data-open`, `data-disabled`,
   `data-highlighted`, `data-starting-style`/`data-ending-style` for enter and
   exit animations) get styled the same way. No `cva`, and no variant strings
   built with `clsx`.
3. **Cascade layers:** `@layer reset, tokens, base, kit, app;`. Kit modules go in
   `@layer kit`, screen modules in `@layer app`, so screen-level overrides always
   win without specificity fights.
4. **`className` on kit components is for placement only:** margin, grid area,
   width. Never color or type.
5. **Typography and spacing are components:** `<Text size="sm" tone="ink-3" weight="medium">`,
   `<Heading level={2}>`, `<Stack gap="3">`, `<Inline gap="2" align="center">`.
   Their prop types are unions generated from tokens, so an off-scale value is a
   **type error**. The native kit reuses semantic names and compatible props
   where they fit; native navigation, menus, and form controls keep their own
   platform contracts.
6. **The global CSS is exactly four files:** `tokens.css` (generated),
   `reset.css`, `base.css` (body, selection, focus ring) and `fonts.css`. No
   other global styles, and no `:global()` outside them.
7. **No inline `style`,** except to pass dynamic values as custom properties
   (`style={{ "--progress": pct }}`).
8. **CSS Modules are typed** (generated `.d.ts`), so a typo in `styles.foo`
   fails the type check.
9. **`@base-ui/react` is imported only under `src/kit/`.** Screens import from the kit.

Rules 1–3 and 6–9 are enforced by stylelint plus a governance script in
`bun run check`. Rule 4 is enforced by review.

Visual hierarchy still comes from the ink ramp plus the weight ladder (CLAUDE.md), not
from extra font sizes.

## 5. How the migration runs

- **Replace, don't run side by side.** There are no users, so there's no preview
  domain, gradual cutover or compatibility window. The Svelte app gets no new
  work, and API changes don't have to keep it working. It stays up, untouched,
  until chunk 3.4 replaces it. Then `apps/web`, `packages/client` and `apps/ios`
  are deleted, with a `svelte-final` tag pointing at the last version.
- **Reading the old code after 3.4.** The parity checklist is the primary
  reference. For details, read the tagged code with
  `git show svelte-final:<path>`, or check it out read-only with
  `git worktree add ../pinkslip-svelte svelte-final`.
- **Develop locally, then production is the test site.** Until 3.4, use
  `bun run dev:web` (the phone can reach it over the LAN). After 3.4, each slice
  ships to `pinkslip.work` once it's verified locally and you've OK'd it.
  `noindex` stays on until the SEO slice (4.16) lands.
- **Preserve logic with the right owner.** Audit candidate modules in
  `packages/client/src/lib` during 1.4. Move pure rules into `core`; rewrite
  Svelte state as Query definitions, feature hooks, or local state according to
  its owner. Browser/native execution moves to app adapters. Preserve required
  algorithms, fixtures, and reference assets before deleting Svelte in 3.4.
- **Parity checklist.** `docs/port-parity.md` (chunk 0.3) lists, per route:
  - every behaviour
  - every state: loading, empty, error, guest, signed-in
  - every API call
  - native behaviours
  - redirects

  A slice is done when its rows are ticked.
- **Parity tests.** The existing Playwright harness (`api-mocks`, `static-server`,
  axe) moves to `apps/webapp/e2e`. Each slice ports its specs to role- and
  label-based selectors, which test behaviour rather than markup.
  `design-system-contracts` and `visual-contracts` get new kit and screen specs
  (chunk 2.4 and Phase 4). Keep the old images as visual references; do not
  replace them with new snapshots without inspecting differences.
- **Rendering policy.** SSR is used only where Google or link previews need it:
  - `/jobs/:jobId`, `/about`, and the homepage's public content get SSR, rendered
    from anonymous public data. The user's own state (saved, applied) fills in on
    the client through separate session-scoped queries.
  - Library, You, admin and tailoring are client-only.

  Public rendering does not consume personal credentials. Auth callbacks and
  API forwarding remain server responsibilities; every SSR path still needs
  request isolation and a browser-free import graph.
- **Rollback.** `wrangler rollback` on either Worker. Before 3.4 is verified,
  moving the custom domains back to the API Worker restores the Svelte site.

### Definition of done (every web slice)

1. Data hooks exist in `packages/data`, with optimistic updates where the Svelte
   app had them.
2. The screen is built only from kit components plus that screen's own module CSS.
3. Loading, empty, error, guest, narrow and wide states all work, in dark, light
   and increased contrast.
4. Its parity rows are ticked, its Playwright + axe specs pass, and screenshots
   have been compared with the preserved current-design references. Intentional
   differences are documented and reviewed.
5. You've used it (locally, or on `pinkslip.work` after 3.4) and said it's good,
   then it's committed and deployed. Nothing is pushed or deployed without your OK.

**Sizes:** S ≈ one sitting · M ≈ 2–3 sittings · L ≈ a week of sittings · XL = split it.

---

## 6. Chunks

### Phase 0: Clear the decks

**0.1 Land in-flight work and freeze Svelte** · S · needs D2 · ✅ done
Finish and commit the answer-bank feature, which is uncommitted now. It touches
14 files, including `AnswersSection.svelte`, `worker/apply/answer-bank.ts`, the
`/you/answers` route and `tests/apply-answers.test.ts`. Then add the freeze rule
to CLAUDE.md.
*Done when:* the working tree is clean, the answer bank works on web and iOS, and the freeze is written down.

**0.2 Remove the earlier attempt from main** · S · needs D1 · ✅ done
- Delete `apps/web-react`, `apps/mobile`, `packages/ui` and the empty `apps/web-svelte`.
- Remove them from `bun run check`.
- Fix the stale CLAUDE.md lines: the fonts section says Geist under `frontend/`,
  but the live app loads Klim "Untitled Sans" and "Founders Grotesk" from
  `packages/client`. The iOS line is also stale.

Git history and `stash@{0}` keep everything.
*Done when:* `bun run check` passes and the tree has only live code.

**0.3 Parity inventory** · M · inventory drafted; owner scope review pending
Write `docs/port-parity.md` covering all 19 app routes (including
`/you/answers`) plus `/about`, the compatibility redirects, the legacy `/#/` URL migration, the platform
behaviours (haptics, share, push, in-app application browser, autofill) and
every API call per screen. Sources: the Svelte pages, `packages/core/src/api.ts`
and the existing e2e specs.
Draft: [port-parity.md](port-parity.md), including 19 app routes, `/about`,
shared flows, API calls, redirects, platform behavior, test gaps, and explicit
differences between existing behavior and planned additions. No scope cuts
have been assumed. Review the scope before marking complete; D7/D9 may remain
conditional until their assigned chunks. Record the offline web tradeoff explicitly.
*Done when:* every route has rows, and you've read it and cut anything not worth porting.

**0.4 Current-design references and pattern map** · M · needs D15
Progress: [references and pattern map](port-design/README.md) captured on
2026-10-09. Remaining native/menu/loading/toast/autosave evidence is recorded;
new implementations still need visual review.
- Capture or verify current screenshots with deterministic fixture data for
  Jobs/list filters, detail, Library, You/settings, resume, companies, and the
  shared loading/empty/error/dialog/menu states. Include narrow and wide web,
  dark/light, and native reference screens for the later Expo kit.
- Existing visual-test baselines are starting evidence; record which were
  verified against the current app, and distinguish missing captures from
  approved references. Keep increased-contrast and keyboard states represented.
- Record each repeated visual pattern's source, tokens, existing call sites,
  target Base UI control or composition, and review status. Keep domain behavior
  in feature components. Consolidate equivalent one-offs into the documented
  canonical pattern; do not promote generic primitives without the reuse threshold.
- Preserve screenshots, the pattern map, fonts, and catalog references outside
  the Svelte directories before 3.4. A reference is not blanket approval of
  the old Quarantine entries or new implementations.

*Done when:* Phase 2 has a concrete visual reference and mapped existing use
for each planned kit pattern, with remaining capture gaps explicitly recorded.

### Phase 1: Foundations

**1.1 Start app and web Worker** · M · needs D5 · ✅ implemented locally
See [setup, contracts and cutover preparation](../apps/webapp/README.md).
Public list/detail SSR, a client-only account route, service-binding forwarding,
private authorization, noindex, and real 404s are covered by unit/browser checks.
Foundation route compositions remain in Quarantine until the kit/screen port.
- Scaffold `apps/webapp`: TanStack Start, React 19, Vite 8 and the Cloudflare Vite
  plugin, deployed as Worker `pinkslip-web` with a service binding to `pinkslip`.
- `/api/*` is forwarded through the binding. Preserve the Worker-owned email
  callback, both Apple association URLs, privacy/support/legal stylesheet,
  and legacy-host handling too; see N02 in the parity inventory.
- One server-rendered page and one client-only page prove two things: a server-side
  fetch through the binding works, and a browser fetch to the same origin works.
- `X-Robots-Tag: noindex` on everything.
- Deploy config for `pinkslip.work` and `pinkslip.alip.dev` is prepared but not
  run; the deploy happens in 3.4.
- Public job SSR needs an explicit anonymous read contract: today's job API
  requires a session, and a service binding does not bypass that check. Keep
  crawler reads free of guest-session creation and personal data.
- Define the public projection in Hono and prove that it omits personal fields,
  creates no session, and leaves private endpoints protected. Public reads use
  neither browser cookies nor bearer credentials; separate user-interaction
  queries own saved/applied/viewed state.

*Done when:* `vite dev` runs the API and web together, with D1, against your local data.

**1.2 Tokens package** · M · needs D3 · ✅ implemented locally
The TS source of truth (`packages/tokens/src/tokens.ts`) generates
`tokens.css`, native values and kit prop unions. Fonts and the first-paint theme
bootstrap are in place, and `bun run check` enforces both computed-value
equivalence with the frozen Svelte styles (95 values across 32 cascade contexts)
and the font glyph contract.
- Port `packages/client/src/styles/tokens.css` into a TS source of truth:
  - the dark default, `[data-mode="light"]`, and the increased-contrast variants
    (including iOS increased contrast)
  - reduced motion and breakpoints
- A generator emits:
  - `tokens.css`, keeping the same custom-property names
  - `tokens.ts` for native
  - the prop-type unions for both kits
- Fonts (Klim, per D3), and a theme bootstrap that runs before first paint so SSR pages
  don't flash the wrong theme.
- **Glyph check.** An earlier set of Klim trial files was cut down to 67
  characters, so `:` `(` `$` `%` `/` `'` `…` quietly fell back to Helvetica
  (CLAUDE.md). Add a test that renders the full punctuation set and fails if
  any character falls back. Run it against the bought fonts before launch.

*Done when:* a script shows the generated CSS resolves to values identical to today's
computed values.

**1.3 CSS architecture and enforcement** · S · ✅ implemented locally
The webapp now loads exactly four global stylesheets in layer order: generated
`tokens.css` (`@layer tokens`), `fonts.css`, `reset.css` (`@layer reset`) and
`base.css` (`@layer base`). The stylelint config is ported to `apps/webapp`,
where it lints plain `.css` files for real — the old `postcss-html` override left
them unchecked, which surfaced and fixed a deprecated `appearance: button`.
CSS modules emit typed `.d.ts` declarations, and
`scripts/check-webapp-governance.ts` fails on Base UI imports outside `src/kit/`,
string-literal `className`, non-custom-property inline styles and Tailwind. Each
check was verified against a deliberately bad fixture.

- The four global files and the layer order.
- The stylelint config ported, plus CSS-Module rules.
- Typed CSS Modules.
- A governance script, wired into `bun run check`. It enforces:
  - `@base-ui/react` imported only under `src/kit/`
  - no string-literal `className`
  - no literal `style` values
  - no Tailwind dependencies

*Done when:* a deliberately bad file fails each check.

**1.4 Core transport and lifted logic** · M · ✅ implemented locally
`createApiClient(config)` now builds an isolated client — its own `fetch`, base
URL, client/build headers and token callbacks — while the legacy `api`,
`configureApiClient`, `resolveApiUrl` and `apiFetch` exports keep the default
same-origin browser client working. The autosave registry moved to core with the
page-hide binding left in `packages/client`, and
`autofillScript(payload, bridge)` can report through an Expo WebView transport.
The audit in [`packages/core/README.md`](../packages/core/README.md) records the
owner for every `packages/client/src/lib` module; pure modules move only after
the 1.6 native experiments validate the boundaries. Svelte behaviour is
unchanged. `bun test` and `bun run check` pass; the Svelte web e2e run still has
three pre-existing visual-contract snapshot diffs (`you-preferences`
desktop/mobile and `onboarding` mobile, all whole-page text-metric ghosting) and
a flaky font-preload spec. They reproduce without 1.4 and were left untouched
rather than re-baselined.
- **Injectable transport.** The `packages/core` API client takes its `fetch`,
  base URL and token provider as inputs, so the same client works in three places:
  - in the browser (relative URLs)
  - during SSR (through the service binding)
  - on native (absolute URL, bearer token from secure storage)
- Use per-request client configuration and Query caches on the server; the
  current module-global client configuration cannot safely own SSR sessions.
- **Audit and move by responsibility.** Candidates include formatting,
  job-content/navigation, viewed state, autosave lifecycle, resume parsing and
  compilation, import orchestration, form-reader/filler and auto-apply. Move
  only pure transformations, shared workflows with injected dependencies, and
  platform-neutral contracts into `core`, with their applicable tests.
- Rewrite viewed/server state under Query; split navigation and autosave
  lifecycle from their router/document bindings. Keep DOM sanitization,
  PDF.js/Worker/WASM execution, local resume storage and platform bridges in
  app adapters. Preserve the pure parser and domain validation in shared code.
- Exercise the boundaries in 1.6 before migrating every module. Expand the
  shared layer only after the browser and native prototypes validate it.
- **Autofill bridge.** The bridge call
  (`webkit.messageHandlers.pinkslipAutofill`) is abstracted so the Expo WebView
  can supply its own.

Svelte behaviour stays unchanged.
*Done when:* the Svelte web and iOS apps pass check, tests and e2e on the moved code.

**1.5 Data package** · M · ✅ implemented locally
`packages/data` (React, no DOM) owns `createAppQueryClient`, the
public/personal `queryKeys` factory with `clearPersonalQueries` for owner
changes, the session hook, public and personal job options, Library hooks and
optimistic save/apply cache updates with rollback. The webapp creates a
per-request QueryClient and API client in `getRouter()`, passes them through
router context and `DataProvider`, and `setupRouterSsrQueryIntegration`
dehydrates server-loaded data; a Playwright test asserts zero browser requests
to the public catalog after hydration.
- QueryClient defaults and a query-key factory, with public/personal key
  separation and owner-change clearing/cancellation.
- Initial hooks for session, jobs, job detail, and Library. Add profile,
  preferences, alerts, companies, resume, answers, apply, outreach, and admin
  hooks with their feature slices, following the same ownership rules.
- Optimistic save/apply.
- A session hook.
- Inject narrow platform capabilities where shared coordination needs them;
  implementations live in each app's `src/platform/`. Pure UI receives props
  and callbacks instead of importing those services.
- Define one owner for every state: Query for server resources, URL for
  committed web filters, local/form state for drafts, and feature coordination
  for save/return workflows. No generic global store is required to start.
- Start's Query SSR integration, so server-loaded data reaches the browser without a refetch.

*Done when:* the 1.1 pages use the hooks, and no request repeats after hydration.

**1.6 Early native feasibility experiments** · three focused chunks · needs D16
Run once the minimal contracts from 1.4/1.5 exist, before expanding the shared
layer and feature screens. These prove capabilities; the product iOS build
still follows the web product in Phase 6.

**1.6a Data and session** · S · ✅ implemented and exercised on an iOS 26.4 simulator
`apps/native` is a minimal Expo SDK 57 app: a SecureStore-backed guest bearer
session against the local Worker (`POST /api/v2/native/session`), the
`@pinkslip/data` session and jobs hooks, native token values, and a prototype
screen (Quarantine). Metro/Hermes bundles it (641 modules, 1.6 MB `.hbc`) with a
singleton resolver for React/Query, and a root test keeps core/data/tokens free
of DOM and Svelte. The run/observation checklist is in
[apps/native/README.md](../apps/native/README.md); known gaps recorded there are
native font families (6.2) and real owner changes needing sign-in (6.3). The
simulator run verified guest session mint/reuse, feed titles and clean module
loading, and exposed a real `clearPersonalQueries` bug: `removeQueries` on a
mounted hook orphaned it pending forever, now `resetQueries` plus inactive
removal with a regression test.
A minimal Expo development app imports `core`, `data` and `tokens`, establishes
a bearer session against the local Worker, and lists job titles. Exercise
token storage/rotation and owner changes. Verify Metro/Hermes imports have no
accidental DOM or Svelte dependency.

**1.6b Resume import and file lifecycle** · M · resolves D10 · ✅ exercised on the iOS simulator
Pick fixture PDFs on iOS, preserve the local attachment, parse text and scanned
examples through the available server path, and test a WebView fallback if
needed. Exercise multipart uploads, authentication, malformed/protected PDFs,
cancel/error recovery, preview, and deletion. Compare outputs with the current
parser/assessment contract; document the chosen server/WebView strategy and
any device limitations before implementing the full editor.

The prototype stages a picked or bundled PDF in app documents, uploads it
through the shared client, maps server errors and deletes the local copy.
Observed on iPhone 17 / iOS 26.4 against the AI-enabled Worker: text PDF →
parsed profile; no-text PDF → `no_extractable_text`; malformed → `invalid_pdf`;
`/resume-import/ocr` parses a rendered page image. Multipart needs
expo-file-system's `File` Blob; the `{uri,name,type}` triple fails in Expo's
native fetch. Details, harness commands and remaining gaps are in
[apps/native/README.md](../apps/native/README.md).

**1.6c Application browser and autofill bridge** · M · ⏸ parked 2026-10-09 until Phase 6, so the web port (and the features waiting on it) comes first
Use controlled form fixtures to prove injected read/fill scripts, file
attachment, page changes, typed bridge messages, timeout/close cleanup, and
manual completion. Verify Pinkslip credentials stay outside the form page.
Exercise submission detection and feature-gated submission only against test
forms. Record which ATS behaviors need later integration checks in 6.10.

*Done when:* each experiment has reproducible steps and observed results on
an iOS runtime, with physical-device-only checks identified; D10 and the
required adapters are recorded. Compilation alone is insufficient. Keep useful
fixtures/contracts, while prototype UI remains in Quarantine. Failed experiments
change the adapter design before broad feature implementation.

### Phase 2: Web kit

This remains a dedicated phase ahead of feature-screen implementation. Use
0.4's current-design references and pattern map to choose and style components;
the goal is consistent reuse of Pinkslip's current design. Keep new kit entries
in its catalog's Quarantine section until reviewed, with existing call sites
as evidence for the reuse threshold.

**2.1 Foundations** · M · ✅ implemented locally (2026-10-09): `Text`, `Heading`, `Stack`/`Inline`, `Surface`, `Icon`, `Separator`, `VisuallyHidden`, `Spinner`, `Skeleton`, `Badge`, and the dev-only `/_kit` page
- Components: `Text`, `Heading`, `Stack`, `Inline`, `Icon` (Phosphor, token
  sizes only), `Separator`, `VisuallyHidden`, `Spinner`, `Skeleton`, `Badge`,
  documented grouped-surface and layout compositions.
- A dev-only `/_kit` playground that renders every component in every state.

**2.2 Actions and inputs** · L · ✅ implemented locally (2026-10-09): `Button`, `LinkButton`, `IconButton`, `Field`, `Input`, `Textarea`, `Select` (native), `Fieldset`, `Form`, `Checkbox`, `SelectCheck`, `Switch`, `ToggleGroup` (chips and segmented), `Alert`, `SaveStatus`. `RadioGroup`, `NumberField` and `CheckboxGroup` are skipped (no call site in the current app); `Combobox`/`Autocomplete` was deferred to 2.3, which then skipped it too (no call site)
- Actions: `Button`, `IconButton`, `LinkButton`.
- Text inputs: `Input`, `Textarea`, `Field` (label plus error, with **no
  description slot by default**, to keep text light), `Fieldset`, `Form`.
- Choice controls: `Checkbox`, `CheckboxGroup`, `Switch`, `RadioGroup`, `Select`,
  `Combobox`/`Autocomplete` (company and location search), `NumberField`,
  `ToggleGroup` (filter chips).
- Status: `SaveStatus`.

**2.3 Overlays and feedback** · L · ✅ implemented locally (2026-10-09): `Dialog` and `Sheet` (both on Base UI Drawer, so swipe-down dismissal replaces `drag-dismiss.ts`), `AlertDialog`, `Menu` (with `MenuItem`, `MenuCheckboxItem`, `MenuSeparator`), `toast` + `ToastProvider`, `Tabs`, `Disclosure`, `Progress` (bar and steps), plus `Tooltip`, `Popover` and `InfoTip`, which the owner asked for although the Svelte app had none. `Meter` and `Combobox`/`Autocomplete` are skipped: no call site. Add them when a screen needs one
- Overlays: `Dialog`, `AlertDialog`, `Drawer` (bottom sheet, which Base UI's
  Drawer provides with swipe-to-dismiss, replacing `drag-dismiss.ts`), `Popover`,
  `Menu`, `Tooltip`.
- Feedback: `Toast` (Base UI's toast manager), `Progress`/`Meter`.
- Disclosure: `Tabs`, `Accordion`/`Collapsible`.

**2.4 Kit verification** · M · ✅ implemented locally (2026-10-09): `apps/webapp/e2e/kit.pw.ts` runs axe (WCAG 2.1 A/AA) on `/_kit` in dark, light and increased contrast; keyboard and focus-return tests for Dialog, Sheet, AlertDialog, Menu, checkbox Menu, Popover, Tooltip and Tabs; and full-page screenshot baselines at 390px and 1280px in each theme (`e2e/kit.pw.ts-snapshots/`). The kit intentionally diverges from the 0.4 references after the owner's design review (`docs/kit-design-review.md`: 4px spacing, aligned heights, radius scale, pastel accent fill with dark text), so the baselines are the accepted look, not a match to the Svelte screenshots
- Playwright screenshots of `/_kit` in dark, light and increased contrast, at
  narrow and wide widths.
- Compare with 0.4's references using the same fixture content and viewport.
  Include representative static compositions (job row, settings group, filter
  sheet), so a control that looks correct alone is also checked in context.
- Check fonts, density, spacing, colors, borders/radii, icon states, and
  loading/disabled/selected/focus/open states. Record intentional differences;
  a changed snapshot is not itself evidence that the new appearance is right.
- An axe pass.
- Keyboard and focus-return tests for every overlay.

*Done when:* reference comparisons and behavior checks pass, visual differences
are reviewed, and the accepted kit screenshots are committed as baselines.
Feature-screen comparisons continue in Phase 4.

### Phase 3: Web shell

**3.1 Routes and layout** · M · ✅ implemented locally (2026-10-09): all 19 app routes plus About/legal routes, explicit page SSR policy, typed `staticData.page`, nested sidebar/phone section navigation, eight compatibility redirects and legacy hash migration, history Back with safe direct-link fallbacks, keyboard route focus, scroll restoration and reduced-motion-aware depth transitions. Product screens remain placeholders. Checks, 902 unit tests, all three frontend builds and 41 distinct browser checks pass; existing kit screenshot baselines are unchanged. Details and owner testing flows: [port-chunk-3.1.md](port-chunk-3.1.md). New shell compositions remain in Quarantine for owner review Reviewed and revised 2026-10-10 (`docs/port-review-3.1.md`): the screen bar, Library tabs and You rows now follow the current design.
- All routes as Start routes, each with its SSR flag.
- `staticData` carries what `route-config.ts` carries today: shell, depth, root
  destination, titles.
- Compatibility redirects and the legacy `/#/` migration.
- Root layout: header, a tab bar at narrow widths, side navigation at wide widths.
- Back navigation, view transitions by route depth, scroll restoration.
- Real 404s with a 404 status, which fixes the audit's soft-404s.

Screens are placeholders at this stage.

**3.2 Session and access** · M · ✅ implemented locally (2026-10-10). Each page's metadata has an `access` level: `public` (catalog, job detail, About, legal, 404s) never waits for the session; `personal` waits and shows the access gate when the deployment is locked; `admin` also requires `is_admin` and otherwise renders the 404 page. The session query distinguishes `locked` (401 `access_required`) from anonymous. The shell owns `useOwnerChangeCleanup` and the email sign-in result (`?auth=email-success|email-expired` from the API's `/auth/email/verify` redirect becomes a toast and the parameter is removed). Sign-out (`useSignOut`) is on the Account placeholder with the current confirmation. `e2e/session.pw.ts` covers the gate, admin guard, email result, sign-out and a failed session load. Decisions: the catalog stays readable behind the access code (the API's public projection already is; the Svelte app gated everything); Apple sign-in stays iOS-only as in the Svelte web app (`appleAvailable: () => false`), so web Apple sign-in moves to Phase 6 with native auth; email sign-in *start* and onboarding come with the Account and onboarding screens in Phase 4
- Session bootstrap and guest browsing.
- The invite gate.
- Apple sign-in (web) and the email sign-in result.
- The admin guard and sign-out.

**3.3 Shared states** · S · page-level states ✅ implemented locally (2026-10-09): kit `EmptyState`; `features/states/PageStates.tsx` with the 404 page (root `notFoundComponent`), a missing-job 404 (`/jobs/$jobId` `notFoundComponent`) and the route error page (router `defaultErrorComponent` plus root `errorComponent`, with "Try again" that resets and invalidates); dev-only `/_kit-error` to exercise it; `e2e/states.pw.ts`. Rest ✅ (2026-10-10): `Alert` takes an icon, title, action and a compact size; `features/states/LoadStates.tsx` has `PageLoading` (also the router's `defaultPendingComponent`), `PageFailure` and `InlineFailure`; an offline strip on every page follows Query's `onlineManager` (Query pauses requests offline and refetches on reconnect, so there's no retry button); the session gate blocks only the first session load, so a failed background refresh keeps the page and You shows an inline failure. The toast viewport and empty states came with 2.3
- A route error boundary (page-level and inline failures).
- Pending UI, empty states, an offline banner, and the toast viewport.

**3.4 Replace the Svelte site** · M · ✅ local work done (2026-10-10), domains moved in config; deploy pending, see [port-chunk-3.4.md](port-chunk-3.4.md). Tagged `svelte-final` (`bb3c986`) and deleted `apps/web`, `packages/client`, `apps/ios`, their tests and scripts, and `wrangler.backend.toml`; first moved out the public files, the resume compiler's fonts (with its own Typst compiler dependency), verbatim Svelte token CSS for the equivalence check, `resume-document.ts` (to core) and `job-content.ts` (to the web app: it uses the DOM), and the Playwright API mocks. `/sw.js` is the kill switch (`e2e/retirement.pw.ts`). Scripts: `dev` is the web app, `deploy:backend` is safe again, `deploy:web` deploys the built web config, `deploy` runs both; CI builds the web app only. The owner chose a placeholder logo at the same time: two stacked slips, mark only, no wordmark. The domains moved to `pinkslip-web` in config; the API has `workers_dev = false`. Left for the owner: disabling Xcode Cloud, then push and deploy
- Outright replacement remains at this shell/placeholder milestone, as
  reaffirmed by the owner. Feature screens follow in Phase 4.
- Port the Playwright harness (`api-mocks`, axe) to `apps/webapp/e2e` before
  `apps/web` goes, and run it in `bun run check`.
- Confirm 0.4's current-design references, token/font sources, catalog, and
  reusable test fixtures survive outside the directories being removed.
- Tag `svelte-final`, then delete `apps/web`, `packages/client` and `apps/ios`
  plus their dependencies (Svelte, bits-ui, Capacitor, `postcss-html`). Update
  `bun run check`, the governance script, CLAUDE.md and AGENTS.md.
- Deploy `pinkslip-web` and move both hostnames to it (cutover option from
  1.1's README). Remove `[assets]` from the API Worker and bring back a safe
  `deploy:backend`. Confirm crons and queues are unaffected.
- Serve a **kill-switch service worker** at the old service worker's URL: it
  clears the Svelte caches and unregisters itself, so installed PWAs and old
  tabs stop showing the old app.
- `noindex` stays on until 4.16.
- **You:** disable the Xcode Cloud workflow before this reaches main. It builds
  `apps/ios`, which no longer exists. It comes back for the Expo app in 6.13.

*Done when:* `pinkslip.work` serves the new app, you can sign in on your phone
and click through every placeholder route, and the API, crons and queues work.

### Phase 4: Web screens

These follow the user's core loop first (discover → read → save → apply), so
the live site becomes usable daily as early as possible. Each slice deploys to
production once it's done.

| # | Slice | Covers | Size |
|---|---|---|---|
| 4.1 | Job row and list | `JobRow` (1.25k lines today) split into parts (logo, meta, timing, badges, quick actions); TanStack Virtual list. ✅ 2026-10-10: `features/jobs/{CompanyLogo,JobRow,JobList}`, data hooks for viewed state, hide with undo and admin block (`packages/data/src/interactions.ts`); the Jobs page lists the public catalog with them; `/_kit-list` (300 fixtures) and `e2e/jobs.pw.ts`. The iOS swipe actions move to 6.4. Read rows step down the ink ramp instead of 50% opacity (AA). Logos: white tile in both modes (`--color-logo-tile`), proxy readable behind the access code, misses cached | L |
| 4.2 | Feed `/` | Search, filter chips, career-stage filter, filters typed in the URL, viewed state, new-since markers, empty states. Public SSR content for the homepage (title, description, canonical, readable product copy). ✅ 2026-10-10: `features/feed/` (infinite `useFeed` per criteria, filters typed in the URL by `criteria.ts`: `q`, `loc`, `stage`, `min`, `max`, `listing`, `saved`; filter sheet; stale-poller notice; result announcements; load-more; empty and failure states). Visitors without a session read the full feed with filters as the API's built-in catalog account (`worker/catalog-reader.ts`, migration 0086: a new guest's defaults, no per-visitor rows); only saving a job starts a guest session (owner, 2026-10-10). The locked deployment and the server render show the public preview. Jobs, Library and a job share one layout (`features/split/`, the `_split` route): wide screens (≥1100px) show the list beside the job, keep its scroll, and step with J/K; phones show one at a time. The location filter matches the current app (owner): every metro plus Remote, with the profile's metros preselected when the URL has no `loc` (`loc=all` is anywhere) | L |
| 4.3 | Job detail `/jobs/:jobId` | **Anonymous public SSR.** Public projection from Hono; personal interaction queries on the client. Description-block renderer, company header, save/apply/share/external actions, the "back from applying" prompt, next/previous navigation. ✅ 2026-10-10: `features/job-detail/`. The server renders the public listing (404 when the catalog doesn't list it; the browser then checks a signed-in person's own copy); a session adds saved/applied and the match reason, and a pending description refetches. The posting renders from `parseJobDescription` blocks, so no posting HTML reaches the page. D17's consolidation: one action bar pinned to the bottom (Apply, Save, and a menu with I applied, Not interested, Tailor, Share, Hide company, Report, admin Block). "Did you apply?" on return from the application tab (`application-return.ts`). Owner review (2026-10-10): no quick facts, no on-screen next/previous arrows (J/K stays), no match reason anywhere (rows included; it was dropped from the Capacitor app earlier), no evergreen option in the filter sheet (a `listing=` link still works) | L |
| 4.4 | Library | Saved and applied, status changes, optimistic updates. ✅ 2026-10-10: `features/library/`: tab counts, "Remove from saved" and "I didn't apply" with Undo, "Mark as applied", "Applied 3d ago" labels. Fixed a cache bug from 3.x: Library queries cache arrays, which the optimistic helpers didn't handle | M |
| 4.5 | You, Account, Feedback | Hub, account management, feedback | M |
| 4.6 | Preferences | `SearchProfileFields`: qualifications, career stage, work authorization, locations. **First form-heavy slice, so it settles D4** | M |
| 4.7 | Onboarding | Rebuilt rather than ported: less text, skippable resume, invite gate → guest → account | M |
| 4.8 | Alerts and web push | Alert settings, notification feed, a minimal service worker (push and notification click only, no precaching) | M |
| 4.9 | Companies | Follow, browse, sources, `CompanyRow` | L |
| 4.10 | Resume A: import | pdf.js extraction, OCR, the import orchestrator in a Web Worker, PDF preview. Client-only route; prove Worker + WASM loading under Start first | L |
| 4.11 | Resume B: editor | Profile fields, autosave, quality hints | L |
| 4.12 | Answers | The answer bank (from 0.1) | M |
| 4.13 | Apply and outreach | Application prep sheet, auto-apply, outreach sheet with follow-ups | L |
| 4.14 | Admin | Overview, inbox, sources, runs, Jev. Function over polish | L |
| 4.15 | Tailoring | Per D7: placeholder (S) or full port (XL, split) | S / XL |
| 4.16 | SEO and previews | Per-route `head()` (title, description, canonical → `pinkslip.work`, OG/Twitter); `JobPosting` JSON-LD with `validThrough`, and closed jobs drop it; dynamic OG images per job (optional); sitemap generated from D1; robots; `noindex` on personal routes; `/about` prerendered | M |

### Phase 5: Web launch

The old site was already replaced in 3.4; this phase is the finish line.

**5.1 Parity review and search launch** · M
- Every parity row is ticked, or consciously cut.
- The full e2e + axe suite passes.
- Remove `noindex` from public routes (personal routes keep it). Submit the
  sitemap in Search Console and run the Rich Results test on a job page.

### Phase 6: Expo iOS (native screens)

**6.1 Scaffold** · M
- `apps/native` with Expo Router: tabs (Jobs, Library, You) plus native stacks
  that mirror the web routes.
- Reuse the validated contracts, fixture tests, and appropriate setup from
  1.6; replace prototype UI with the reviewed native kit and product screens.
- **Same bundle ID as the Capacitor app**, so it ships as an update.
- `ios/` is committed, because Xcode Cloud needs the project in the repo before
  any script runs; run prebuild locally when native config changes.
- The Xcode Cloud workflow (disabled in 3.4) points at `apps/native`, with
  manual start and internal TestFlight only until 6.13. Build numbers continue
  the existing app record's sequence. The Capacitor project's bundle ID,
  entitlements and capabilities are in the `svelte-final` tag for reference.

**6.2 Native kit** · L · needs D8
- Shared semantic names and compatible props where they fit: `Text`, `Heading`,
  `Stack`, `Inline`, `Icon`, `Button`, `IconButton`, `Field`, `Input`, `Textarea`,
  `Switch`, `Checkbox`, `SegmentedControl`, `ListRow`, `Toast`, `EmptyState`,
  `Skeleton`.
- Match the current native reference screens and design tokens while using
  native control/navigation behavior. Platform-specific components need not
  reproduce the web kit's DOM anatomy or full prop API.
- Sheets use Expo Router's native form sheets, with detents (the snap heights a
  sheet can rest at).
- Menus and pickers use system controls.
- Themed from `tokens.ts` (dark, light, increased contrast) and supports Dynamic
  Type.

**6.3 Platform and session** · M
- Native Apple sign-in, with the bearer token kept in secure storage.
- The Query cache persisted to disk.
- Haptics and share.
- Push via `expo-notifications`, which yields a raw APNs token, so the existing
  `worker/apns.ts` works unchanged.
- Deep links and universal links (the API Worker serves the
  `apple-app-site-association` file).

**6.4 Feed** · L · FlashList, native filter sheets, the job row.

**6.5 Job detail** · L · a native renderer for core's job-description blocks; actions and share.

**6.6 Library** · M

**6.7 You and settings** · L · Preferences, Alerts, Account, Feedback, Companies.

**6.8 Onboarding** · M

**6.9 Resume and Answers** · L · needs D10
Implement the server/WebView import strategy and file/preview adapters proven
in 1.6b. The pure resume rules remain shared; PDF.js execution does not move
into Hermes. Build the editor and Answers UI on those validated contracts,
including the import-quality, persistence, and recovery requirements.

**6.10 Apply and outreach** · L
- Auto-apply's application browser becomes `react-native-webview`, with the
  fill scripts injected through the bridge proven in 1.6c. Integrate the
  supported ATS flows and complete the recorded device/integration checks.
- The prep sheet and outreach sheet move to native.

**6.11 Admin** · S · needs D9 · admin links out to the web.

**6.12 Tailoring** · per D7.

**6.13 Ship the Expo app** · S
- Xcode Cloud builds `apps/native` on every push to main again.
- Push token re-registration on first launch.
- Version 2.0.0.

### Phase 7: Cleanup

Final CLAUDE.md update. Optionally rename `apps/webapp` → `apps/web` (the Svelte
code was already deleted in 3.4).

---

## 7. Risks

- **Job row and feed carry most of the perceived quality.** Budget them as L
  each, not "just a list".
- **Start is younger and moves fast.** Pin exact versions and upgrade on purpose,
  never as a side effect.
- **Hydration mismatches.** Relative times ("posted 2h ago") differ between server
  and client. On SSR routes, render absolute times on the server, or compute
  relative times after mount. Keep the SSR surface small (§5).
- **Web Workers and WASM under Start** (pdf.js, OCR). Use client-only routes,
  and prove loading works at the start of 4.10.
- **Stale service worker.** A forgotten Svelte worker keeps serving the old
  app to installed PWAs and old tabs. The kill-switch worker in 3.4 exists for this.
- **Xcode Cloud after 3.4.** The workflow builds `apps/ios` on every push to
  main, and every build fails once it's deleted. Disable it first (3.4).
- **Production is the test site after 3.4.** Every deploy is live. Keep
  `noindex` until 4.16, and keep deploys per slice, each verified locally first.
- **Native file and browser capabilities** affect the shared boundaries.
  Prove resume import and autofill in 1.6b/1.6c; integrate the product flows in
  6.9/6.10 after those results establish the adapters.
- **Visual drift from rebuilding controls independently.** Match the current
  design through the mapped kit and preserved references. Only onboarding
  (4.7) is an explicit redesign; other UX ideas remain separate follow-ups.

## 8. Decisions

| # | Decision | Options | Lean | Needed by |
|---|---|---|---|---|
| D1 | Earlier attempt on main | Delete from main / leave it | ✅ **Delete** (decided 2026-10-09). Git history and the stash keep it | 0.2 |
| D2 | Svelte freeze | Freeze after the answer bank lands / keep building in Svelte | ✅ **Replace outright** (decided and reaffirmed 2026-10-09; no users yet). Frozen until the shell/placeholder cutover in 3.4, then deleted; do not defer cutover until the feature loop is complete | 0.1 / 3.4 |
| D3 | Fonts | Klim (buy **web and app** licences; the app licence matters once Expo bundles the fonts) / Geist (OFL, free) | ✅ **Klim** (decided 2026-10-09). Licences bought before launch; trial files are fine until then. Make sure the bought files include the full character set (see 1.2) **iOS uses the system font (SF) for now** (owner, 2026-10-09), so the Klim app licence is only needed if that changes. | 1.2 |
| D4 | Form library | TanStack Form / React Hook Form | **TanStack Form**: form-level listeners suit autosave, types are stricter, works on RN. Switch to RHF if it fights us in 4.6 | 4.6 |
| D5 | Hosting | Separate web Worker + service binding / one Worker composing both | ✅ **Separate** (decided 2026-10-09; account recorded as on the $5 Paid plan): fixes the deploy coupling behind the Oct 5 outage. No second subscription; ordinary service-binding requests have no extra request fee. SSR still adds metered CPU and requests; see cost clarification above | 1.1 |
| D6 | iOS between the web cutover and Expo | Keep Capacitor + Svelte frozen / rewrap Capacitor around the new web app | ✅ **Neither** (decided 2026-10-09; no users yet). Capacitor is deleted in 3.4, and iOS gets no updates until the Expo app ships | 3.4 |
| D7 | Tailoring | Placeholder (keeps the coming-soon signal) / full port (2.6k-line page) | **Placeholder** until the feature is un-tabled | 4.15 |
| D8 | Native styling | Own kit on Unistyles / plain StyleSheet / Expo UI only | **Own kit on Unistyles**, with Expo UI's SwiftUI controls for menus and pickers | 6.2 |
| D9 | Admin on iOS | Link out to web / build natively | **Link out** | 6.11 |
| D10 | Resume import on iOS | Server-side / hidden WebView | ✅ **Resolved 2026-10-09**: server-side parse for text PDFs (validated from native). Scanned PDFs return `no_extractable_text`; render pages natively or reuse the web PDF.js path in a hidden WebView before calling `/resume-import/ocr` — recommend the WebView in 6.9, native renderer as fallback. Import needs sign-in (6.3) | 1.6b |
| D11 | Sign-in across the Capacitor → Expo update | One-tap re-sign-in / hand the token over via Keychain | ✅ **Moot**: no users to carry over | — |
| D12 | Shared boundaries | Share all code below UI / share rules and contracts with app adapters | ✅ **Rules/contracts and applicable Query hooks shared; platform execution app-owned** (2026-10-09) | 1.4–1.6 |
| D13 | State ownership | Parallel global stores / explicit owners by state type | ✅ **Query for server data, validated web URLs for committed filters, local/form drafts, and narrowly justified cross-screen workflows** (2026-10-09) | 1.5 |
| D14 | Public and personal job data | Session-dependent SSR / public projection plus personal queries | ✅ **Hono public projection, separate session-owned personal data, request-scoped SSR clients/caches** (2026-10-09) | 1.1 / 1.4–1.5 |
| D15 | Design and kit | Redesign per screen / reproduce current design through a mapped kit | ✅ **Match current Pinkslip closely with Base UI, CSS Modules and tokens; dedicated kit phase, reference comparisons, and component reuse** (2026-10-09) | 0.4 / Phase 2 |
| D16 | Native validation timing | Discover constraints during full native port / early capability experiments | ✅ **Prove native data/session, resume import/files, and application-browser autofill during foundations** (2026-10-09); product iOS still follows web | 1.6 |
| D17 | Desktop layout | Reproduce the Svelte desktop (232px icon rail + second You column + split job actions) / redesign the desktop frame | ✅ **Redesign the frame only** (owner, 2026-10-09, "based on your judgement"): a real left sidebar with brand, full-row destinations and nested sub-sections; phones keep the current tab bar. **Revised 2026-10-10 (owner):** with the wordmark dropped, wide screens get a narrow icon rail instead: the mark, then Jobs/Library/You as icons with tooltips. Privacy and Support links are hidden for now (the pages remain), You's sections live on the You screen, and admin pages get a section bar at every width. Job-detail actions are consolidated when 4.3 ports that screen. Everything else still matches the current design | 3.1 / 4.3 |
