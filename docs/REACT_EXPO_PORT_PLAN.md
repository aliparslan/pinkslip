# React + Expo port plan

Drafted 2026-10-09. Status: **agreed**. D1–D3 and D5 decided 2026-10-09; the rest are due at the chunk that needs them.

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
| Web components | **Base UI** primitives in a kit we own (shadcn's model and naming, not its code), styled with **CSS Modules**. No Tailwind anywhere |
| iOS | **Expo** (SDK 57, Expo Router) with **native screens**. Screens are built twice; everything below the UI is shared |
| API | **Hono stays the only API.** Web and iOS both consume it. Start's server functions don't become a second API |
| Order | Web first, iOS second |

Why the web goes first: the web is the product today and iOS wraps it. Also,
the shared layer (tokens, core, Query hooks) gets proven on one platform before
the second one depends on it.

## 2. Target layout

```
shared/            exists  domain types + validation shared with the API
packages/core/     exists  framework-free client logic; gains an injectable transport + modules lifted from packages/client
packages/tokens/   new     design tokens in TS → tokens.css (web), tokens.ts (native), and prop-type unions for both kits
packages/data/     new     React (no DOM): TanStack Query hooks, session, Platform interface
apps/webapp/       new     TanStack Start app; kit in src/kit/   → deploys as Worker `pinkslip-web`
apps/native/       new     Expo app; kit in src/kit/
worker/            exists  Hono API Worker `pinkslip`; loses its [assets] at web cutover
─────────── deleted at cutover ───────────
apps/web                 Svelte web shell        (Phase 5)
packages/client, apps/ios Svelte UI + Capacitor   (Phase 7, after Expo ships; see D6)
```

**Dependency rule:** apps → data → core → shared, and apps → tokens. Nothing
under `packages/` imports React DOM, Base UI, CSS or React Native. A kit never
fetches data.

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
  every page, and `deploy:backend` has been disabled since.
- **Keeps React SSR code out of the API Worker's bundle and CPU budget.**
- **Lets Start use its standard Cloudflare setup** with no custom glue.

Dev runs both Workers in one `vite dev` (the Cloudflare Vite plugin runs the
API as an auxiliary Worker). Same hostname, so no CORS and no cookie issues.
Before cutover the web Worker lives at `next.pinkslip.work`.

## 3. Stack

| Concern | Web | iOS | Shared |
|---|---|---|---|
| Framework | TanStack Start 1.168 | Expo SDK 57 / RN 0.87 | — |
| Routing | TanStack Router (inside Start): typed params and typed, validated search params | Expo Router: native stacks, tabs, form sheets | Route names and path shapes |
| Server state | TanStack Query 5, with the SSR cache sent to the browser through Start | TanStack Query 5, cache persisted to disk | `packages/data` hooks |
| Client state | URL search params, then component state, then Zustand (cross-screen state only) | Same | Zustand stores, when needed |
| Forms | TanStack Form or React Hook Form (D4) | Same library | Validation schemas in `shared/` |
| Components | Base UI 1.9 + CSS Modules | Own kit on Unistyles (D8) + Expo UI for system controls | Component names and prop types |
| Icons | `@phosphor-icons/react` | `phosphor-react-native` | Same icon set as today |
| Long lists | TanStack Virtual | FlashList 2 | — |
| Tests | Playwright + axe (flows), bun test (logic) | Maestro (flows), bun test (logic) | bun test |

Things deliberately left out:
- **TanStack Start server functions.** Hono is the API.
- **TanStack DB.** Too young to build on.
- **TanStack Table.** Revisit for admin in 4.14 if the tables are painful.
- **Next.js, Tailwind/NativeWind.**

## 4. Styling contract (web)

### What "shadcn on Base UI with CSS Modules" means here

We take shadcn's **model** but none of its code:
- **We own every component's source**, in `apps/webapp/src/kit/`.
- **Components follow shadcn's anatomy and naming** (`Dialog`, `DialogTrigger`,
  `DialogContent`…).
- **Each one wraps Base UI parts.**
- **We never run the shadcn CLI**, because its output is Tailwind.

