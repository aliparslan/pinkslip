# Native component catalog

## Redesign kit (`src/ui`, 2026-10-12)

The October 2026 redesign (docs/redesign-wireframes.md, "The system"), built
from the `ui` tokens only. New and rebuilt screens use it; `src/kit` stays
for screens that haven't moved yet. Gallery: You → Kit → Redesign kit.

- **Text:** roles on Apple's text styles (largeTitle 34/41, title1 28/34,
  title2 22/28, body 17/22, longText 17/24, subhead 15/20, footnote 13/18).
  Founders Grotesk for display, Untitled Sans 400/500 for text. No `ink-4`
  tone: it's for strokes.
- **Button:** capsules. `primary` is the one pink thing on a screen (pastel
  fill, dark text); `secondary` grey; `plain` for Not now. Large is 50.
- **Chip:** 32pt; selected is an ink fill, never pink.
- **IconButton:** 44pt round on the grey fill. **Badge:** pink count for
  things that need you.
- **ListGroup / ListItem / Radio / SectionHeader:** inset grouped cards
  (12 radius, 16 margins), rows at least 44pt, separators inset to the text.
- **JobRow:** two lines, at least 64pt, text on the 60 line. The stage
  (Saved, Applied) takes the age's place. Facts leave out the level when the
  title already says it (decided 2026-10-12; the rule belongs to the screen).
- **CompanyLogo:** white tile with a faint outline in both modes.
- **Ticket:** grain (a baked tile, tuned to the Paper renders' tone), card
  shadow, 1pt printed rules, a punched perforation with half-notches on both
  edges, and a stub. `torn` shows the edge left after Apply: half-holes at the
  perforation's positions and quarter notches, drawn as real paper below the
  body so the shadow follows the tear.
- **PunchCard:** holes beside the label up to 5, rows of ten split into fives
  above that, at most 30, then a number and bar; no limit shows the count;
  over the limit shows "+N".

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
    root inside the overlay, sized to the stack only). The action (Undo) is
    Gesture Handler's `Pressable`, so a quick tap isn't swallowed by the swipe.
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
