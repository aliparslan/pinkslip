# SvelteKit and Bits UI migration

The migration is on `main`, integrated with the latest qualification, notification,
queue, and SEO changes. It does not change database schemas, API contracts, paid
services, source polling, or notification delivery. Web and native releases remain
independent.

## What changed

| Area | Change and reason |
| --- | --- |
| Web framework | SvelteKit 3 with `adapter-static` replaces the manual Vite mount and browser page registry. Output remains `apps/web/dist`, served by the existing Cloudflare Worker/Assets deployment. Personalized pages remain client-rendered; public pages can prerender. |
| Route entries | `apps/web/src/routes/(app)` contains entries for Jobs, job details, Tailor, saved/applied Library, You and its seven settings pages, and the four Admin pages. The browser loads feature pages through Kit route chunks. |
| Browser shell | `WebApp.svelte` renders the Kit child route while retaining its existing desktop Jobs/Library collection and You sidebar. Jobs and Library route entries intentionally defer collection presentation to this retained shell. |
| Navigation bridge | `kit-navigation.ts` delegates shared `navigate`, link handling, and replacement navigation to Kit. Kit owns URL/history writes. Its completed navigation updates the shared route store; shallow state updates do not move focus. Hash routing and the shared page registry continue to serve the packaged native app. |
| Compatibility | Legacy hash links and aliases (`/profile`, `/settings`, `/library`, `/my-jobs/*`, `/companies`, `/resume`, `/you/operations`) resolve to the existing canonical routes. Job origin queries, history traversal, retained lists, shared scroll restoration, and route-heading focus are preserved. |
| Page recovery | `WebRouteFrame.svelte` owns browser root headers, titles, focus announcements, and render boundaries. Kit's error route supplies a recovery screen for missing or failed pages. Unknown browser addresses now show a missing-page screen rather than falling through to the feed. Cloudflare's SPA fallback still returns HTTP 200 for an unknown app address; this is a UI 404, not a server 404. |
| Startup and notifications | `bootstrap.ts` installs web platform capabilities and the existing per-user read cache before `AppSession` mounts. SvelteKit owns mounting. Public pages do not bootstrap a session. Notification-open invalidation waits for Kit navigation to finish, so a retained feed refreshes when it becomes active again. The service-worker message listener is removed when leaving the app layout. |
| Dialogs | Shared `Modal.svelte` now uses Bits UI Dialog for semantics, focus trapping/return, Escape/outside dismissal, and scroll lock. Existing title/subtitle, busy behavior, Close action, presentation, and header drag remain. Background inert registration occurs after Bits remembers the opener and is released before focus return. |
| Work modes | `SearchProfileFields.svelte` uses DropdownMenu with checkbox items, keyboard navigation, typeahead, multiselect without closing, outside dismissal, and focus return. Manual document listeners and `<details>` menu state are removed. Claude's experience/education fields remain. |
| Library tabs | Bits UI Tabs replaces hand-written selection ARIA, roving focus, and arrow/Home/End handlers. Saved/Applied still update the URL and counts and follow browser history. |
| Tailor tabs | Bits UI Tabs owns the Resume/Preview switch. The editor remains mounted; preview compilation is still triggered by selecting Preview. The desktop keeps its two-panel presentation and mobile shows the active panel. |
| Styles | One shared segmented-tab indicator selector handles Library and Tailor. Menu enter/exit transitions move from the job-menu-only rule into `.menu-surface`, using motion tokens, so the work-mode menu shares the same treatment. RootHeader accepts the existing phone spacing/divider policy through CSS variables, removing its dependence on component stylesheet order. The obsolete standalone focus trap is removed. |
| Public page and SEO | `/about` is prerendered with a description, canonical address, and social metadata; it is added to the sitemap. Existing root metadata, robots file, and private-route crawl headers are preserved. This is a modest public page, not a full marketing redesign. |
| Service worker | Kit's manifest replaces VitePWA's manifest injection. The worker remains `/sw.js`, retaining push/click behavior, network-first HTML, offline fallback, immediate activation, update reload, and cache cleanup. Heavy compiler/document engines remain on demand. |
| Fonts and CSP | A small static-build finalizer restores the two product-font preloads using their hashed filenames and preserves fallback SEO metadata. Kit emits CSP hashes for its bootstrap; `_headers` retains frame protection and the other security/crawl/cache headers. |
| Assets | `/_app/immutable/*` gets immutable caching; `/_app/version.json` stays uncached. `/_app/*` bypasses the Worker alongside legacy `/assets/*`. Queue configuration and backend-only asset preservation are unchanged. |
| Tooling | All three frontend workspaces use compatible Svelte versions. Web config moves into Vite as required by Kit 3; generated types and a separate service-worker TypeScript project are checked. Obsolete PWA build dependencies/config and the old web entrypoint are removed. `.svelte-kit` output is ignored. CI pins Node 22; Kit requires Node 22.17+. |
| Tests and documentation | Added navigation-bridge unit tests and browser migration flows. Updated the static test server for prerendered HTML and Kit caching, adjusted PWA/legal configuration checks, and documented framework ownership and release boundaries. Unreviewed public/interaction changes are listed in the component catalog's Quarantine section. |

