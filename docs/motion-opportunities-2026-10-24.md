# Motion opportunities in the iOS app (2026-10-24)

A sweep of `apps/native` for places that should move but don't, using the
find-animation-opportunities method: every candidate has to pass four
tests.
- **Frequency:** how often someone sees it.
- **Purpose:** feedback, spatial, state, preventing a jump, or delight on
  rare moments only.
- **Speed:** UI motion stays under 300ms.
- **Function:** nothing moves that someone is trying to read.

No real screen changes. Each row is in the Kit's **Motion, now and
proposed** lab (`features/kit/MotionLab.tsx`, You → Kit → Redesign kit) as
a Now/Proposed pair to try on the phone. That's how the sheet and tear
motion were picked. The swipe settle (#7, below the verdict) is there too,
behind an opt-in `settle="spring"` prop on `SwipeRow` that only the lab
passes.

**Owner's verdict (2026-10-24):**
- #1, #2 and #3 are in the kit: `ui/ProgressBar.tsx`, `ui/Segmented.tsx`
  and `ui/CopyField.tsx`.
- #4 showed no visible difference.
- #5 and #6 weren't worth it.
- The swipe needs a rework of its own, starting from a frame-by-frame look
  at how it moves now, so the lab keeps only the swipe.

## What's already there

The app already moves well where it matters:
- Sheets open, push between steps and ease to new heights (`uiMotion.sheet`).
- Swiped rows slide away and fold shut (`SwipeRow`).
- The Apply stub tears off, stamps land and punch holes punch.
- Onboarding has its full sequence.
- The tab bar glides and steps aside for Search, and the bottom search field
  arrives on the same glide.
- The top-edge blur fades.
- Buttons, chips, icon buttons and the copy button shrink to 97% on
  touch-down (`kit/PressableScale.tsx`), and list rows dim like iOS rows.

So press feedback and the big moments are covered. The gaps are smaller:
state that jumps instead of moving.

## Part 1: opportunities

Ordered by leverage. Values are from the tokens:
- `ease.out` = `[0.23, 1, 0.32, 1]`
- `duration` = 140 / 180 / 220
- `uiMotion.tab.glide` = response 0.4, damping 1
- `uiMotion.onboarding.rows` = 420ms, `ease.out`, rise 8, delay 120, stagger 60

Transform and opacity only.

| # | Location | Today | Purpose | Frequency | Suggested motion |
| --- | --- | --- | --- | --- | --- |
| 1 | `features/redesign/resume/ResumePages.tsx:158` (`ImportingStep`) | The import bar's fill jumps from nothing to 45%, then to 75%, and sits still between steps. It's the moment that once "seemed to do nothing". | State indication | Rare | The fill grows from 0 to each real step's width: `scaleX` from the left edge with `withTiming(target, { duration: 600, easing: ease.out })`. That's longer than the 300ms budget because it reports progress, not a UI response. It never creeps ahead of a real step (no time promises). Reduced motion: jump to the width. |
| 2 | `ui/Segmented.tsx:17` (Company page, Help, Support) | The raised thumb teleports to the tapped segment. iOS's own segmented control slides. | State indication | Occasional | One thumb, absolutely positioned, sliding with `translateX` on the `tab.glide` spring (no overshoot, about 300ms). Labels change ink as it passes (`ink-2` to `ink`, `duration.fast`). Reduced motion: a 140ms crossfade in place. |
| 3 | `ui/CopyField.tsx:55` | The copy icon swaps to the check, and back after 1.5s, with no transition. | Feedback / state indication | Occasional | Keyed on the icon: the leaving glyph goes to `scale 0.6, opacity 0` and the arriving one comes from `scale 0.6, opacity 0`, `duration.instant` (140) on `ease.out`. Same in reverse when it turns back. The button's own 0.9 press stays as it is. Reduced motion: opacity only. |
| 4 | `features/redesign/JobsFeed.tsx:147` (and Today, Tracker) | The pulsing placeholders vanish and the first page of rows appears at once. | Preventing a jump | Tens a day | Once per load, only when placeholders were showing: fade the new rows in from 0 to 1 over `duration.fast` (180) on `ease.out`, with no movement. Never on pull-to-refresh, pagination or a filter change. It has to be nearly invisible at this frequency. |
| 5 | `features/redesign/whats-new.tsx:133` (`ReleaseItems`, update notes and What's new) | The notes are already there when the sheet lands. | Delight | Rare: once per update | Each row rises on `onboarding.rows`, starting 120ms into the sheet's open, one every 60ms, so the news arrives with the sheet. Reduced motion: rows fade in together. |
| 6 | `features/redesign/JobsScreen.tsx:40` (`OfflinePill`) | The Offline pill pops in and out of the header. | Preventing a jump | Occasional | Enter at `opacity 0, translateY -4` over `duration.standard` (220) on `ease.out`; leave with opacity only over `duration.instant`. Reduced motion: opacity only. |

## Part 2: rejected

- **Tab switches** (`ui/TabBar.tsx`). Over 100 a day, and iOS doesn't
  animate tab content. It never moves.
- **Companies appearing above search results** (`SearchScreen.tsx:47`). It
  changes on every keystroke; motion would lag the typing.
- **The feed re-sorting when a quick filter chip changes**
  (`JobsFeed.tsx:121`). It's a list being read, tens of times a day.
  Results should simply be there.
- **Empty states settling in** (`ui/EmptyState.tsx`). The same part shows
  "No matches" while you search, and a new user sees Today's "Nothing yet"
  on every open. It's too frequent for the delight budget. The only
  exception worth a thought is a first-ever moment, not a component-wide
  animation.
- **Scaling list rows on press.** Rows already dim to 0.6, the iOS way.
  Scaling hundreds of rows a day would feel rubbery, and buttons and chips
  already carry the scale.
- **Stage marks filling on Tracker** (`ui/StageMark.tsx`). The stage
  changed earlier, somewhere else, so animating the ring on every visit
  replays old news with nothing to cause it.

## Part 3: verdict

The app needs little more motion. The system is already strong, and most of
the six above are small, quiet fixes for state that jumps. The highest
leverage is #1, the import bar. It's rare, but it's the one place where no
motion made the app look broken. #2 is next, since it's the only control
that behaves less like iOS than iOS does.

One thing for `improve-animations` rather than this list: `kit/motion.ts`
defines `settleSpring` for "anything a finger let go of … from the finger's
speed". `SwipeRow` settles on `withTiming(SETTLE)` and ignores the release
velocity (`ui/SwipeRow.tsx:196`). Handing the swipe's velocity to that
spring is the seam between drag and settle that iOS gets right, on a
gesture people use tens of times a day.
