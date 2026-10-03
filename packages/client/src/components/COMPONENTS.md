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
| Autosave feedback | `SaveStatus.svelte` | `SavePresentation.phase`, optional compact presentation, and a semantic Retry callback for failed saves |
| Dialog or mobile sheet | `Modal.svelte` | title, subtitle, width, initial focus policy, busy state, dismiss callback, content/actions snippets; always-visible 44px Close action; sheet drag begins from the handle/header and ignores interactive descendants |
| Pushed-screen header | `ScreenNav.svelte` | title, back action, optional trailing content, native collapsing title |
| Collapsed-header search | `HeaderSearch.svelte` | owner-keyed page registration that survives retained-root navigation, compact expand/collapse control |
| Transient feedback | `Toast.svelte` + `ToastViewport.svelte` through `feedback.svelte.ts` | message, tone, optional Undo/action |
| App navigation | `RootHeader.svelte`, `TabBar.svelte` | shell-owned; retained root headers receive their active visibility state; do not recreate inside pages |
| Product/Apple marks | `BrandMark.svelte`, `AppleMark.svelte` | fixed brand assets |
| Branded app loading | `BrandLoading.svelte` | full-viewport brand lockup with an accessible loading label |

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

- **Education and experience preference fields** — Owner: Job matching.
  Reason: the optional completed-education selector, numeric experience input,
  requirement ceiling, and unstated-experience switch reuse existing form and
  Switch compositions but await hands-on visual review on iOS and web.
  Call site: `SearchProfileFields.svelte`, used in onboarding and Job preferences.
  Review or expire by 2026-10-17. The current catalog remains early-career and
  excludes doctorate-only roles; the controls state those limits explicitly.

- **Web Jobs/Library master–detail workspace** — Owner: Web experience.
  Reason: the persistent desktop Jobs/Library/You primary sidebar,
  persistent list pane, route-aware
  empty detail state, independent pane scrolling, and desktop-only action
  placement are new browser compositions awaiting visual approval at the
  supported desktop widths. Call site: `apps/web/src/WebApp.svelte`; styles live in
  `apps/web/src/web.css`. Review or expire by 2026-09-30. This is a web-owned
  feature composition, not a shared split-pane primitive; do not promote or
  copy it until the documented reuse threshold and explicit user approval are
  both met.
- **Shared adaptive/mobile-web parity presentation** — Owner: Web experience.
  Reason: the iOS-aligned type roles, canonical 44px controls, flat grouped
  phone surfaces at 540px and below, and the roomier 541–899px composition are
  shared visual policy awaiting side-by-side iOS review in light, dark, zoom,
  and accessibility modes. Styles live in `packages/client/src/app.css` and
  `packages/client/src/styles/typography.css`; browser wrapping and shell
  adaptations live in `apps/web/src/web.css`. Call sites span Jobs, job detail,
  Library, You/settings, Companies, Resume, Tailor, Admin, onboarding, and
  global state surfaces. Review or expire by 2026-09-30. Do not promote these
  breakpoint compositions as stable layout primitives before explicit visual
  approval.
- **Web secondary-route navigation workspaces** — Owner: Web experience.
  Reason: the desktop You settings navigation and Resume outline/editor
  composition are browser-specific adaptations awaiting keyboard, zoom, and
  visual approval across the supported wide widths. Call sites:
  `apps/web/src/WebYouNavigation.svelte`, `apps/web/src/WebApp.svelte`, and
  `packages/client/src/pages/ResumeProfile.svelte`; styles live in
  `apps/web/src/web.css`. Review or expire by 2026-09-30. Keep these as narrow
  route compositions rather than promoting a generic sidebar or outline
  primitive before the reuse threshold is met.
- **Web install/update actions** — Owner: Web experience. Reason: quiet,
  capability-driven installation and persistent waiting-update controls are
  new browser-only compositions pending hands-on Safari and installed-PWA
  review. Call site: `apps/web/src/WebPlatformActions.svelte`; styles live in
  `apps/web/src/web.css`. Review or expire by 2026-09-30. Keep platform state
  and side effects web-owned; this is not a shared notification primitive.
- **Tailoring trust workspace compositions** — Owner: Tailoring. Reason: the
  word-level evidence comparison, locked-bullet rewrite controls,
  removed-for-space restoration, exact-PDF `ResumePdfPreview`, and PDF revision
  history are new mobile interaction patterns awaiting hands-on iOS review. Only call site:
  `pages/Tailor.svelte`. Review or expire by 2026-09-15. These are feature-local
  compositions, not stable primitives; never promote or remove this marker
  without explicit user approval.
