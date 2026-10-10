# React component catalog

## Stable UI

No React components have been approved yet. Use Base UI for supported interaction
behavior and the shared semantic tokens for appearance. shadcn and Linear are
visual references only; component APIs follow Pinkslip's needs.

## Quarantine

- **Foundation kit (2.1)** — Owner: Web port. Files: `kit/text`, `kit/heading`,
  `kit/layout` (`Stack`, `Inline`), `kit/surface`, `kit/icon`, `kit/separator`,
  `kit/visually-hidden`, `kit/spinner`, `kit/skeleton`, `kit/badge`. Each
  reproduces an existing Svelte role: `Heading` variants are the root header
  title, `.screen-large-title`, `.h-display-lg|md|sm` and `.section-title`;
  `Text` covers body, `.section-label`/eyebrow and `.field-label` through
  size/tone/weight; `Stack`/`Inline` are `.stack-*`, `.split-row` and
  `.button-cluster`; `Surface` is `.surface-list`/`.content-card` with the
  phone edge-to-edge bleed; `Badge` is `.tag`. `Icon` accepts only the icon
  sizes the current app uses (13–24). Only layout containers take a
  `className`, for placement. Rendered at the dev-only `/_kit` page; awaiting
  the 2.4 reference comparison and owner review.

- **Foundation route compositions** — Owner: Web port. Files: `routes/__root.tsx`,
  `routes/index.tsx`, `routes/jobs.$jobId.tsx`, and `routes/you.tsx`.
  These minimal pages prove public SSR, client-only account reads, routing,
  and API forwarding. They are not completed feature screens or approved kit
  primitives. Phase 2 replaces their temporary compositions using the preserved
  design references before the product screen port.
