# Native component catalog

## Stable UI

Native components await the owner's visual review. Use the existing kit and
shared semantic tokens; domain actions belong in features.

## Quarantine

- **Application and import compositions (integration closeout)** — the
  feature-owned `ApplicationBrowser` uses an iOS page sheet with drag-down
  dismissal, existing Button/IconButton/Text, and a polite status line. Fill
  remains on the right. Resume and onboarding retain the existing import
  review/error composition; OCR adds a hidden, inaccessible local renderer,
  not a new kit primitive. Cancelling the review retains the previous PDF.
  Review on the signed phone is still needed; testing flows are in
  `docs/port-closeout.md`.

- **SwipeRow (replaces NativeList, 2026-10-10)** — one full-swipe action per
  side inside FlashList: grey behind the row while dragging, filled with its
  colour and a haptic past the commit point (30% of the width, at least
  88pt), released to run; a flick commits too. `removes` slides the row away
  for actions that take it out of the list. FlashList keeps the native large
  title and search bar collapsing, which the SwiftUI List broke, and recycles
  rows. Every action is also in the long-press menu and the row's
  accessibility actions. Demo: development-only `/you/kit-swipes` (Kit →
  Swipes).
- **Craft pass (2026-10-10, `docs/craft-pass-2026-10-10.md`):**
  - `PressableScale` / `usePressScale`: Button and the chips scale to 97% on
    press, and the Checkbox box to 92%. The timing is 140ms `--ease-out` on
    the UI thread, replacing the opacity dims.
  - SwipeRow: a short release settles on a spring that starts from the
    finger's speed. A row can be caught mid-animation, and the side with no
    action resists.
  - Toasts: enter on `--ease-out` and can be swiped down to dismiss (a gesture
    root inside the overlay, sized to the stack only).
  - Disclosure: the caret turns instead of swapping.
  - Motion values come from `kit/motion.ts`.
- **Filled Menu sizing correction** — the existing `fill` prop now measures
  its container and constrains the nested SwiftUI menu trigger. This preserves
  wrapping in JobRow and Select; the native menu actions remain unchanged.
- **Destructive Button and SaveStatus follow-up** — destructive buttons use
  semantic red text on the control surface, matching the web kit and avoiding
  white labels on the pale red token. Autosave shows only failure and Retry;
  successful writes remain automatic. Retry is a named button with a 44pt
  target. Demo: You → Kit; product use: Account, Preferences and Resume.