Thin Kit route files add explicit framework entrypoints; shared domain behavior
continues to live in `packages/client`. This adds routing ownership and public
prerendering rather than moving feature implementations into parallel copies.
Existing switches, job menus, and feed filter dialogs already used Bits UI.
Native selects, ordinary disclosure elements, and platform-specific gestures
continue to use their existing implementations.

## Start a local test environment

Use Node 22.17+ and the project's Bun version. From the repository root:

```sh
bun install
bun run dev
```

In a second terminal:

```sh
bun --filter @pinkslip/web dev
```

Open the URL printed by Vite. The web dev server proxies `/api` to the local
Worker on port 8787. Use a local test account/profile and company/job data. Tests
with mock APIs are useful for UI regressions; real API writes, push, sign-in,
and PDF generation also need integration testing.

For a production-build smoke test:

```sh
bun run build:frontend
bunx wrangler dev --local --local-upstream pinkslip.work
```

Open the local Wrangler URL. This tests the real static fallback, prerendered
pages, security headers, asset paths, and service worker. Vite development alone
does not establish production PWA behavior. The explicit local upstream avoids
Wrangler choosing the legacy hostname and redirecting page requests to the live
site.

## Manual flow checklist

Repeat the core app interactions on desktop, a narrow mobile browser, an installed
web app, and the new native iOS build where applicable. Use light/dark themes and
Reduce Motion; include Safari/VoiceOver and keyboard testing.

| Flow | Steps and expected result |
| --- | --- |
| Cold start/access gate | Launch signed out and with the shared access gate enabled. An invalid code shows an error; a valid code loads the app. Reload while signed in and verify the current route and account remain. |
| Onboarding | Use a fresh profile. Complete role/career-stage, experience/education, location/work-mode, and alert steps. Open the work-mode menu, change several choices without closing it, then dismiss it. Finish, reload, and confirm preferences persist. |
| Jobs/filter/search | Search and scroll the feed, open Filters, edit draft choices, cancel, then Apply. Verify filtering, reset, counts, error recovery, and pagination. Opening a job should retain the desktop list and its place. |
| Job details and back | Open a job from Jobs, Saved, and Applied. The URL keeps the Library origin where relevant. Select another job, then use in-app Back and browser Back/Forward. Verify the correct collection, selected row, and scroll position. Reload the detail URL directly. |
| Save/apply/block | Save and unsave a job, open its application, return, and mark it applied. Verify Library counts/status. Exercise available block/remove confirmation and Undo. Modified-click/internal link opening should work without replacing the original tab. |
| Library | Open Saved and Applied with mouse/touch. With a keyboard use arrows, Home, End, and Tab. Selected ARIA state, visible jobs, URL, counts, and history agree; keyboard focus remains on the chosen tab. Check empty/error states. |
| You navigation | Visit You, Job preferences, Job alerts, Companies, Resume, Tailoring, Account, and Help/feedback. Verify headings, browser titles, active sidebar entries, direct reloads, and Back. Ordinary route navigation focuses the incoming heading; switching Library tabs keeps tab focus. |
| Job preferences | Change career stages, role/location, experience and education settings, authorization, and work modes. Verify autosave and reload. Open the work-mode menu with Enter, move with arrows/typeahead, toggle with Space, dismiss with Escape/outside click, and verify focus returns. |
| Shared dialog behavior | Use Resume → Add section, Clear resume, company request/report, job report/block, and Tailor confirmations/editor/history deletion. Verify title/description, first focus, Tab/Shift+Tab containment, Escape, outside click, Close, and focus return. A pending busy mutation must prevent dismissal. A failed mutation must leave a usable dialog/error and permit retry. |
| Native/mobile sheets | Open those dialogs on a phone. Drag from the handle/header to dismiss and let a short drag spring back. Scrolling/input manipulation must not start dismissal. Verify safe areas, keyboard appearance, Close hit target, background scroll, and no competing edge-back gesture. |
| Companies | Search/follow companies, request a missing company, report a source, and exercise admin edit/remove where authorized. Confirm dialogs work and request state persists through normal navigation. |
| Resume | Edit contact information and sections, add an optional section, import a PDF and review the confirmation, cancel/confirm Clear resume, then reload. Verify autosave, import warnings/retry, and that sheets close cleanly. |
| Tailoring | Create a plan, review/select evidence, generate a resume, edit and lock bullets, regenerate a bullet, restore content, and switch Resume/Preview with mouse/touch and keyboard. Verify the editor stays intact, preview builds or shows useful recovery, download works, revisions appear, and deletion/start-over confirmations behave. Desktop keeps the side-by-side panels. |
| Account/auth | Sign in/out, follow an email magic link from a cold and warm app, and test account merge with a disposable account. Existing cookies/Keychain credentials and push registrations should keep their normal behavior. Use disposable data for deletion tests. |
| Alerts/push | Enable notifications, send the in-app test, and tap a job notification from a closed and open app. It opens the canonical detail URL. A foreground push refreshes the feed/badges without unexpectedly navigating. Test APNs on a physical iPhone. |
| Admin | Open `/admin`, `/admin/inbox`, `/admin/sources`, `/admin/runs`, and `/admin/jev` as an admin. Check navigation, report/feedback actions, source dialogs, queue cadence/latency displays, and Jev disagreement verdicts. Unauthorized users retain existing access restrictions. |
| Public/SEO | Open `/about` with JavaScript disabled or view source: heading, description, canonical/social metadata are present. Check `/robots.txt`, `/sitemap.xml`, `/privacy`, and `/support`. Private routes retain `X-Robots-Tag`; the app root metadata is preserved. |
| Deep links and recovery | Reload each route, then try legacy hash URLs and aliases. An unknown address shows Page not found and Back to jobs works. Simulate a failed API request/offline navigation: existing loading, retry, and read-only cached modes remain usable. |
| PWA/offline | In a production build, install/register the app, visit Jobs and a detail, then go offline and reload. The shell/fonts and permitted cached reads load. Mutations should respect read-only/offline restrictions. |
| PWA update | Keep an installed web app/tab open, serve a fresh web build, then foreground/refocus it. The new service worker takes control and reloads once; old caches do not hold the old shell. Check notification clicks after updating. |
| Accessibility/layout | Confirm one main landmark and route h1, first-Tab skip link, focus return, screen-reader dialog/tab/menu names, 200% zoom, long content, and no horizontal overflow. Check light/dark, Reduce Motion, and phone/tablet/desktop widths. |