```
src/kit/button/
  Button.tsx
  Button.module.css
  index.ts
```

```tsx
import { Button as BaseButton } from "@base-ui/react/button";
import styles from "./Button.module.css";

type ButtonProps = BaseButton.Props & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={className ? `${styles.root} ${className}` : styles.root}
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
   **type error**. The native kit exposes the same components and props, so
   screens read the same on both platforms.
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

- **Svelte freeze.** After chunk 0.1, Svelte only gets bug fixes. New features
  are built in the React app, and the slice order changes so their slice lands
  first. Trade-off: on the web they're only visible at `next.` until cutover.
- **Dogfood on `next.pinkslip.work`.** The new app is deployed for real from
  Phase 1 onwards and used daily on your phone. It has its own sign-in (a new
  origin), and Apple's web sign-in needs `next.` added as a return URL.
- **Lift shared logic, don't rewrite it.** Framework-free modules in
  `packages/client/src/lib` move into `packages/core` (chunk 1.4), and Svelte
  imports them from there, so both apps run the same code during the
  transition. Only the stateful Svelte rune stores (`*.svelte.ts`) get rewritten,
  as hooks.
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
  `design-system-contracts` and `visual-contracts` are replaced by kit screenshots
  (chunk 2.4).
- **Rendering policy.** SSR is used only where Google or link previews need it:
  - `/jobs/:jobId`, `/about`, and the homepage's public content get SSR, rendered as a
    guest. The user's own state (saved, applied) fills in on the client.
  - Library, You, admin and tailoring are client-only.

  That keeps auth off the server and keeps most of the port free of server-safety
  concerns.
- **Rollback.** Cutovers are route changes on Cloudflare, so rolling back means
  reverting the route or running `wrangler rollback`. The last Svelte commit gets a
  tag.

### Definition of done (every web slice)

1. Data hooks exist in `packages/data`, with optimistic updates where the Svelte
   app had them.
2. The screen is built only from kit components plus that screen's own module CSS.
3. Loading, empty, error, guest, narrow and wide states all work, in dark, light
   and increased contrast.
4. Its parity rows are ticked and its Playwright + axe specs pass.
5. You've used it on `next.` and said it's good, then it's committed. Nothing is
   pushed without your OK.

**Sizes:** S ≈ one sitting · M ≈ 2–3 sittings · L ≈ a week of sittings · XL = split it.

---

## 6. Chunks

### Phase 0: Clear the decks

**0.1 Land in-flight work and freeze Svelte** · S · needs D2
Finish and commit the answer-bank feature, which is uncommitted now. It touches
14 files, including `AnswersSection.svelte`, `worker/apply/answer-bank.ts`, the
`/you/answers` route and `tests/apply-answers.test.ts`. Then add the freeze rule
to CLAUDE.md.
*Done when:* the working tree is clean, the answer bank works on web and iOS, and the freeze is written down.

**0.2 Remove the earlier attempt from main** · S · needs D1
- Delete `apps/web-react`, `apps/mobile`, `packages/ui` and the empty `apps/web-svelte`.
- Remove them from `bun run check`.
- Fix the stale CLAUDE.md lines: the fonts section says Geist under `frontend/`,
  but the live app loads Klim "Untitled Sans" and "Founders Grotesk" from
  `packages/client`. The iOS line is also stale.

Git history and `stash@{0}` keep everything.
*Done when:* `bun run check` passes and the tree has only live code.

**0.3 Parity inventory** · M
Write `docs/port-parity.md` covering all 19 app routes (including
`/you/answers`) plus `/about`, the compatibility redirects, the legacy `/#/` URL migration, the platform
behaviours (haptics, share, push, in-app application browser, autofill) and
every API call per screen. Sources: the Svelte pages, `packages/core/src/api.ts`
and the existing e2e specs.
*Done when:* every route has rows, and you've read it and cut anything not worth porting.

### Phase 1: Foundations

**1.1 Start app and web Worker** · M · needs D5
- Scaffold `apps/webapp`: TanStack Start, React 19, Vite 8 and the Cloudflare Vite
  plugin, deployed as Worker `pinkslip-web` with a service binding to `pinkslip`.
