# React component catalog

## Stable UI

No React components have been approved yet. Use Base UI for supported interaction
behavior and the shared semantic tokens for appearance. shadcn and Linear are
visual references only; component APIs follow Pinkslip's needs.

## Quarantine

- **Website Apple sign-in composition (integration closeout)** — Account uses
  the existing full-width secondary Button and AppleLogo in a normal HTML
  form. Hono owns the redirect and callback; no router/API dependencies enter
  the kit. The button appears only when server configuration is complete.
  Product review is at `/you/account`; fixture coverage is in `e2e/you.pw.ts`.

Design consistency fixes applied after the port, and open questions, are in
`docs/kit-design-review.md`. Rules every kit component follows:

- Spacing uses the space tokens only (4px grid). Raw pixels are for
  component dimensions, never padding, margins or gaps.
- Heights: `control-height` 48 (buttons, inputs, default icon buttons, tabs),
  `control-height-compact` 40 (compact controls, menu items), and
  `control-height-small` 32; compact and small grow to 44 on phones.
- Radii: inner elements are concentric with their container (container
  radius minus the inset), e.g. `radius-xs` inside a 4px-inset `radius-md`.
- Selection: choosing a value is pink; choosing a view is a raised pill.
- Filled buttons have no visible border; outlined ones use `line-2`.
- Button labels are weight 450, the one exception to 400/500/600: Untitled
  Sans' 500 reads as bold on a filled button (owner, 2026-10-10).
- Disabled is opacity 0.6. Focus is a 2px accent outline at a 2px offset.
- Confirming actions sit on the right of a horizontal action group (owner,
  2026-10-10). Autosave shows only failure and Retry; successful saves are
  automatic, with a visually hidden status announcement.

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
  (`Button`, `ButtonAnchor`), `kit/icon-button`, `kit/field` (`Field`, `Input`,
  `Textarea`, `Select`, `Fieldset`, `Form`), `kit/checkbox` (`Checkbox`,
  `SelectCheck`), `kit/switch`, `kit/toggle-group`, `kit/alert`,
  `kit/save-status`. Each reproduces an app.css role: `Button` variants are
  `.btn-primary.btn-accent` (`primary`), `.btn-secondary` and
  `.btn-secondary.btn-danger` (the ink `.btn-primary` was dropped), `size="compact"` is `.btn-mini` and
  `fullWidth` compact is `.btn-action`; `IconButton` is `.icon-btn` with
  `-sm`/`-xs`/`-surface`; `Field` is `.field-label` + `.label-opt` with the
  error as an `.alert-error`, and the controls are `.input-field`,
  `.textarea-field` and the native select with `.select-chevron`; `Checkbox`
  and `SelectCheck` are `.select-check`; `Switch` is `.switch`; `ToggleGroup`
  is `.chip-wrap`/`.chip` (`chips`) and a `segmented` variant that uses the
  `Tabs` track and pill;
  `Alert` is `.alert-*`; `SaveStatus` is `SaveStatus.svelte`. The phone
  `:root` overrides from app.css (tap-height compact controls, looser radii)
  live in `styles/base.css`. Not built, because the current app has no call
  site: `RadioGroup`, `NumberField` (number inputs use `Input type="number"`),
  `CheckboxGroup`. `Combobox`/`Autocomplete` moves to 2.3 with the other
  popups. Rendered at `/_kit`; awaiting the 2.4 comparison and owner review.
  The typed `LinkButton` lives in `features/navigation/LinkButton.tsx`; it
  wraps the kit's `ButtonAnchor` so the pure UI has no router dependency.

- **Overlays and feedback (2.3)** — Owner: Web port. Files: `kit/dialog`
  (`Dialog`, `Sheet`, `AlertDialog`), `kit/menu`, `kit/toast`, `kit/tabs`,
  `kit/disclosure`, `kit/progress`. `Dialog` is `Modal.svelte`: a centered
  `.modal-card` that becomes a bottom sheet at 640px and below, sized sm/md/lg
  (340/380/560px; the 350, 390 and 520px one-offs round to these). `Sheet` is
  the feed's `.sheet.filter-sheet` with its header, scrolling body and pinned
  footer. Both use Base UI's Drawer, so swipe-down dismissal replaces
  `drag-dismiss.ts`. `AlertDialog` is the Cancel/confirm Modal pattern with
  alert-dialog semantics (no outside-click or swipe dismissal). `Menu` is
  `.menu-surface`/`.menu-item` with an icon-button or select-style trigger
  (`.work-mode-trigger`) and checkbox items using `SelectCheck`. `toast` and
  `ToastProvider` are `feedback.svelte.ts` + `Toast.svelte` on Base UI's toast
  manager (two visible, 3.5s default, actions persist, `dedupeKey` updates in
  place); the provider is mounted in `__root.tsx`. `Tabs` is `.my-jobs-tabs`
  with Base UI's indicator. `Disclosure` is `.advanced-fields`. `Progress` is
  the usage meter (`bar`) and the onboarding step track (`steps`). `Tooltip`
  (inverted label; `IconButton tooltip` shows its label on hover and focus,
  desktop only), `Popover` and `InfoTip` (an ⓘ that opens on hover and on
  tap) are new in the port, added at the owner's request: the Svelte app had
  none, so their look extends the menu surface and has no reference to match.
  `TooltipProvider` is mounted in `__root.tsx`. Not built, because the current
  app has no call site: `Combobox`/`Autocomplete` (locations are fixed chips and company search is
  a plain input). Rendered at `/_kit`; awaiting the 2.4 comparison.

