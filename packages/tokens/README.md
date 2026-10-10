# Pinkslip tokens

The single source of truth is `src/tokens.ts`. `bun run generate` emits:

- `src/tokens.css` — the web stylesheet, keeping the frozen Svelte custom-property
  names, the `@layer reset, tokens, base, kit, app` order, and every mode. This
  also owns the `--font-*` / `--leading-*` / `--tracking-*` values, so
  `src/fonts.css` holds only the `@font-face` declarations.
- `src/native.ts` — native values: OKLCH converted to hex/rgba, lengths to point
  numbers at the 16px web root, shadows to native geometry. `light`, `contrast`
  and `lightContrast` mirror the web cascade; safe-area and `calc()` compositions
  are web-only and intentionally absent.
- `src/types.ts` — prop-value unions shared by the web and native kits, so an
  off-scale value is a type error on both platforms.

`bun run check` fails when the generated files drift, when any resolved value
differs from the frozen Svelte `tokens.css` plus `typography.css` (95 values
across 32 cascade contexts), or when a font misses a required glyph. The Svelte
app is gone (chunk 3.4), so `reference/` keeps verbatim copies of those two
files from the `svelte-final` tag; never edit them. Deliberate differences go in
`intentionalDivergences`.

The Klim WOFF2s are still the cut-down trials: they carry ~67 characters and
almost no punctuation. `scripts/glyphs.ts` records their exact coverage, so a
font whose sha256 changes switches automatically to full-coverage mode and must
contain every character in `REQUIRED_PUNCTUATION`. Run
`bun scripts/check-glyphs.ts --strict` against the bought files before launch.

Do not add a second palette or a hand-edited generated file.
