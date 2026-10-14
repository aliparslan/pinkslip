# Toast: review and redesign round (2026-10-14)

The owner asked whether the toast still fits. It doesn't: it's the old kit's
(`apps/native/src/kit/Toast.tsx`), drawn before the redesign. Options are on
Paper "Toast · Oct 14".

## What's wrong with today's

- **It breaks the system's own rules.** A green dot marks success, but
  `good` is kept for the Offer stage. It uses the old `Text` sizes and the
  old border and shadow rather than the floating layer's (`bg-elev`, the pill
  shadow, Liquid Glass on iOS 26).
- **It sits in a fixed place,** 64 off the bottom. It ignores whether the tab
  bar is showing, so on pages with a pinned button it would land on top of
  that button.
- **The action is a pink word** ("Undo"), where the kit uses round icon
  buttons.
- **Stacking is crude:** two at most, the older one simply above, with no
  way to see or clear them together.
- **It says too much.** It's called from 117 places, and many repeat what
  the screen already shows.

## What a toast is for

1. **Something left the screen.** It's paired with Undo: a job was hidden,
   a job was removed from Saved, a job moved out of the feed by Applied, an
   answer or a resume entry was deleted.
2. **Something happened somewhere else:** a test sent, a report or feedback
   sent, a company requested, a company back in Jobs, and Copied.
3. **Something didn't work.** It offers Try again when there's something to
   retry.

When the screen already shows the change, there's no toast.

## Calls to cut

| Where | Toast | Why |
| --- | --- | --- |
| `jobs/useJobActions.ts` | "Job saved" | The bookmark fills, and the swipe's capsule says Saved |
| `job-detail/useJobPage.tsx` | "Added to applied jobs" / "Removed from applied jobs" | The page's button changes |
| `apply/OutreachSheet.tsx` | "Follow-ups stopped" | The thread shows it |
| `resume/Resume.tsx` | "Resume imported", "Resume cleared" | The page shows it |
| `redesign/you/AccountPage.tsx` | "Signed out" | The screen turns into the guest one |
| `redesign/JobPage.tsx`, `job-detail/JobDetail.tsx` | "The full posting loaded." | It's on screen; "isn't available yet" belongs inline on the page |

The feed's "Marked as applied" goes too: the row stays with its Applied
mark, and a swipe takes it back. Admin toasts stay as they are. Errors stay, but are shortened to
"Couldn't …", with Try again where it can retry.

## The options (Paper)

- **T1 · A capsule over the tab bar** (recommended):
  - **Look:** the tab bar's material and shadow, hugging its words, 48 tall,
    12 above whatever floats at the bottom (the tab bar, a pinned button, or
    the keyboard). It stays on top of sheets.
  - **Contents:** the action's icon at 20 in `ink-2`, the message in Subhead
    `ink`, then Undo or Try again as a 32 round icon on `fill`.
  - **Stacking:** up to three, like Sonner and Base UI. The newest is in
    front, and older ones sit 8 and 16 behind at 95% and 90%. Tap the stack
    to spread it.
- **T2 · Drops from the top.** The same capsule comes down from under the
  Dynamic Island, like iOS's Silent mode pill. It never meets anything at
  the bottom, and it shows one at a time. Undo is a long reach.
- **T3 · Undo where the row was.** A hidden or removed row folds to a 52-tall
  row with Undo, and it closes once you scroll on. It works only for lists,
  so it still needs T1 or T2 for everything else.

**The kinds:**
- left the screen: the action's icon, then Undo;
- done elsewhere: a pink check;
- couldn't: a `bad` warning mark, then Try again;
- still working: a spinner, and the same toast becomes the result;
- dark mode: the tab bar's dark glass.

An optional ring around Undo runs down with the time left.

## Behavior

Taken from Sonner and Base UI, for any direction:

- **Duplicates:** the same message updates in place.
- **How long:** 4 seconds, or 6 with an action. A working toast stays until
  it's done.
- **Pausing:** the clock stops while it's touched, while the stack is spread,
  and while the app is in the background.
- **Dismissing:** swipe it back the way it came, or to the side. A flick is
  enough, and it leaves the way it came.
- **Motion:** it rises 12 and fades in on the sheet curve in 320ms, and
  leaves in 200ms. With Reduce Motion it only fades.
- **Haptics:** none for Undo or done, since the action already had one. The
  error haptic for Couldn't.
- **VoiceOver:** the toast is announced, and the icon buttons are labeled
  "Undo" and "Try again".

## Testing note

On the simulator, `simctl`'s injected taps didn't reach the toast's Undo. The
toast is in its own overlay window. Check Undo on a device before calling the
new one done.

## Built (T1, owner 2026-10-14)

`apps/native/src/ui/Toast.tsx`; `kit/Toast.tsx` re-exports it, so today's
screens use it too and every `toast.*` call works unchanged. New:
`toast.loading`, an `icon` for the leading mark, and `useToastLift` for
pinned bars (the tab bar, the job and application pages register theirs).
The cuts above are made; the posting-loaded notice is now a VoiceOver
announcement only.

Two things found on the simulator:
- **Liquid Glass and opacity.** Fading any parent of a `GlassView` left the
  glass undrawn. The toast fades only its words, and the glass
  materializes and dissolves through `glassEffectStyle` (`regular` ↔
  `none`, animated), so a dismissed toast leaves first and is dropped
  250ms later.
- **The spread stack's touches.** A tap-away backdrop mounted on demand
  landed above the toasts and took their touches; it now stays mounted
  under the lane and only takes touches while the stack is spread.

Undo now responds to taps on the simulator (it didn't with the old toast),
spreading, swiping one away and tapping away all work. Still to check on a
device: VoiceOver reading and the Undo button, and the keyboard lift.