- `/api/*` is forwarded through the binding.
- One server-rendered page and one client-only page prove two things: a server-side
  fetch through the binding works, and a browser fetch to the same origin works.
- Deploy to `next.pinkslip.work`, with `noindex` and `X-Robots-Tag` on everything.

*Done when:* `vite dev` runs the API and web together, with D1, against your local data,
and `next.` is live.

**1.2 Tokens package** · M · needs D3
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

**1.3 CSS architecture and enforcement** · S
- The four global files and the layer order.
- The stylelint config ported, plus CSS-Module rules.
- Typed CSS Modules.
- A governance script, wired into `bun run check`. It enforces:
  - `@base-ui/react` imported only under `src/kit/`
  - no string-literal `className`
  - no literal `style` values
  - no Tailwind dependencies

*Done when:* a deliberately bad file fails each check.

**1.4 Core transport and lifted logic** · M
- **Injectable transport.** The `packages/core` API client takes its `fetch`,
  base URL and token provider as inputs, so the same client works in three places:
  - in the browser (relative URLs)
  - during SSR (through the service binding)
  - on native (absolute URL, bearer token from secure storage)
- **Lifted modules.** Framework-free modules move from `packages/client/src/lib`
  into `core`, with their tests: formatting, job-content, job-navigation, viewed,
  autosave-lifecycle, PDF import/extract, resume-document, the
  resume-import orchestrator, form-reader/filler, application-autofill and
  auto-apply. Each is checked for Svelte imports as it moves.
- **Autofill bridge.** The bridge call
  (`webkit.messageHandlers.pinkslipAutofill`) is abstracted so the Expo WebView
  can supply its own.

Svelte behaviour stays unchanged.
*Done when:* the Svelte web and iOS apps pass check, tests and e2e on the moved code.

**1.5 Data package** · M
- QueryClient defaults and a query-key factory.
- Hooks for every resource: jobs, job, library, profile, preferences, alerts,
  companies, resume, answers, apply, outreach, admin.
- Optimistic save/apply.
- A session hook.
- The `Platform` interface (haptics, share, push, open external, application
  browser, secure storage) with a web implementation.
- Start's Query SSR integration, so server-loaded data reaches the browser without a refetch.

*Done when:* the 1.1 pages use the hooks, and no request repeats after hydration.

**1.6 Native compatibility smoke test** · S · throwaway
A minimal Expo app that imports `core`, `data` and `tokens`, signs in with a bearer
token against the local worker, and lists job titles.
*Done when:* the shared layer runs under Metro/Hermes. This catches web-only
assumptions before 50 screens depend on them.

### Phase 2: Web kit

**2.1 Foundations** · M
- Components: `Text`, `Heading`, `Stack`, `Inline`, `Icon` (Phosphor, token
  sizes only), `Separator`, `VisuallyHidden`, `Spinner`, `Skeleton`, `Badge`,
  `Surface`.
- A dev-only `/_kit` playground that renders every component in every state.

**2.2 Actions and inputs** · L
- Actions: `Button`, `IconButton`, `LinkButton`.
- Text inputs: `Input`, `Textarea`, `Field` (label plus error, with **no
  description slot by default**, to keep text light), `Fieldset`, `Form`.
- Choice controls: `Checkbox`, `CheckboxGroup`, `Switch`, `RadioGroup`, `Select`,
  `Combobox`/`Autocomplete` (company and location search), `NumberField`,
  `ToggleGroup` (filter chips).
- Status: `SaveStatus`.

**2.3 Overlays and feedback** · L
- Overlays: `Dialog`, `AlertDialog`, `Drawer` (bottom sheet, which Base UI's
  Drawer provides with swipe-to-dismiss, replacing `drag-dismiss.ts`), `Popover`,
  `Menu`, `Tooltip`.
