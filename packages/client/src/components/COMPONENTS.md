# Pinkslip component index

This is the finite UI vocabulary for engineers and coding agents. Search here
before adding markup or CSS. Components may be extended with semantic variants;
application code should not invent visually equivalent one-offs.

## Stable UI

| Need | Use | Supported contract |
| --- | --- | --- |
| Progress indicator | `Spinner.svelte` | `size`, accessible `label` |
| Page-level recovery | `PageFailure.svelte` | concise title, recovery message, optional retry and secondary actions |
| Empty collection / first use | `EmptyState.svelte` | concise title, optional orientation copy, icon, and one next action; `compact` for embedded sections |
| Partial-load recovery | `InlineFailure.svelte` | local title, recovery message, optional retry without replacing the whole page |
| Boolean setting | `Switch.svelte` | controlled checked state and accessible label |
| Autosave feedback | `SaveStatus.svelte` | `SavePresentation.phase` |
| Dialog or mobile sheet | `Modal.svelte` | title, subtitle, width, initial focus policy, dismiss callback, content/actions snippets |
| Pushed-screen header | `ScreenNav.svelte` | title, back action, optional trailing content, native collapsing title |
| Collapsed-header search | `HeaderSearch.svelte` | page-registered query binding, compact expand/collapse control |
| Transient feedback | `Toast.svelte` + `ToastViewport.svelte` through `feedback.svelte.ts` | message, tone, optional Undo/action |
| App navigation | `RootHeader.svelte`, `TabBar.svelte` | shell-owned; do not recreate inside pages |
| Product/Apple marks | `BrandMark.svelte`, `AppleMark.svelte` | fixed brand assets |

## Feature components

`JobRow`, `VirtualJobList`, `CompanyRow`, `CompanyLogo`, `FilterChips`,
`SearchProfileFields`, `Onboarding`, and `ApplicationReturnPrompt` own domain
behavior. Reuse them within their feature; do not treat their private styles as
general primitives.

## Canonical CSS compositions

These live in `app.css` while the component API is migrated incrementally.

| Need | Use | Avoid |
| --- | --- | --- |
| Primary action | `.btn-primary`; add `.btn-accent` only for the single emphasized action | page-local button resets |
| Secondary/destructive action | `.btn-secondary`; add `.btn-danger` for destructive tone | raw red backgrounds or borders |
| Icon-only action | `.icon-btn`, optional `-sm`, `-xs`, or `-surface` | custom square hit targets |
| Form control | `.field-label` + `.input-field` | one-off font/radius/color rules |
| Inline message | `.alert` + `.alert-error`, `-success`, or `-warn` | plain error text without a role |
| Grouped surface | `.surface-list` or `.content-card` | new card shadows/radii |
| Menu surface/item | `.menu-surface` + `.menu-item`, optional `.danger` | feature-local menu resets |
| Layout | `.stack-*`, `.split-row`, `.action-grid`, `.button-cluster`, `.flex-fill` | bespoke spacing wrappers |
| Truncation | `.truncate` | repeated overflow/ellipsis bundles |

State hierarchy is fixed: `.page-loading` + `Spinner` while an initial page is
loading; `PageFailure` when the whole page cannot render; `InlineFailure` when
only one section failed; `EmptyState` for empty/first-use collections;
`SaveStatus` for persistence; and `Modal` for destructive confirmation.

Valid class combinations should express one clear hierarchy. For example,
`btn-primary btn-accent full-width` is a single emphasized block action;
stacking multiple tones or sizes is not supported.

## Promotion rules

- Pure stable UI may import Svelte, Bits UI, Phosphor, tokens, and other pure UI.
  It may not import API, router, platform, stores, or feature code.
- Adaptive UI may read presentation/platform capabilities but not call domain
  APIs.
- Prefer composition utilities for layout. Do not add generic `Card` or `Row`
  components with broad styling escape hatches.
- Update this file whenever a stable component or supported variant changes.

## Quarantine

No quarantined components currently exist. Add unreviewed UI here with its
owner, reason, only call site, and review/expiry date. Never promote or remove a
quarantine marker without explicit user approval.