- **EmptyState (3.3)** — Owner: Web port. Files: `kit/empty-state`. One
  component for `EmptyState.svelte` and `PageFailure.svelte`, which differed
  only in icon size and title ink: a 48px icon disc, the `display-sm`
  heading (or `section` when `compact`), a `sm`/`ink-3` message and centered
  actions; `alert` adds `role="alert"` for failures. Used by
  `features/states/PageStates.tsx` for the 404, missing-job and route-error
  pages.

- **Alert rows and load states (3.3)** — Owner: Web port. `Alert` gained an
  optional `icon`, `title` and one trailing `action` (a grid row, which wraps
  the action under the copy at 360px and below), reproducing
  `InlineFailure.svelte`, and `size="compact"` for the one-line
  `.feed-stale-notice` strip. Compositions in `features/states/LoadStates.tsx`:
  `PageLoading` (`.page-loading`, also the router's default pending
  component), `PageFailure` (`PageFailure.svelte` on `EmptyState`) and
  `InlineFailure`; `features/states/OfflineBanner.tsx` shows the compact
  warning strip on every page while TanStack Query's `onlineManager` reports
  offline. The strip has no retry button because Query refetches on reconnect.
  The current feed's text-style "Refresh" button inside the strip waits for 4.2.

- **Job row and list (4.1)** — Owner: Web port. Files: `features/jobs/`.
  `CompanyLogo` is `CompanyLogo.svelte` (sizes 24/32/44 with concentric radii;
  real logos on a white `--color-logo-tile` in both modes, initials on the
  sunken tile). `JobRow` is the web `JobRow.svelte`: company and timing with
  the fresh-unread "new" dot, title, location and salary, match reason, and a
  `Menu` of the actions its owner wires (Save, Mark as read/unread, Hide,
  admin Block). Read rows step down the ink ramp rather than fading, for
  contrast. `JobList` is `VirtualJobList.svelte` on TanStack Virtual's window
  virtualizer; the server render and a focused list render every row. Demos:
  `/_kit` (Job rows) and `/_kit-list`.

- **Feed, job page and Library additions (4.2–4.4)** — Owner: Web port.
  `SearchInput` (`.feed-search`: an input with a leading glass, named by its
  `aria-label`), `MultiToggleGroup` (chips with several values and a
  minimum, for career stages), `AlertDialog` `cancelLabel` ("Not yet"), and
  `Button` `aria-pressed` (Save/Saved). Demos on `/_kit`. Screens:
  `features/feed`, `features/job-detail`, `features/library`, sharing
  `features/split/SplitLayout` (list beside the job on wide screens).

- **Resume and answers additions (4.10–4.12)** — `ToggleGroup` takes
  `onClear`: pressing the chosen chip again clears it (an unanswered
  question), with `value` undefined when nothing is chosen. Demo on `/_kit`.

- **Foundation route compositions** — Owner: Web port. Files: `routes/__root.tsx`,
  `routes/index.tsx`, `routes/jobs.$jobId.tsx`, and `routes/you.tsx`.
  These minimal pages prove public SSR, client-only account reads, routing,
  and API forwarding. They are not completed feature screens or approved kit
  primitives. Phase 2 replaces their temporary compositions using the preserved
  design references before the product screen port.

- **Route shell and placeholders (3.1, revised after review)** — Owner: Web
  port. Files: `features/shell/Shell.tsx`, `features/navigation`, the route
  files, `routes/library.tsx`, `routes/you.index.tsx`. Pages below a root get
  the current design's screen bar (icon-only Back via `IconButtonAnchor`
  `tone="strong"`, centered title, hairline). Library is a "Library" title over
  link-based kit `Tabs`; the You overview is grouped `Surface` rows. The wide
  sidebar nests You's groups (Search, Materials, Pinkslip) and Admin's pages;
  phones show section links only for Admin. Route metadata owns titles, shell,
  depth and root selection. See `docs/port-review-3.1.md`. Kit additions:
  `IconButtonAnchor` (an icon-only link) and `TabItem.render` (a router link
  per tab, keeping the kit router-free).
