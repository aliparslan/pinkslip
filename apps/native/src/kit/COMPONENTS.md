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

- **Native lists and swipes (6.4/6.6 follow-up)** — `NativeList.tsx` exposes
  `NativeList`, `NativeListContent`, and `NativeSwipeRow`. Used independently
  by Jobs and Library: SwiftUI owns the plain list, separators, pull to
  refresh, reveal buttons, full-swipe recognition, cancellation, and motion.
  `RNHostView` preserves the existing kit row and header compositions, their
  Dynamic Type sizing, menus and VoiceOver actions. The kit measures the
  actual list width before Yoga calculates row height, so long titles wrap
  instead of stretching a SwiftUI cell beyond the screen. `NativeListContent`
  bridges self-sizing headers, empty states and pagination footers; `onVisible`
  loads another page when the footer appears. SwiftUI lays out list cells
  lazily, but the React row tree is mounted for the loaded pages rather than
  recycled by FlashList. Large-feed performance needs device review.
  Swipe buttons use system action colors to retain native label contrast.
  Domain actions, optimistic updates and Undo stay in features/data.
  Demo: development-only `/you/kit-swipes` (Kit → Native swipes).
- **Filled Menu sizing correction** — the existing `fill` prop now measures
  its container and constrains the nested SwiftUI menu trigger. This preserves
  wrapping in JobRow and Select; the native menu actions remain unchanged.
- **Destructive Button and SaveStatus follow-up** — destructive buttons use
  semantic red text on the control surface, matching the web kit and avoiding
  white labels on the pale red token. Autosave shows only failure and Retry;
  successful writes remain automatic. Retry is a named button with a 44pt
  target. Demo: You → Kit; product use: Account, Preferences and Resume.
