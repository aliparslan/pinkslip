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

## React stack (`packages/ui`, `apps/web-react`)

The rules above carry over; the files differ. Read `packages/ui/README.md`
before changing React UI.

- Tokens live only in `packages/ui/src/styles/theme.css`, paint only in
  `skin.css`, motion only in `motion.css`. Fix a look in those files, never with
  a utility on one call site.
- There is one style. Do not add style, theme, or accent variants; new needs
  become tokens or a narrow semantic prop.
- Durations are `--dur-*` tokens. Moving parts use a named `motion-*` class;
  add a new one only when the same motion appears in three places.
- Apps compose `@pinkslip/ui`; they do not import `@base-ui/react` directly.
  The playground may, for demos.
- New components start in the README's Quarantine list and appear in the
  playground with real Pinkslip content until the user approves them.
- `bun run check:frontend` enforces the mechanical parts of these rules.

## Repository workflow

Do not create pull requests. Commit and push authorized changes directly to
`main` under the repository owner's configured identity.
