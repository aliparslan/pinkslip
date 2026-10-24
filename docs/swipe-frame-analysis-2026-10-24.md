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
