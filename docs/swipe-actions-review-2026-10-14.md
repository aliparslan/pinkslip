# Swipe actions on Jobs: review (2026-10-14)

The owner found swiping a job row "really wonky". This is what a recording
of the simulator shows, frame by frame, with the cause in code. The row is
`FeedRow` in `apps/native/src/features/redesign/JobsFeed.tsx`, the swipe is
`SwipeRow` with `appearance="capsule"` in `apps/native/src/kit/SwipeRow.tsx`,
and the actions come from `apps/native/src/features/jobs/row-actions.ts`.

How it was checked: `xcrun simctl io recordVideo` while driving touches on
the simulator, then every frame of the row cropped and tiled. Three runs:
drags released short of the commit point, a full Save, and a full Unsave
(which put the job back as it was).

## What goes wrong

1. **The armed label is cut off.** A full swipe shows "Sav" for Save and
   "Un…" for Unsave. The ink capsule is positioned inside the 44pt circle's
   box (`capsuleLeading` and `capsuleTrailing` have no width), so its label
   is measured against 44pt and truncates.
2. **Two shapes at once while it arms.** At the commit point the grey
   circle fades out while the ink capsule fades and scales in (0.92 to 1)
   over 140ms. For several frames both show, offset from each other, so it
   reads as a flicker rather than one thing changing.
3. **The row flashes grey.** The row's `Pressable` takes the touch first:
   it turns grey on touch-down, before the swipe starts, and again for
   about a third of a second after letting go, while the row springs home.
   iOS lists wait about 100ms before highlighting and never highlight a row
   that's being dragged.
4. **It overshoots home.** Released while moving back towards the middle,
   the row springs past its resting place (26pt in the recording) and opens
   a gap on the other side before settling. `settleSpring` asks for no
   overshoot, but with the release velocity passed in the clamp doesn't
   hold when the spring starts at, or close to, its target.
5. **Nothing says what will happen until 120pt.** The commit point is 30%
   of the width (120pt on this phone). Until then there's only a grey circle
   in a white gap, so a short swipe looks like nothing.
6. **Each arming re-creates its animations every frame.** The capsule's
   `withTiming` calls sit inside `useAnimatedStyle`, so each frame of a
   drag starts a fresh 140ms animation. They converge, but slower and
   unevenly, and it costs work on every frame.
7. **Removing a row jumps.** Hide and Applied slide the row out, then the
   list drops it and the rows below snap up with no animation. The cell is
   reset 700ms later.

## The actions themselves

| Side | Today | Notes |
| --- | --- | --- |
| Right (leading) | Save, or Unsave once saved, or Applied in Saved | One slot that changes meaning with the row's state |
| Left (trailing) | Hide, or Remove in Saved, or "Didn't apply" | Hide removes the row; the others vary by list |
| Long press | Save, Mark as applied, Mark as read or unread, Hide, Block for everyone | The full menu, with a preview |

Neither side has color: both are grey until armed, then ink. Mail and the
apps people know color each action (save, archive, delete), which is how a
swipe is learned. Proposals are drawn on Paper "Swipe actions · Oct 14".

## Fixes, whichever design is picked

- One shape that grows: the circle widens into the capsule as the drag
  goes (width animated, the label fading in), so nothing overlaps and the
  label is sized by its own text.
- Cancel the row's press when the swipe takes over, and wait ~100ms before
  highlighting.
- Settle home on an ease-out timing (no overshoot is possible), keeping the
  release speed by shortening the duration.
- Drive arming from a shared value, so animations start only when it
  changes.
- Collapse the row's height before the list drops it.

## Built (S4, owner 2026-10-14)

`SwipeRow` in `apps/native/src/ui/SwipeRow.tsx`, used by the Jobs feed.
Right is Save (or Unsave), all the way, then Read or Unread; left is Hide,
all the way, then Applied (or Not applied). A short swipe stays open on the
circles to tap; a tap on the row closes it; one row is open at a time and
scrolling closes it. All the way is a little past the circles (the larger
of 42% of the width and the circles plus 56pt).

Checked on the simulator by recording: the capsule shows its whole label;
the outer circle widens into the capsule while the other folds away, so one
shape changes; settles ease out with no overshoot; Hide slides the row away
and folds its height, so the rows below rise instead of jumping. The row's
highlight waits 150ms and is skipped while a row is being swiped.

Left open: the toast's Undo didn't respond to the simulator's injected tap
(the toast lives in its own overlay window), so a job hidden in testing is
still hidden on the simulator's guest account. The toast is being redesigned
next.
