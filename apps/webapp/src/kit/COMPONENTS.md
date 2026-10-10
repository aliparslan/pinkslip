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

- **Actions and inputs (2.2)** — Owner: Web port. Files: `kit/button`
  (`Button`, `LinkButton`), `kit/icon-button`, `kit/field` (`Field`, `Input`,
  `Textarea`, `Select`, `Fieldset`, `Form`), `kit/checkbox` (`Checkbox`,
  `SelectCheck`), `kit/switch`, `kit/toggle-group`, `kit/alert`,
  `kit/save-status`. Each reproduces an app.css role: `Button` variants are
  `.btn-primary`, `.btn-primary.btn-accent`, `.btn-secondary` and
  `.btn-secondary.btn-danger`, `size="compact"` is `.btn-mini` and
  `fullWidth` compact is `.btn-action`; `IconButton` is `.icon-btn` with
  `-sm`/`-xs`/`-surface`; `Field` is `.field-label` + `.label-opt` with the
  error as an `.alert-error`, and the controls are `.input-field`,
  `.textarea-field` and the native select with `.select-chevron`; `Checkbox`
  and `SelectCheck` are `.select-check`; `Switch` is `.switch`; `ToggleGroup`
  is `.chip-wrap`/`.chip` (`chips`) and `.segmented-control` (`segmented`);
  `Alert` is `.alert-*`; `SaveStatus` is `SaveStatus.svelte`. The phone
  `:root` overrides from app.css (tap-height compact controls, looser radii)
  live in `styles/base.css`. Not built, because the current app has no call
  site: `RadioGroup`, `NumberField` (number inputs use `Input type="number"`),
  `CheckboxGroup`. `Combobox`/`Autocomplete` moves to 2.3 with the other
  popups. Rendered at `/_kit`; awaiting the 2.4 comparison and owner review.

- **Foundation route compositions** — Owner: Web port. Files: `routes/__root.tsx`,
  `routes/index.tsx`, `routes/jobs.$jobId.tsx`, and `routes/you.tsx`.
  These minimal pages prove public SSR, client-only account reads, routing,
  and API forwarding. They are not completed feature screens or approved kit
  primitives. Phase 2 replaces their temporary compositions using the preserved
  design references before the product screen port.
