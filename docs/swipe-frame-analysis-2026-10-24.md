# The job swipe, frame by frame (2026-10-24)

The owner said the job swipe "needs a lot of work … it was kind of off
before too", and asked for a frame-by-frame look because it's hard to say in
words.

## How it was measured

- The feed's own rows ran on sample jobs: `FeedRow` in a FlashList, in the
  kit's **Swipes, the feed's rows on sample jobs**
  (`features/kit/SwipeFeedLab.tsx`). Actions there are local, so full swipes
  and Hide could run for real.
- The swipes were scripted fingers on the iPhone 17 simulator, recorded with
  `simctl io recordVideo`, split into their real frames with timestamps.
- Each frame was measured against the resting row: how far it has moved,
  its brightness, and how far the circles reach.
- The curated frames are in Paper, **Swipe · frame by frame · Oct 24**.

What's right: while the finger is down, the row follows it point for point,
at the same 3.3pt a frame the finger moves, with no lag, no jump at the
start and no press highlight. Everything that's off happens around the
edges of the drag.

## What's off

1. **Arming a full swipe: two shapes fight for about 100ms.** This is the
   strip A/F frames 20–26 and 51–61.
   - Past the commit point, the outer circle widens into the capsule. At the
     same time its icon and label cross-fade with the capsule's own icon and
     label, offset from them, so there are two icons and two labels for a
     few frames.
   - The inner circle is squeezed to a sliver instead of leaving.
   - The labels under the circles fade slowly and stay visible under the
     capsule.
   - Cause: `Circle` in `ui/SwipeRow.tsx` interpolates the width while
     `quiet` and `loud` cross-fade. The inner circle's width goes to 0 with
     `overflow: hidden`.

2. **Hide: the capsule parks, then the gap folds over the next row.** This
   is strip B.
   - After letting go, the row slides off, but the capsule is placed 12pt
     from the row's moving edge, so it ends up parked at the screen's left
     edge for about 150ms.
   - Then the fold runs quickly, with the capsule still fading as the next
     row slides up under it.
   - Cause: `perform` runs the slide (200ms ease-out), then the fold
     (200ms) after it. The slide's ease-out tail is the stop.

3. **Save, Read and Applied: the capsule changes colour on the way home.**
   This is strip C, frames 62–75.
   - A full swipe that doesn't remove the row runs its action at once,
     while the capsule is still showing. Saving turns the outer action into
     Unsave (graphite), so the pink capsule flips to dark grey for a few
     frames.
   - The re-render drops about two frames: a 41ms step where the rest are
     16ms.
   - Cause: `perform` calls `run` in the same moment it starts the settle,
     and `Side` renders the new actions.

4. **Letting go short: the row stops dead and reverses in one frame.** This
   is strip D and the plot.
   - Let go 36pt in while moving left at about 310pt/s. The next frame is
     already heading right at about 600pt/s.
   - The settle is a fixed `withTiming(SETTLE)` (260ms ease-out) that
     ignores the release speed: the "brick wall" Apple's fluid-interfaces
     talk warns about.
   - A flick that opens the row hides it, because there the ease-out's
     start speed happens to match the finger.
   - `kit/motion.ts` already defines `settleSpring` for this, from the
     finger's speed, and the swipe doesn't use it.

5. **Arriving: the labels come in cut off by the screen's edge.** This is
   strip E.
   - The circles ride beside the row's edge, so they slide in from
     off-screen, and their labels read "Ap", "Applie", "Hi" for most of a
     slow drag.
   - "Applied" is wider than its circle, so the open pair looks unevenly
     spaced.

4x slow-motion clips of Hide, Save and letting go short were sent in the
session (not kept in the repo).

## Fixes to try

Each fix would go in the Motion lab as a Now/Proposed pair first.

1. **Arming:** no width morph. The outer circle fills with its solid colour,
   its glyph turns white, and it gives a small pop on a spring (to about
   108% and back) with the commit haptic. The inner circle and its label
   shrink and fade out in about 120ms. The outer label stays. One shape
   changes, nothing crosses.