- Feedback: `Toast` (Base UI's toast manager), `Progress`/`Meter`.
- Disclosure: `Tabs`, `Accordion`/`Collapsible`.

**2.4 Kit verification** · S
- Playwright screenshots of `/_kit` in dark, light and increased contrast, at
  narrow and wide widths.
- An axe pass.
- Keyboard and focus-return tests for every overlay.

*Done when:* screenshots are committed as baselines.

### Phase 3: Web shell

**3.1 Routes and layout** · M
- All routes as Start routes, each with its SSR flag.
- `staticData` carries what `route-config.ts` carries today: shell, depth, root
  destination, titles.
- Compatibility redirects and the legacy `/#/` migration.
- Root layout: header, a tab bar at narrow widths, side navigation at wide widths.
- Back navigation, view transitions by route depth, scroll restoration.
- Real 404s with a 404 status, which fixes the audit's soft-404s.

Screens are placeholders at this stage.

**3.2 Session and access** · M
- Session bootstrap and guest browsing.
- The invite gate.
- Apple sign-in (web) and the email sign-in result.
- The admin guard and sign-out.

**3.3 Shared states** · S
- A route error boundary (page-level and inline failures).
- Pending UI, empty states, an offline banner, and the toast viewport.

**3.4 Dogfood loop** · S
- A deploy script for `pinkslip-web` → `next.`.
- The ported Playwright harness, run in `bun run check`.

*Done when:* you can open `next.` on your phone, sign in, and click through
every placeholder route.

### Phase 4: Web screens

These follow the user's core loop first (discover → read → save → apply), so
`next.` becomes usable daily as early as possible.

| # | Slice | Covers | Size |
|---|---|---|---|
| 4.1 | Job row and list | `JobRow` (1.25k lines today) split into parts (logo, meta, timing, badges, quick actions); TanStack Virtual list | L |
| 4.2 | Feed `/` | Search, filter chips, career-stage filter, filters typed in the URL, viewed state, new-since markers, empty states. Public SSR content for the homepage (title, description, canonical, readable product copy) | L |
| 4.3 | Job detail `/jobs/:jobId` | **SSR as guest.** Description-block renderer (from core), company header, save/apply/share/external actions, the "back from applying" prompt, next/previous navigation | L |
| 4.4 | Library | Saved and applied, status changes, optimistic updates | M |
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

### Phase 5: Web cutover

**5.1 Parity audit** · M
- Every parity row is ticked.
- The full e2e + axe suite passes.
- A week on `next.` with no fallback to the old site.

**5.2 Service-worker handover** · M
Installed PWAs keep running the Svelte service worker until something replaces
it. The new app serves a worker at the **old worker's URL**, which clears the
Svelte caches and hands control to the new worker. Test the upgrade path from an
installed Svelte PWA, and the manifest.

**5.3 Flip** · S
- Route `pinkslip.work/*` and `pinkslip.alip.dev/*` to `pinkslip-web`; `/api/*`
  stays on `pinkslip`.
- Remove `[assets]` from the API Worker and re-enable a safe `deploy:backend`.
- Run the Search Console sitemap submission and the Rich Results test.
- Tag `svelte-web-final`.

**5.4 Delete the Svelte web shell** · S
- Delete `apps/web`.
- Keep `packages/client` and `apps/ios` if D6 is "freeze" (the iOS app still
  ships them until Phase 7).
- Update CLAUDE.md and `bun run check`.

### Phase 6: Expo iOS (native screens)

**6.1 Scaffold** · M
- `apps/native` with Expo Router: tabs (Jobs, Library, You) plus native stacks
  that mirror the web routes.
- **Same bundle ID as the Capacitor app**, so it ships as an update.
- `ios/` is committed, because Xcode Cloud needs the project in the repo before
  any script runs; run prebuild locally when native config changes.
- A **separate Xcode Cloud workflow** with manual start and internal TestFlight
  only. Pushes to main keep archiving the Capacitor app until 6.13. Both workflows
  share the app record's build-number sequence.

**6.2 Native kit** · L · needs D8
- The same component names and prop unions as the web kit: `Text`, `Heading`,
  `Stack`, `Inline`, `Icon`, `Button`, `IconButton`, `Field`, `Input`, `Textarea`,
  `Switch`, `Checkbox`, `SegmentedControl`, `ListRow`, `Toast`, `EmptyState`,
  `Skeleton`.
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
pdf.js doesn't run in Hermes, React Native's JavaScript engine. Either import
happens on the server (check `worker/routes/resume-import.ts` first), or the web
pipeline runs in a hidden WebView. PDF preview uses a WebView or QuickLook.

**6.10 Apply and outreach** · L
- Auto-apply's application browser becomes `react-native-webview`, with the
  fill scripts from core injected through the bridge abstracted in 1.4.
- The prep sheet and outreach sheet move to native.

**6.11 Admin** · S · needs D9 · admin links out to the web.

**6.12 Tailoring** · per D7.

**6.13 iOS cutover** · M · needs D11
- Sign-in continuity (D11).
- Push token re-registration on first launch.
- The main Xcode Cloud workflow switches to `apps/native`.
- Version 2.0.0.

### Phase 7: Cleanup

Delete `apps/ios` (Capacitor), `packages/client`, and the Svelte, bits-ui and
`postcss-html` dependencies. Final CLAUDE.md update. Optionally rename
`apps/webapp` → `apps/web`.

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
- **Service-worker handover.** A forgotten Svelte worker keeps serving the old
  app to installed PWAs. Chunk 5.2 exists for this.
- **Apple sign-in return URLs** need `next.pinkslip.work` before 3.2, plus
  native configuration in 6.3.
- **The shared App Store record.** Expo builds reuse the Capacitor app's bundle
  ID and build numbers, so a mis-triggered workflow could put an Expo build in
  front of testers early. Keep the separate workflow on manual start.
- **Auto-apply on iOS** depends on injecting scripts into a WebView. Prove it in
  6.10 before porting the surrounding UI.
- **Scope creep from redesigning.** Port the behaviour and rebuild the visuals.
  Only onboarding (4.7) is an explicit redesign; other UX ideas go into the
  parity doc as follow-ups, not into the slice.

## 8. Decisions

| # | Decision | Options | Lean | Needed by |
|---|---|---|---|---|
| D1 | Earlier attempt on main | Delete from main / leave it | ✅ **Delete** (decided 2026-10-09). Git history and the stash keep it | 0.2 |
| D2 | Svelte freeze | Freeze after the answer bank lands / keep building in Svelte | ✅ **Freeze** (decided 2026-10-09) | 0.1 |
| D3 | Fonts | Klim (buy **web and app** licences; the app licence matters once Expo bundles the fonts) / Geist (OFL, free) | ✅ **Klim** (decided 2026-10-09). Licences bought before launch; trial files are fine until then. Make sure the bought files include the full character set (see 1.2) | 1.2 |
| D4 | Form library | TanStack Form / React Hook Form | **TanStack Form**: form-level listeners suit autosave, types are stricter, works on RN. Switch to RHF if it fights us in 4.6 | 4.6 |
| D5 | Hosting | Separate web Worker + service binding / one Worker composing both | ✅ **Separate** (decided 2026-10-09; account is on the $5 Paid plan): fixes the deploy coupling behind the Oct 5 outage. No price difference: Cloudflare has no per-Worker fee, and calls between Workers over a service binding aren't billed as extra requests | 1.1 |
| D6 | iOS between the web cutover and Expo | Keep Capacitor + Svelte frozen / rewrap Capacitor around the new web app | **Freeze.** Rewrapping means throwaway glue (~1.2k lines) plus a separate SPA-mode build | 5.4 |
| D7 | Tailoring | Placeholder (keeps the coming-soon signal) / full port (2.6k-line page) | **Placeholder** until the feature is un-tabled | 4.15 |
| D8 | Native styling | Own kit on Unistyles / plain StyleSheet / Expo UI only | **Own kit on Unistyles**, with Expo UI's SwiftUI controls for menus and pickers | 6.2 |
| D9 | Admin on iOS | Link out to web / build natively | **Link out** | 6.11 |
| D10 | Resume import on iOS | Server-side / hidden WebView | Decide after reading `worker/routes/resume-import.ts` | 6.9 |
| D11 | Sign-in across the Capacitor → Expo update | One-tap re-sign-in / hand the token over via Keychain | **Re-sign-in**, unless the handover proves cheap | 6.13 |
