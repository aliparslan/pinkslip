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
