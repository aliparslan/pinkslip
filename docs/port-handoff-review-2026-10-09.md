# React/Expo handoff review — 2026-10-09

Reviewed the local tree at `4c9acbc` (`feat(webapp): add the 404 and route error pages`), the port plan, recent commits, and the current React implementation. This is a progress assessment, not a production or full security audit. The working tree was clean before this report. Local `main` is 20 commits ahead of the locally recorded `origin/main`; the remote was not fetched for this assessment.

## Current position

| Area | Observed state |
| --- | --- |
| Foundation | Start web app, Hono public API integration, generated tokens, shared core/data packages, per-request SSR clients/caches and hydration are implemented. |
| Native experiments | Session/data and resume-import experiments are recorded as exercised on the simulator. The application-browser experiment is explicitly deferred to Phase 6. No simulator verification was repeated here. |
| Phase 2 | Kit and its verification suite are implemented. Preserve the owner's approved spacing, controls, focus treatment and pastel accent decisions. |
| 3.1 Routes/layout | Responsive sidebar/bottom tabs, scroll restoration and real 404s exist. Most application routes, route metadata, compatibility redirects, legacy hash migration and depth-based navigation remain. |
| 3.2 Session/access | Shared session hook and an account-status placeholder exist. Shell-owned session lifecycle, invite access, sign-in, sign-out and admin guards remain. |
| 3.3 Shared states | Page-level 404, missing-job and retryable route-error states exist, with tests. Toast provider is installed. Inline failures, pending UI and offline indication remain. |
| 3.4 Cutover | Not performed. Svelte remains in the repository; replacement at the shell/placeholder milestone is already an accepted decision. |

The current product routes are `/`, `/jobs/$jobId`, `/library`, `/you`, `/privacy` and `/support`, plus the development kit/error routes. Jobs and job detail are foundation previews; Library and You are placeholders. Phase 4 product-screen implementation is still ahead.

## Findings to carry into the next chunks

1. **Complete session ownership in 3.2.** `useOwnerChangeCleanup()` is currently mounted only by `apps/webapp/src/routes/you.tsx`. Its own documentation anticipates moving it to the shell. Session changes need to clear personal data regardless of which page is open. Also, `packages/data/src/session.ts` currently treats every HTTP 401 as anonymous; access-required responses need an explicit handling path for the invite gate. These are unfinished integration responsibilities, not evidence that the existing public preview is broken.
2. **Keep routing out of pure kit UI.** `apps/webapp/src/kit/button/Button.tsx` imports the router's `createLink`. The repository's pure-UI rule calls for the styled anchor to remain in the kit and its typed router integration to live in an app adapter. Address this narrow boundary issue alongside 3.1 without changing the button's appearance.
3. **Prepare retained assets before Svelte deletion.** Token equivalence checks still read `packages/client` CSS, the existing governance checks target Svelte files, and reference capture identifies the old web test fixtures. Move the necessary baseline sources and test harness, then update scripts before removing those directories. The cutover plan already calls for this work.
4. **Clarify stale status text.** The plan contains older “no users” and early-native-experiment wording alongside the newer decision acknowledging testers and parking native work. Kit catalog entries still mention awaiting the 2.4 comparison even though that suite exists. Update status text as the relevant chunks are completed; do not infer blanket approval to promote Quarantine components.

## Recommended sequence

Finishing the small remainder of 3.3 first would close a checklist item sooner. Completing 3.1 and 3.2 first gives pending/error/offline states real navigation and session flows to cover, with less revisiting. Recommend the latter, following the existing plan rather than introducing an architectural or visual change:

1. **Finish 3.1:** register the full route map as placeholders, centralize titles/shell/depth metadata, implement redirects and old hash links, and complete back/scroll behavior. Verify direct links and navigation at phone and desktop sizes.
2. **Finish 3.2:** put session lifecycle in the shell; implement invite access, guest behavior, Apple web sign-in, email result handling, sign-out and admin protection. Verify owner changes and personal-cache isolation.
3. **Finish 3.3:** add pending UI, inline retry states and offline indication using the existing kit. Exercise them against delayed requests, failures and recovery.
4. **Prepare 3.4:** preserve fixtures/reference sources, update build and deploy paths, prepare old-service-worker retirement and the `svelte-final` checkpoint. Deployment and disabling Xcode Cloud require the owner's explicit go-ahead under `AGENTS.md`. Keep the accepted shell-stage cutover; feature parity is Phase 4, and Expo product work remains Phase 6.

Keep each chunk independently reviewable and record its completion in `REACT_EXPO_PORT_PLAN.md`.

## Verification

- `bun run check`: passed.
- `bun test`: 902 passed, 0 failed.
- `bun run build:react`: passed.
- React Playwright suite (`cd apps/webapp && bun run test:e2e`): all 29 passed, including kit screenshot comparisons and page-state recovery.
- No production changes, remote migrations, push, Svelte deletion or application-source edits were made. Legacy frontend builds were not repeated for this documentation-only assessment.

## Local inspection flows

1. From the repository root run `bun run dev:web`, then open `http://127.0.0.1:3000/_kit`. Inspect the current kit at phone and desktop widths; the frame changes between bottom tabs and a sidebar.
2. Open `http://127.0.0.1:3000/does-not-exist`, then use **Back to Jobs**. Expect a 404 page and successful navigation to Jobs. Open `http://127.0.0.1:3000/_kit-error`, press **Try again**, and expect **Recovered** within the app frame.
3. Run `bun run test:e2e:react` from the repository root to repeat the browser checks against the local app. This covers the foundation, kit accessibility/keyboard/screenshots and page-level states; it does not establish sign-in or full product parity.
