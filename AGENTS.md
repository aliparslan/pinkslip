# Pinkslip frontend rules

The web app is `apps/webapp` (TanStack Start, Base UI, CSS Modules). Before
changing UI, read `apps/webapp/src/kit/COMPONENTS.md` and the "Web kit" section
below. Reuse the documented component or composition pattern when it fits; do
not create an inline visual variant just because it is faster to generate.

- Use semantic tokens from `packages/tokens` (generated `tokens.css`). Do not
  add raw palette, type-size, radius, or motion values when a token expresses
  the intent.
- Keep the kit free of API, router, store, and domain imports. Domain behavior
  belongs in `src/features` or route files.
- Add a stable primitive only after the same need appears in three places or in
  two independent features. Prefer a narrow semantic prop such as `tone` or
  `size` over arbitrary class passthroughs and large prop matrices.
- New or unreviewed UI belongs in the Quarantine section of the component
  catalog until the user explicitly approves it. Document why it exists and
  where it is used.
- Treat file length and total CSS as review signals, not optimization targets.
  A refactor should reduce duplicated decisions, dependencies, or mixed
  responsibilities; moving the same code into more files is not a cleanup.
  Growth is acceptable when it adds necessary behavior or makes ownership and
  testing materially clearer—state that tradeoff in the handoff.
- Run `bun run check`, `bun test`, `bun run build` and the Playwright suite
  after material UI or architecture changes.

## React + Expo port (in progress)

The plan, chunk status and decisions live in `docs/REACT_EXPO_PORT_PLAN.md`.

- The Svelte web app, `packages/client` and the Capacitor iOS app were deleted
  in chunk 3.4. Read them with `git show svelte-final:<path>`; the parity
  checklist (`docs/port-parity.md`) and the screenshots in
  `docs/port-design/current/` are the design reference. The owner accepts the
  gaps the cutover left until Phase 4 fills them.
- The port reproduces the current design. The redesign is a separate, later
  project; don't redesign screens during the port.
- No Tailwind or NativeWind, anywhere. No Next.js.
- Fonts are the Klim trial files until the owner buys the web and app
  licences. Keep the glyph check passing.
- Hono stays the only API. Start server functions don't become a second API.
- Don't name things "next" (domains, scripts, branches).
- Don't push, deploy, or run remote migrations without the owner's go-ahead
  for that change. Never add AI co-author trailers to commits.

### Web kit (Phase 2, done)

- Every screen is built from `apps/webapp/src/kit` (barrel: `kit/index.ts`).
  `@base-ui/react` may only be imported inside `src/kit/`; screens never
  restyle kit internals. If a screen needs something the kit lacks, add it to
  the kit (with a `/_kit` demo and a `kit/COMPONENTS.md` Quarantine entry).
- The owner approved kit-level consistency changes after the port started.
  The rules are at the top of `kit/COMPONENTS.md` and the reasoning in
  `docs/kit-design-review.md`: space tokens only (4px grid), control heights
  48/40/32, concentric radii, opacity 0.6 for disabled, one 2px accent focus
  outline, "a value is pink, a view is a raised pill", borderless filled
  buttons, inline field errors. Screens follow these; they don't copy
  one-off pixel values from the Svelte CSS.
- Pink: `--color-accent-fill` (pastel, both modes) is for filled controls and
  always carries dark `--color-accent-ink` text. Never put white text on it.
  `--color-accent` is for pink text, icons, borders and focus rings.
- Token changes that differ from the frozen Svelte values must be listed in
  `intentionalDivergences` in `packages/tokens/src/tokens.ts`, with a reason,
  then `bun --filter @pinkslip/tokens generate`.
- Verify with `bun run check`, `bun test`, and
  `cd apps/webapp && bunx playwright test`. `e2e/kit.pw.ts` covers axe in
  three themes, overlay keyboard and focus return, and full-page `/_kit`
  screenshot baselines. Update baselines only on purpose
  (`--update-snapshots`) and say why in the commit.
- Dev server gotcha: after adding an import of a new `@base-ui/react/*`
  subpath, a running `vite dev` re-bundles and can 500 with two React
  copies ("reading 'useRef'"). Restart the dev server.
- Run one webapp dev server at a time. Every `vite dev` in `apps/webapp`
  shares `node_modules/.vite`, so a second server re-bundling dependencies
  breaks the first ("file does not exist … in the optimize deps directory").
  The dev API worker reads the repository-root `.dev.vars` (merged in
  `vite.config.ts`); restart after editing it.

### Working with the owner

- Lay out options with trade-offs before proposing a plan for anything
  architectural or visual; the owner picks.
- End every finished chunk with numbered testing flows the owner can run
  locally (exact commands, URLs, expected results).
- Put review or audit findings in a `.md` file under `docs/`, not only in
  chat.
- Keep commits to one chunk or decision each, and record chunk status and
  decisions in `docs/REACT_EXPO_PORT_PLAN.md`; another agent reviews the
  history afterwards.
- Phase 3 (web shell) is done; Phase 4 builds the screens. Each slice deploys
  only with the owner's go-ahead (`bun run deploy:web`; the API deploys
  separately with `deploy:backend`). Xcode Cloud stays off until the Expo app
  (6.1/6.13).

## Repository workflow

Do not create pull requests. Commit and push authorized changes directly to
`main` under the repository owner's configured identity.
