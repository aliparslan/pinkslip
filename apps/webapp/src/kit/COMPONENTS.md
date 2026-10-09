# React component catalog

## Stable UI

No React components have been approved yet. Use Base UI for supported interaction
behavior and the shared semantic tokens for appearance. shadcn and Linear are
visual references only; component APIs follow Pinkslip's needs.

## Quarantine

- **Foundation route compositions** — Owner: Web port. Files: `routes/__root.tsx`,
  `routes/index.tsx`, `routes/jobs.$jobId.tsx`, and `routes/you.tsx`.
  These minimal pages prove public SSR, client-only account reads, routing,
  and API forwarding. They are not completed feature screens or approved kit
  primitives. Phase 2 replaces their temporary compositions using the preserved
  design references before the product screen port.
