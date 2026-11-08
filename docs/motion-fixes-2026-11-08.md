# Motion fixes before 1.4.0: the Paper round (Nov 8)

Section 1 of [design-roadmap-2026-11-07.md](design-roadmap-2026-11-07.md),
drawn in Paper on the page **"Motion fixes before 1.4.0 · Nov 8"**, one board
per fix. Each board shows the moment in three frames, what happens today,
and the values it would be built with. Nothing is built yet.

Once you pick, each one is built behind a Kit toggle (today vs proposed) so
you can feel both on the phone before the old one goes.

| Board | Flow note | Proposed |
| --- | --- | --- |
| 1 · Undo brings the job back | 2.36 | Hide played backwards: the space opens (0 → 84, 240ms, the swipe's fold curve) and the row slides back in from the left edge, 320ms, 60ms behind the space, landing at 380ms in a space that's already open. |
| 2 · Steps in a sheet fade | 4.10 | The sheet stays put and changes height (270ms, today's resize). The old step fades out in 100ms moving 8 the way you're going; the new one fades in over 200ms from 80ms, from 8 the other side, so the two are never readable at once. Back runs it the other way. |
| 3 · The month wheel and Ended | 5.2 | The wheel's space opens 0 → 216 in 270ms and the wheel fades in at its full size, so iOS sizes it once (the jitter). Opening Ended closes Started in the same motion. "I work here now" folds Ended away in 240ms. |
| 4 · Tracker loads in place | 2.7 | The placeholders take Tracker's shape: two chip shapes and a header bar above the rows, so nothing moves when the rows land. They go in 100ms as the rows arrive; rows, chips and headers fade in as one over 200ms from 80ms, the same rule as the sheet steps. No stagger. "Nothing yet" only once Tracker knows it's empty. |
| 5 · Swipe colours | 2.35 | Read and Applied use the glyph inks Today's tiles already use. In dark mode their tint goes 14% → 20%. Light keeps 14%. The full-swipe fill doesn't change. |
| 6 · A read resume settles in place | 5.9 | The bar fills to the end (200ms), then "Use this resume?" cross-fades in place and the sheet grows to fit, instead of a tall card flying in from the side. |

## Built (Nov 8)

All six are in the iOS app behind **Kit → Redesign kit → Motion fixes**.
Each fix has a switch: on is the proposal and is the default, off is what the
app did before. The choice is kept on the phone.

| Board | Where | Checked in the simulator |
| --- | --- | --- |
| 1 Undo | `ui/SwipeRow.tsx` (a row that left comes back the way it went) | Yes, in Kit → Swipes, whose Hide now has Undo |
| 2 Sheet steps | `ui/Sheet.tsx` (`StepCard`) | Yes, Your search → Visa sponsorship and Back |
| 3 Wheel and Ended | `ui/Fold.tsx` (new), `ui/Form.tsx` `MonthRow`, Role page | Yes, recorded frame by frame |
| 4 Tracker | `ui/RowPlaceholders.tsx` (`chips`, `giveWay`), `TrackerScreen.tsx` | No, it needs a signed-in first load |
| 5 Swipe colours | `ui/SwipeRow.tsx` `toneColors` | Light, yes. Dark, not yet |
| 6 Resume PDF | `ui/ProgressBar.tsx` (a 200ms finish), Resume overview | No, it needs a signed-in import |

Where the build differs from the boards:

- **Sheet steps: the old step goes at once** instead of fading for 100ms.
  React Native draws a leaving step under the new one, so its fade never
  showed, and waiting 80ms for it left the sheet blank. The new step now
  fades in from the tap. Boards 2 and 6 are updated.
- **Undo brings back only the row.** Without hiding them, the row's
  Applied and Hide actions reappeared behind it as it slid in.
- **The wheel is built 0.7s after the page opens.** iOS took about 300ms
  to build it on a tap, and the opening ran during that freeze. It's now
  ready before you tap, so the space opens smoothly.
- **Known:** at the start of an Undo, the row below shows faintly for one
  frame where the space opens. Tell me if you notice it.

After the first phone check (Nov 8, owner):

- **"The drawer still seems to slide bigger and smaller."** The top edge
  travelled for 270ms over a step that was already showing. You picked
  *size first, then step*: the empty sheet takes its new height in 150ms,
  then the step fades in over 150ms. Steps of the same height swap at once.
  Boards 2 and 6 are updated.
- **"Lag before the Ended wheel opens after setting Started."** Each tap
  redrew both iOS wheels (72 rows each), which held the tap up by about
  200ms in the simulator. Now a wheel redraws only when its own month or
  year changes, and the change shows in the first frame after the tap.

## The numbers behind board 5

Contrast is WCAG, measured from the token values with each pill's tint over the page.

| | Pill off the page | Read's label | Applied's label |
| --- | --- | --- | --- |
| Dark, today | 1.16 : 1 | 4.2 : 1 | 4.4 : 1 |
| Dark, proposed | 1.40 / 1.43 : 1 | 5.9 : 1 | 6.4 : 1 |
| Dark, Save (unchanged) | 1.37 : 1 | | |
| Light, today | 1.19 / 1.18 : 1 | 3.7 : 1 | 3.4 : 1 |
| Light, proposed | 1.22 / 1.21 : 1 | 4.4 : 1 | 4.0 : 1 |

It needs no new token: the pills switch from `tile-*-ink` to `glyph-*`, and
dark mode's tint alpha changes. Light labels still fall short of 4.5 : 1, as
Save's 4.1 does today. Clearing it takes the light glyph inks a step deeper
(lightness 0.52 → 0.49: Read 4.9, Applied 4.5 at 14%), which also deepens
Today's tiles. That's a separate call.

## Your calls

1. **4.10 replaces your Oct 13 pick** (each step its own card, sliding). It's
   the biggest change here, so it ships only if the fade feels better beside
   the slide in Kit → Sheets. Board 6 depends on it, but the PDF hand-off
   can fade on its own if you keep the slide everywhere else.
2. **Board 4 keeps the one-second wait** before placeholders (your Oct 15
   rule). Fast loads fade in over nothing, slow ones over the placeholders.
3. **Board 5 only changes Read and Applied.** Save (pink) and Hide (grey)
   stay as they are.
4. **Liberties:**
   - Board 4's chip and header placeholders are new: the kit's placeholders
     are rows only.
   - The "feel it beside" apps (Mail's Undo, Calendar's date rows, Mail's
     first load, Apple Pay's sheet) are my picks for checking the feel.
     Nothing is copied from them.

## What the design critic said

Three fresh passes (CLAUDE.md's design-critic, given only the screenshots),
scoring 6, 6, then **7/10**. What holds it at 7, by its account: the boards
explain in prose what the frames should show. It wants each curve printed on
its timeline bar, a small "today" frame per board, and ghosts or arrows
showing direction in the middle frames.

Fixed between passes:

- Middle frames showed two steps at once. Now one layer is readable at a
  time: out in 100ms, in from 80ms.
- Tracker's placeholders didn't sit where the rows land.
- Undo's middle frame looked like a rendering bug.
- Undo's numbers didn't add up: the row lands at 380ms, not 240.
- The month wheel didn't show what it pushes.
- Timing lived only in prose. Each board now has a timeline strip with
  the frames marked.

Left for you, since they're existing kit decisions rather than this round's
motion:

- **Back sits bottom-left in sheets**, beside Done. The critic would move
  it top-left and have the tapped row's label travel up into the title.
- **The toast's Undo is a 32pt disc** with no word; the critic wants
  "Undo" written and a 44pt hit area.
- **Tracker shows "Saved 2" twice** when one stage is present: the chip,
  then the stage header.
- **The pale pink "Save search"** (disabled) and white on the pink
  primary read weak to it. It would draw disabled as grey with an `ink-3`
  label, and use one commit style across sheet steps (Done is grey, Use
  this resume is pink).
- **Smaller notes:**
  - The Started wheel offers future years.
  - Cancel stays under a bar that has finished.
  - The month-wheel board doesn't storyboard Ended folding away.

## Not in this round

- 5.2's other part, the tab bar arriving a beat late after a page, was fixed
  Nov 7 (e352d60, 350c17e) and is on your phone as an owner update.
- 2.38, the spacing at the bottom of "Keep your saved jobs", is spacing, not
  motion. It's a small fix in code once you say how much room it should have.
