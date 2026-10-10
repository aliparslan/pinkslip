# Pinkslip frontend rules

Before changing UI, read `packages/client/src/components/COMPONENTS.md`. Reuse
the documented component or composition pattern when it fits; do not create an
inline visual variant just because it is faster to generate.

- Use semantic tokens from `packages/client/src/styles/tokens.css`. Do not add
  raw palette, type-size, radius, or motion values when a token expresses the
  intent.
- Keep pure UI free of API, router, store, and domain imports. Domain behavior
  belongs in feature components or route pages.
- Add a stable primitive only after the same need appears in three places or in
  two independent features. Prefer a narrow semantic prop such as `tone` or
  `size` over arbitrary class passthroughs and large prop matrices.
- New or unreviewed UI belongs in the Quarantine section of the component
  catalog until the user explicitly approves it. Document why it exists and
  where it is used.
- Do not add new `isIosApp()` branches or `html.native-ios` rules to shared
  pages/components when the policy can live in a shell, token, or adaptive
  component. Existing call sites are grandfathered debt, not precedent.
- Treat file length and total CSS as review signals, not optimization targets.
  A refactor should reduce duplicated decisions, dependencies, or mixed
  responsibilities; moving the same code into more files is not a cleanup.
  Growth is acceptable when it adds necessary behavior or makes ownership and
  testing materially clearer—state that tradeoff in the handoff.
- Run `bun run check`, `bun test`, and both frontend builds after material UI or
  architecture changes.

## React + Expo port (in progress)

The plan, chunk status and decisions live in `docs/REACT_EXPO_PORT_PLAN.md`.

- New UI work goes in the React app (`apps/webapp`, TanStack Start + Base UI +
  CSS Modules). The Svelte app (`apps/web`, `packages/client`, `apps/ios`) gets
  no new work and is deleted at the cutover in chunk 3.4 (tagged
  `svelte-final`). The owner accepts the gaps that cutover leaves for the
  dozen or so testers.
- The port reproduces the current design. The redesign is a separate, later
  project; don't redesign screens during the port.
- No Tailwind or NativeWind, anywhere. No Next.js.
- Fonts are the Klim trial files until the owner buys the web and app
  licences. Keep the glyph check passing.
- Hono stays the only API. Start server functions don't become a second API.
- Don't name things "next" (domains, scripts, branches).
- Don't push, deploy, or run remote migrations without the owner's go-ahead
  for that change. Never add AI co-author trailers to commits.

## Repository workflow

Do not create pull requests. Commit and push authorized changes directly to
`main` under the repository owner's configured identity.