2. **Hide:**
   - One continuous motion: the circles leave with the row (fading as it
     passes the screen's edge) rather than parking.
   - The fold starts while the row is still sliding (about 60% in), so
     leaving and closing up read as one gesture.
   - The row is taken out of the list once the fold has finished.
3. **Non-removing actions:**
   - The actions are frozen at release, so the capsule keeps its colour all
     the way home.
   - The action runs once the row has settled, when nothing is moving, so
     its re-render can't drop a frame mid-motion. The haptic still lands at
     the commit.
4. **Letting go:** settle on `settleSpring` from the release velocity, with
   overshoot clamped, so the row carries on a touch and turns back smoothly
   instead of reversing in a frame.
5. **Arriving:** two ways to compare.
   - (a) The circles stay put at the screen's edge and the row slides off
     them: they're uncovered rather than cut, like iOS's own swipe actions.
   - (b) Keep them riding the row's edge, but they don't fade in until
     they're fully on screen.
   - Either way, give the labels the same slot width so the pair is evenly
     spaced.

## The iOS reference (Reminders, same system swipe as Mail)

The owner pointed at Mail (2026-10-24). The simulator has no Mail, so this
records Reminders, which uses the same system swipe actions, with the same
tools.
- **Pills, not circles.** Each action is a capsule with its icon and label
  inline: 87pt wide and 34pt tall in a 42pt row. They're about 10pt apart,
  about 10pt from the screen's edge, and about 10pt from the row.
- **Fixed slots.** Each pill sits in its own slot at the screen's edge and
  grows in place, from small and clear, once the row's edge has passed it.
  Nothing slides in from off-screen, so nothing is cut.
- **The row turns into a card.** As it moves it greys (page 252 to 226) and
  its moving edge rounds into a capsule end.
- **Past the open point,** the outer action (the full-swipe one) stretches
  toward the row, pushing the other one along, with its label riding the
  row-side edge.
- **At the commit,** it fills to the row's edge as the row leaves and the
  other pill fades. The space closes about 200ms later.

## Proposed (Kit → Swipes, now and proposed)

`SwipeRow` reads `SwipeLookContext`. The pills version (`PillSwipeRow` in
`ui/SwipeRow.tsx`) runs only in the kit until the owner approves it. It
covers the owner's three points and the five fixes:
- **Pills sized to their text:** 44 tall, icon 18 and Subhead Medium label
  inline, 14 padding, at least 72 wide. They're 8 apart and 8 from the
  screen's edge, tinted at rest, with the icon and label in the tone's ink.
- **Fixed slots, growing in.** A pill grows from its slot's middle, only as
  big as the space the row has uncovered, so it's never cut by the screen
  or covered by the row. Once they're all out they don't move. Past that,
  the outer one stretches toward the row and the inner one keeps its place
  beside it.
- **Arming:** the outer pill turns solid and fills to the row's edge, with
  the tap haptic. The inner one is gone by the time it's reached. One shape
  changes colour; nothing crosses.
- **The row being acted on is a card:** corners round to 22 within the
  first 24pt and it takes the separator's grey within 48pt. In dark mode
  that's a lighter card. `JobRow` drops its own background inside one
  (`SwipeCardContext`).
- **Letting go** springs from the finger's speed (`settleSpring`), so a
  short drag slows and turns back instead of reversing in a frame.
- **Hide** sends the row off on a spring from the finger's speed, and the
  space starts closing 120ms in, so it's one motion.
- **Save, Read and Applied** bring the row home on a brisker spring with the
  capsule still in its colour, then run, so nothing changes mid-motion.
  "Saved" lands about 0.4s after letting go.

Measured on the simulator (light and dark):
- Pills never cut.
- The stretch keeps the pair together.
- Hide: let go to gone in about 300ms.
- Save: back home in about 0.4s, still pink.
- A short let-go turns back over about 6 frames (2, 4, then 4.6pt a frame)
  where it used to jump 10pt in one.

## Halfway swipes (owner, 2026-10-24: "a lot less smooth than Reminders")

The same 8pt-a-frame halfway drag was recorded in both apps.
- **Reminders' pills aren't a function of the row's position.** In a
  faster drag they're smaller at the same distance, so each pill's size
  chases a target on a spring.
- **The fitted model**, from two Reminders drags, about 5% off: the target
  eases in (sine) over 70pt from 6pt before the pill's middle, and the size
  follows on a critically damped spring with a 0.24s response.
- **Ours grew at a fixed rate** tied to the row's edge, then stopped dead at
  full size. It also appeared at 70% strength instead of faint.
- **Now each pill chases that target** on `motion.swipe.grow`, the target
  easing in over 0.8 of its width and always whole by the open point.
  Opacity is its size × 1.25.
- **Side by side** (scratchpad `compare-halfway.png`), both pills come in
  tiny and faint and ease up to full size a beat behind the row; ours
  finishes a little sooner.

The segmented control's thumb moved to its own `motion.segment` spring,
0.28s, because the tab glide's 0.4s felt slow.

## How far a short swipe goes (owner, 2026-10-24)

"A smaller swipe should allow the user to see the expanded options."
- Ours opened only past half the actions' width, about 110pt of row travel.
- Reminders opened from an 18pt drag, held still and released.
- Now, from closed, the row opens once where it was heading (its position
  plus `project()` of the release speed) passes 8pt of travel. The row moves
  only after 14pt of finger, so that's about a 22pt drag.
- From open, the old half-way rule stays, so pushing an open row back past
  half closes it.
- Releasing while moving back faster than 150pt/s always closes it.
- Checked on the simulator: a 24pt slow drag opens to Applied and Hide; from
  open, a 40pt push back stays open; a 140pt push back closes.