## Automated verification

```sh
bun run check
bun test
bun run build:frontend
bun run build:ios

PINKSLIP_E2E_PORT=4183 bun --filter @pinkslip/web test:e2e \
  core-routes.pw.ts career-stages.pw.ts migration-flows.pw.ts \
  qualification-preferences.pw.ts notification-feed.pw.ts pwa-runtime.pw.ts \
  --project chromium --project webkit \
  --project mobile-chromium-light --project mobile-chromium-dark \
  --project mobile-webkit-light --project mobile-webkit-dark --project pwa-chromium
```

`migration-flows.pw.ts` covers aliases/deep-link reload, retained Library origin,
Back/Forward, Library tab focus/history, work-mode keyboard multiselect,
dialog focus/axe/dismissal, Tailor tab selection, no-JavaScript public HTML,
CSP hashes, and unknown-page recovery. PWA runtime tests exercise actual built
worker/font caching and release reload. These tests use mocked domain data;
they do not claim end-to-end model generation, authentication, or APNs delivery.

Verification on October 5, 2026:

- `bun run check`: passed, with zero Svelte errors or warnings.
- `bun test`: 745 passed, zero failed.
- Both frontend production builds passed.
- The Chromium/WebKit desktop and light/dark mobile functional matrix, plus
  the PWA runtime test: 133 passed.
- Routing and accessibility smoke tests through the actual local Cloudflare
  Worker, using the production hostname: 12 passed.
- Design, responsive, and screenshot contracts: 24 passed; three existing
  screenshot failures remain for You/preferences and onboarding. The same
  three failures reproduce on the pre-migration `main` build (`0b5c5c6`) because
  its experience/education content postdates those snapshots. Baselines were
  not overwritten. The migration's mobile header spacing regression was fixed.
- Firefox could not launch in this machine's macOS sandbox; it remains unverified.
- Native physical-device, real authentication/push, and full model/PDF flows
  require the manual integration checks above.

## iOS build and release

**A new native build is required to receive the shared Bits UI changes.** The
installed app packages its own JS/CSS and does not fetch the deployed web UI.
SvelteKit browser routing alone would not require an iOS release, but this
migration also changes shared dialogs, menus, tabs, styles, and Svelte.

```sh
bun run ios:sync
bun --filter @pinkslip/ios open
```

`ios:sync` rebuilds and copies the packaged web assets and syncs Capacitor.
Build/run `apps/ios/ios/App/App.xcworkspace` in Xcode on a simulator/device.
For TestFlight, archive/upload a new build with an incremented build number.
Use the existing release script or Xcode Cloud workflow described in `IOS.md`.
The migration verification builds the iOS web bundle; it does not itself
archive, sign, upload, or establish physical-device native behavior.

The web release still uses `bun run deploy:web`. `deploy:backend` is disabled
(see `DEPLOYMENT.md`). No database
migration or new Cloudflare product is introduced by these frontend changes.
