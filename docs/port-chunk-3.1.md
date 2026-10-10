# Chunk 3.1 — web routes and navigation

Implemented locally on 2026-10-09. This completes the route shell portion of
the port; it does not complete sessions/access (3.2) or the product screens
(Phase 4). Nothing was pushed or deployed.

## Result

- All 19 inventoried application routes are registered, along with About,
  Privacy and Support. Public pages explicitly render on the server; personal
  placeholder bodies explicitly render on the client. Admin placeholders have
  no private data or actions; authorization is the next chunk.
- Typed `staticData.page` supplies each page's title, shell, depth and root
  destination. The shell reads metadata instead of maintaining pathname
  guesses and casts. Library/You/Admin have section navigation, nested in the
  desktop sidebar. You's phone destination list sits below its heading.
- Eight old paths redirect permanently. Old `/#/` links migrate after
  hydration and replace their history entry, retaining outer and inner query
  values. Ordinary fragments are left alone. Unsafe protocol-relative hash
  targets are ignored. TanStack's existing search serialization canonicalizes
  repeated values to JSON arrays; values are retained rather than discarded.
- Back is a real anchor with a safe fallback, so it works before hydration or
  with JavaScript disabled. Once hydrated, ordinary activation uses in-app
  history when available. Modified clicks retain normal link behavior.
  Direct job links honor the two known Library origins after reload; invalid
  origins fall back to Jobs. Tailoring falls back to its job.
- Keyboard navigation moves focus to the main landmark without changing the
  restored scroll position. Browser Back restores history scroll. Depth
  changes animate content using existing tokens; equal-depth navigation and
  reduced motion skip transitions. The shell remains still.
- `ButtonAnchor` is pure kit UI. `LinkButton` is now the narrow web routing
  adapter in `features/navigation`, resolving the kit's router dependency.
  Its appearance and the existing kit screenshot baselines are unchanged.

The implementation uses the router's existing [static route data](https://tanstack.com/router/latest/docs/guide/static-route-data)
and [typed view transitions](https://tanstack.com/router/latest/docs/framework/react/examples/view-transitions).
No new framework or animation dependency was added.

## Ownership and review

The many small route files and generated route-tree growth are intentional:
each route now has an explicit rendering policy and an independent place for
its future feature. The metadata registry centralizes presentation decisions;
navigation effects, URL compatibility and Back fallbacks remain web-owned.
No Svelte files or backend behavior changed. New shell/placeholder
compositions remain in the kit catalog's Quarantine section for owner review.

During verification, an early Back button click could occur before hydration
attached its handler. Replacing it with an anchor fixes the user-visible gap;
the JavaScript-disabled browser test protects this behavior. SPA-specific
tests wait for client-rendered content before exercising hydrated navigation.

## Verification

- `bun run check`: passed, including the final Back-anchor change.
- `bun test`: 902 passed, 0 failed.
- `bun run build:frontend` and `bun run build:ios`: passed.
- `bun run build:react`: passed on the final source.
- Full React browser suite: 39 passed, including all existing kit screenshots
  with no baseline updates. The final expanded navigation suite passed all
  12 checks, including 320px and JavaScript-disabled coverage (41 distinct
  browser tests across the full run and targeted follow-up).
- Browser scope is Chromium. Native runtime, production sign-in and manual
  VoiceOver checks are outside this chunk.

## Local testing flows

1. From the repository root run `bun run dev:web`. Open
   `http://127.0.0.1:3000/you`. On a phone-sized window, expect the You heading,
   destination list and bottom tabs. At 900px and wider, expect the nested
   destinations in the sidebar. Open Job preferences, then Back; expect to
   return to You. Keyboard activation should focus the new page's main area.
2. Open `http://127.0.0.1:3000/library`. Expect the URL to become
   `/library/saved`. Switch to Applied and use browser Back/Forward; the URL,
   selected section and page title should agree.
3. Open
   `http://127.0.0.1:3000/?login=success#/my-jobs/applied?from=email`.
   Expect `/library/applied?login=success&from=email`, with no route hash.
   Open `/you/does-not-exist`; expect the real 404 page.
4. In a fresh tab open
   `http://127.0.0.1:3000/jobs/port-fixture-does-not-exist?from=library-applied`.
   Expect the missing-job page; Back should take you to Applied, including
   after reload. With JavaScript disabled it remains a working link.
5. Run `bun run test:e2e:react` from the repository root for automated
   foundation, kit and navigation checks. For this chunk alone, run
   `cd apps/webapp && bun run test:e2e e2e/navigation.pw.ts`.

Next: 3.2 owns session bootstrap, invite access, sign-in/out, admin guards and
account-change cache cleanup. The accepted 3.4 shell-stage cutover and Phase 6
native deferral remain unchanged.
