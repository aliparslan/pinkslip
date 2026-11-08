# Pre-1.4.0 app audit (2026-11-08)

Direction A4 in `research/directions.md`, run through the course's
`emil-prep-for-prod` skill (D11's test). The skill is written for the web, so
each lane was read for its iOS equivalent: `accessibilityLabel` and roles for
`aria-label`, Dynamic Type for zoom, Reanimated's Reduce Motion for
`prefers-reduced-motion`, and so on. It covers `apps/native` only; the website
gets its own pass. No copy was written: the one fix that shows words reuses
the app's existing "This didn't load" state.

## Verdict

**Ship, from the code.** No blockers are open. Six fixes are applied and
committed (`1e9f035`, `5d61eae`, `ad5e3c4`). What's left needs your phone or
your call: the two lists below.

## Findings

### A. Accessibility

| Severity | Before | After | Why | Status |
| --- | --- | --- | --- | --- |
| SHOULD FIX | A company's job rows had no role (`CompanyPage.tsx`, the row's `Pressable`) | `accessibilityRole="button"` | VoiceOver read the text but not that it opens anything | Fixed |
| SHOULD FIX | The live bar's queue rows had no role (`WhileItRuns.tsx` `QueueRow`) | `button` when the row opens something | Same | Fixed |
| POLISH | A swiped row's close area had a label but no role (`SwipeRow.tsx`) | `accessibilityRole="button"` | "Close actions" read as text | Fixed |
| POLISH | The job page's logo and the company's name both opened the company page (`JobIdentity.tsx`) | The logo is skipped by VoiceOver; the name is the link | Two stops for one place | Fixed |

Checked and fine: `IconButton` requires a label; every other raw `Pressable`
has a label or visible text; `Text` caps Dynamic Type at 2× (1.5× for display
type) and tiles cap lower on purpose; the onboarding illustration's text is
fixed size by design.

### B. Performance

Clean from the code: Jobs, Search and Tracker are `FlatList`s, and nothing
logs to the console. Today and a company page render their rows in a scroll
view; Today is short, and a company's list is capped at 100 a listing, so
it's fine for now. Frame rate needs a device (scroll a big company, Apple).

### C. Mobile

Nothing to fix from the code: sign-in, resume and search fields carry the
right keyboard and autofill hints. Safe areas and the keyboard need a device.

### D. Forms

| Severity | Before | After | Why | Status |
| --- | --- | --- | --- | --- |
| SHOULD FIX | `sendCode` had no busy check (`SignInSheet.tsx`) while every other sign-in action did | Returns while a request is out | The keyboard's Go and the button could send two codes; the server only accepts the newest, so the first email's code failed | Fixed |

### E. Stability and states

| Severity | Before | After | Why | Status |
| --- | --- | --- | --- | --- |
| SHOULD FIX | A company page's Jobs, People and Events showed their empty states when the request failed (`CompanyPage.tsx`) | "This didn't load" with Try again, the app's own words | Offline, a company read "No open jobs" | Fixed |

Checked and fine: Today, Tracker, Jobs and Search (one feed), the job page,
the application page, events, Alerts and a send's page each have loading,
empty and failed states.

### F. Motion

Clean. Reanimated's animations follow Reduce Motion by default (none opt out),
React Native's own `Animated` is used once at zero duration, and tab switches
stay still under Reduce Motion.

### G. Theming

Clean from the code. Hard-coded colours outside the kit are only the
onboarding illustration's (deliberate) and one shadow. Reading every screen in
dark mode needs a device.

### H. Content and leftovers

| Severity | Before | After | Why | Status |
| --- | --- | --- | --- | --- |
| POLISH | The old kit gallery (`/you/kit`) opened from a link on any phone | Redirects to You unless the kit is on, like the other kit pages | A tester could land on sample screens | Fixed |

Checked and fine: no `console.log`, `debugger`, TODOs or placeholder text in
the app; `example.com` appears only in kit samples. What's new already has a
1.4 entry.

### I. Marketing

Skipped: the app has no marketing pages. The website's pass is separate.

## Needs a device

1. **VoiceOver** on Jobs, a job page and Tracker: swipe through each and
   check the order (header, chips, rows) and that every row says what it
   opens. The job page should stop once on the company now.
2. **Larger Text at the largest size** (Settings → Accessibility → Display &
   Text Size): a job row, the ticket, Tracker's rows, You. Nothing should clip
   or overlap; the swipe pills are the likeliest to crowd.
3. **Dark mode**, every tab and a job page: read every line.
4. **Increase Contrast** on: the pink buttons should switch to the deeper
   pink.
5. **Reduce Motion** on: open a job from Jobs (the zoom) and land a stamp;
   both should arrive without the movement.
6. **Airplane mode**: Jobs shows the Offline pill; a company page shows "This
   didn't load" on each tab, and Try again works once you're back online.
7. **Signed in, first load of Tracker** (motion fix 4 was never checked
   signed in) and a resume import (fix 6).
8. **Sign in with the keyboard's Go**, then tap the button straight away:
   one email should arrive.
9. **The keyboard** on sign-in, Answers and the resume pages: the field
   you're typing in should stay above it.

## Needs your call

1. **Soon rows in 1.4.0.** Outreach, Plan and Auto-apply read "Soon" on You;
   Follow · Soon on a company page; Pay from: Soon in Your search. Keep them
   as roadmap signals (the rule so far) or hide them for the store build.
2. **Apply for me from a row's long press sends at once**, with no review and
   no undo. It's admin-only today. Before it opens to Pro, it may want the
   Undo toast Hide has, or a confirm.
3. **The other session's zoom and stamps** (`eb8807f`, `f1ba2d6`) are on main
   behind kit switches, on by default, not yet OK'd. They're part of the
   1.4.0 freeze decision.
4. **Swipe actions**: Paper round "Choosing swipe actions · Nov 8" waits for
   your pick before any code.

## Verification

```
$ bun --filter @pinkslip/native check
@pinkslip/native check: Autofill scripts are up to date.
@pinkslip/native check: Resume renderer is up to date.
@pinkslip/native check: Exited with code 0

$ bun test
 1475 pass
 0 fail
Ran 1475 tests across 148 files.
```

## About the course skill (D11)

It worked as a checklist, but every lane assumes a website (meta tags, CSS,
`100vh`, hover), so each check had to be translated by hand, and its fan-out
of four subagents was skipped to save usage. For this app the useful part was
the lane list and the "fix, don't just report" stance; the specific checks
mostly didn't apply. It should pay off more on the website's pass.
