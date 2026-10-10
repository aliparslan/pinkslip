# Review: the other agent's port work (2026-10-09)

Scope: the 12 commits on `main` after `8b9a77c`, from 14:52 to 17:57. That's
178 files and about 7.9k lines:
- the parity checklist
- design references
- `packages/tokens`
- the Start app and web Worker
- CSS architecture and governance
- the core API transport
- `packages/data`
- two Expo experiments
- a public jobs API

I ran the whole suite on `main`:

| Check | Result |
|---|---|
| `bun install --frozen-lockfile` | clean |
| `bun run check` | exit 0 |
| `bun test` | 900 pass, 0 fail (853 before) |
| `apps/webapp` Playwright | 8/8 pass |

## Verdict

**Good work, and in a few places better than my plan.** It followed the plan's
architecture closely, tested what it built, and documented its decisions. The
problems below are mostly about direction (it locked in choices you've since
changed) and a handful of things to fix before cutover. The code itself is
solid.

## What it got right

- **A separate public jobs API** (`worker/routes/public-jobs.ts`). Server
  rendering reads an explicit anonymous projection, mounted before the session
  middleware, and serialized field by field so personal or admin data can't
  leak into a rendered page. My plan only said "render as guest"; this is
  safer.
- **One API client and one cache per request.** `createApiClient` replaced the
  module-level config. The web app builds a fresh client and QueryClient per
  server request. During server rendering, calls go through the service
  binding with no visitor cookies. The old `api` export still works for
  Svelte.
- **Data loaded on the server reaches the browser without a second request.**
  This uses Start's Query integration, and an e2e test proves it.
- **Typed CSS Modules, stylelint and a governance script** in `bun run check`,
  as the plan asked.
- **Tokens:** the generator, an equivalence test against the live Svelte
  tokens, native values, and a Klim glyph check that tightens when the bought
  fonts arrive.
- **Design references:** 48 current screenshots (dark and light, phone and
  desktop), 26 older baselines, and the component catalog are preserved before
  Svelte goes.
- **The native experiments ran on a simulator, not just compiled.** They found
  a real bug: clearing cached data for a screen still on display left that
  screen loading forever. It's fixed, with a regression test. They also
  settled resume import on iOS: text PDFs are parsed on the server, and scanned
  ones go through the existing OCR endpoint.
- **Dev setup:** `bun run dev:web` runs the new app and the API Worker together
  in one dev server against your local D1, without touching the production
  wrangler config.

## Findings

### 1. Two of its plan decisions contradict what you told me today (decide)

The plan on `main` records:
- **D2:** cutover happens at the shell/placeholder stage ("do not defer cutover
  until the core feature loop").
- **D6:** the Capacitor app is deleted then, and iOS gets no updates until the
  Expo app ships.

You told me testers should see as little downtime as possible, and that the
priority is shipping auto-apply and the other features right after the port.
Under the current plan, testers lose the job feed on web from 3.4 until 4.2,
and lose iOS updates entirely until Phase 6. Whichever agent continues needs
one answer recorded.

### 2. Native work moved ahead of the web kit (sequencing)

It added a new 1.6 with three iOS experiments before Phase 2:
- 1.6a and 1.6b are done.
- 1.6c, the in-app application browser and autofill, is still open (size M).

It was worth de-risking, but it's iOS time spent before the web port, which is
what unblocks your features. I'd park 1.6c until the iOS phase.

### 3. Four commits are already on `origin/main`

These are the deletion of the earlier attempt, the parity checklist, and two
plan updates. Xcode Cloud builds every push to main. The Capacitor app still
builds, but any workflow pointing at `apps/mobile` would now fail. The other
8 commits are local only.

### 4. Server-rendered pages miss security headers (fix before cutover)

The API Worker sets CSP, `X-Frame-Options: DENY` and `Permissions-Policy`.
The new web Worker's `withNoIndex` only adds `X-Robots-Tag`, `nosniff` and
`Referrer-Policy`, and `public/_headers` only applies to static files. Server
rendering needs these headers before it serves real traffic
(`apps/webapp/src/server/routing.ts`).

### 5. The public job list may show roles the app normally hides (check before indexing)

The signed-in feed only shows jobs with a `user_job_matches` row, capped by
`required_years`. The public list (`/api/v2/public/jobs`) filters on company
enabled, open, review-approved and freshness, but not on experience. Senior
roles could appear on the public homepage and in Google. Add the same
eligibility rule before removing `noindex`.

### 6. Leftover `{ uri, name, type }` upload path (small cleanup)

`ResumeUploadFile` in `packages/core/src/api.ts` accepts `{ uri, name, type }`
"for React Native". The native experiment found that this shape fails in
Expo's fetch and switched to a real `File` Blob, so the branch is dead and
misleading. Drop it from the type.

### 7. Two React versions in the repo (watch)

The web app uses React 19.3.0. The native app uses React 19.2.3 and React
Native 0.86.3; the plan says 0.87. The experiment added a Metro resolver so
there's only one copy of React and Query, which works. Keep shared packages on
peer dependencies (they are now), and line the versions up when Expo moves.

### 8. Things cutover needs that don't exist yet (tracked, not bugs)

- `robots.txt`, `sitemap.xml` and the web manifest are only served by the
  Svelte app today.
- The service worker that clears the old app's caches (3.4).
- Job detail is server-rendered but doesn't show the description yet, which is
  most of its SEO value (4.3).
- The session cleanup hook is mounted on `/you` instead of the shell (3.2).

All of these are already in the plan. They're listed because cutover timing
(finding 1) decides how urgent they are.

### 9. The plan is getting heavy (approach)

The plan grew from about 560 to 827 lines. The new prose is precise but
dense, with "Quarantine", promotion rules and ownership boundaries. It's fine
for agents, but harder for you to steer, and it leans towards process when
your priority is "works first". I'd trim it when we reconcile finding 1.

### 10. The two agents follow different instruction files (coordination)

The port rules (freeze/replace, never "next", Klim) live in `CLAUDE.md`,
which is gitignored and local-only. The other agent appears to follow
`AGENTS.md`, which is tracked and has none of them. If both agents keep
working here, the shared rules belong in `AGENTS.md`.

## Recommended next steps

1. Decide finding 1: cutover timing and iOS in the meantime.
2. Fix finding 4 (security headers) and finding 6 (dead upload branch). Both
   are small.
3. Continue with Phase 2 (the web kit). Park 1.6c.
4. Move the shared port rules into `AGENTS.md`, and trim the plan.
5. Remove my redundant `port` branch and five empty agent worktrees.
