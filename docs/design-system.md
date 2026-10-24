# Pinkslip design system

The living reference for how Pinkslip looks and behaves: open it before
designing any new feature. It covers the October 2026 redesign, iOS first;
the web gets its own pass later and will follow the same roles.

**Where each part lives** (keep all three in step):

| Layer | Home | Holds |
| --- | --- | --- |
| How it looks | Paper, page "System" (file "Pinkslip · Redesign wireframes") | Every role drawn, in light and dark |
| When to use what | This file | The rules, the reasons, the changelog |
| The values | `packages/tokens/src/tokens.ts` (`ui*`, `uiMotion`) | Colors, type, space, radius, sizes, motion |
| The parts | `apps/native/src/ui` | Components built only from the tokens |

**How it changes.** A decision is drawn in Paper and approved by the owner.
Then, in one change: update this file (and its changelog), the tokens and
the kit, and redraw any Paper screen it affects. Nothing ships that the
system doesn't describe. If a feature needs something new, it becomes a
proposal here first (a role, a token, a component), not a one-off.

**Status.** Sections marked *Proposed* are waiting on the owner. Everything
else is decided.

## Principles

1. **Pink means "do this" or "needs you".** That includes a check or switch
   you turn on, since it changes a setting. Never decoration, never a
   heading.
2. **Ink is content.** Text, and chips you switch on to filter what you
   see.
3. **Gray is the quiet default.** Secondary buttons, fields and icon
   buttons, in a see-through gray that works on the page, a card and a
   sheet alike. Chips that are off are outlined.
4. **One pink button per view.** A screen or sheet has at most one filled
   pink action: the thing it exists for.
5. **Paper for objects with meaning.** The ticket, the torn stub and the
   punch card stand for something (a job's facts, an application, an
   allowance). They are not texture for its own sake.
6. **Less text.** No descriptor under every control; labels say what
   happens.

## Color roles

| Role | Token (`ui.color`) | Use for | Never for |
| --- | --- | --- | --- |
| Screen | `bg` | The page behind everything: Mist, #F8F8F9, in light mode | Cards |
| Card | `bg-grouped` | White cards of settings, choice lists | The page, paper objects |
| Paper | `paper` | The ticket and the application stub | Anything else |
| Grouped screen | `screen-grouped` | A settings-style page whose cards are white (Mist, like `bg`) | Ordinary screens |
| Floating | `bg-elev` | The tab bar, toasts, a page's pinned Back, share and ⋯ (all glass on iOS 26), menus | Inline content |
| Sheet | `sheet` | A sheet's own surface: Mist in light, like the page | Anything inside it |
| Sheet group | `sheet-group` | Groups and fields inside a sheet: white in light | The page |
| Control | `fill` | Gray buttons, search, icon buttons; see-through | Groups, fields |
| Outline | `outline` | The 1pt ring of a chip that's off | Card borders |
| Rule | `separator` | Lines between rows and inside the ticket | Borders around cards |
| Text | `ink` | Titles, values, row titles, chips that are on | |
| Secondary text | `ink-2` | Facts, descriptions, sheet body copy, icons at rest | Titles |
| Tertiary text | `ink-3` | Labels, captions, times, counts, placeholders | Anything to act on |
| Strokes | `ink-4` | Empty radios, chevrons, disabled marks | Text, ever |
| Pink | `accent-fill` | The primary button, checks and switches that are on, badges | Text, filter chips |
| On pink | `accent-ink` | Text and icons on pink (white) | Anything else |
| Pink text | `accent` | Needs-you labels, unread dots, tappable text, outline buttons, a done toast's check | Headings, body |
| Pink tint | `accent-soft` | Fields Pinkslip filled in (assisted fill) | Buttons |
| Good | `good` | The Offer stage only | Success toasts, checks |
| Tiles | `tile-find`, `tile-apply`, `tile-pro`, `tile-app`, each with its `-ink` | A settings row's 28 tile, by what the row is for: blue finds jobs, green is what you apply with, pink is Pro and Support Pinkslip (its heart filled, owner 2026-10-22), gray is the app. Dark mode is D2, quieter (owner, 2026-10-14) | Text, anything outside settings rows |
| Glyphs | `glyph-find`, `glyph-apply`, `glyph-pro` | A meaning's icon standing on the page with no tile (onboarding's page two): brighter than the tile inks in dark, a step deeper in light (owner, 2026-10-19) | Tiles, text |
| Stage colors | `stage-assessment` (amber), `stage-interview` (blue) | Those stages' marks | Text, fills, anything else |
| Bad | `bad` | Errors and destructive text | Fills |
| Dim | `scrim` | Behind a sheet | |

**The pink, decided 2026-10-12:**
- **`accent-fill`, #EE5FAC, with white on it.** White text measures
  3.06:1, which is enough for bold and large text, the same range as
  Airbnb's and Lyft's white-on-brand buttons.
- **`accent` (pink text, outlines and dots).** In light mode it's the
  deeper #C82E88 (5.0:1 on white), so pink text passes for all text. In
  dark mode it's the fill pink (6.3:1 on the dark page).
- **Increase Contrast.** With it on, fills use the deeper pink, so white
  text passes 4.5:1. That is what Apple's App Store "Sufficient Contrast"
  label checks.
- **The bar is 3:1 for the pink button's label** (owner, 2026-10-15, after
  the audit measured it): the pink stays, as Robinhood's and Airbnb's
  brand buttons do. Text on the page still aims for 4.5:1, which `ink-3`
  reaches everywhere at L 0.51 (it was 0.53).

## Buttons

| Kind | Looks | When | Examples |
| --- | --- | --- | --- |
| Primary | Pink fill, white label | The one action the view exists for. One per screen or sheet | Apply, Save search, Continue, Open application |
| Secondary | Gray fill, ink label | Every other action that deserves a button | Save, Not yet, Done, Careers site |
| Outline | No fill, pink edge and pink label | A pink action that repeats down a list or sits inside a card, where filled pink would shout | Follow on company rows, Answer in a needs-you card, Approve in admin lists |
| Text | No container, `ink-2` label (`plain`) | Quiet ways out | Not now, Skip, I already applied |
| Text, ink | No container, `ink` label (`text`) | The other answer under a primary, when it's a real choice | Discard changes |
| Icon | Round gray, 36 or 44, `ink-2` icon | Close, back, share, more, the filter button, on the page | Over a scrolling page: `Floating` (below) |
| Floating icon | `Floating`: Liquid Glass on iOS 26, `bg-elev` with the pill shadow before; the page fades out under it (`TopEdgeFade`) | Back, share and ⋯ pinned over a page (job, application, event) | Buttons that sit on the page |
| Destructive | Text button in `bad` | Remove, Withdraw. Confirm in a sheet if it can't be undone | |
| Disabled | Gray fill, `ink-3` label | Any button that can't be used yet | Save search before anything changed |

- **A page you come back to check has no pink button** (owner,
  2026-10-14). The application page's Change stage is gray: changing the
  stage is occasional bookkeeping, and pink on every visit would shout.
  Pink returns when the page needs you (a later round: "How did it go?"
  after an interview's date).
- **No black buttons.** Ink fill means a chip is on, so an ink button would
  read as a filter, and a second loud color would compete with pink.
- **Never fade pink to show disabled.** White on a faded pink is
  unreadable; disabled is gray.
- **Sizes:** 50 tall for full-width actions, 36 for small capsules (Follow),
  labels in Body Medium (17) or Subhead Medium (15) for small ones. Capsule
  padding 16 each side.
- **Icons lead the label, except ↗.** A button that leaves Pinkslip (Sign
  up, Open application) puts its ↗ after the words (`iconAfter`).

## Selection

- **Chips filter what you see,** so they are ink. Off is outlined: clear
  inside, a 1pt `outline` ring, ink text (owner, 2026-10-15). On is ink fill
  with white text. The label is Regular either way, so a chip doesn't
  change width when it's picked (owner, 2026-10-15). A count sits after a
  small gap in `ink-3`.
- **Chips that save to your search are pink** (`Chip tone="pink"`;
  onboarding's questions), as checks and switches are: an answer is a
  setting, not a filter. On is a 1pt `accent` line with an `accent` label,
  clear inside, in both modes (owner, 2026-10-19, Paper "Pink chips,
  refining E", 1; the owner tried E's pink tint in light first and preferred
  no fill). Off is the same outline as any chip. Jobs' filters stay ink.
- **Checks, radios and switches change a setting,** so they are pink. A
  check or radio that's on is a pink circle with a white
  check; one that's off is a 1.75pt `ink-4` ring. A switch that's on has a
  pink track.
  - Checks and switches must match. In Where, a pink switch beside ink
    checks is what looked off.
  - Ink switches don't work in dark mode: the track is near-white and iOS's
    knob is white, so the knob disappears.
- **Segmented controls** (`Segmented`): the chosen segment is a raised
  `seg-on` thumb on a gray track. The track is 40 tall and the thumb sits 4
  inside it, so the thumb is 32, a chip's height (owner, 2026-10-13: 2
  inside looked cramped and was off the 4 scale). A segment can carry its
  count, as chips do (the company page's Jobs).
- **Tab bar:** the selected tab sits in a soft oval with its outline icon
  in pink (see Icons).
- **Which side the selection circle sits** (owner, 2026-10-15): on the
  left in a select mode over a list (Jobs' select, as Mail does); on the
  right in a review list you're trimming before it goes (Apply to 9).
- **Tags aren't chips** (owner, 2026-10-15): skills and other labels you
  can't tap to filter are tags, filled `fill` with `ink-2` text, so a
  filled capsule never means "a chip that's off".

## Text

- **Four inks, no other text colors.** `ink`, `ink-2`, `ink-3` for text;
  `ink-4` only for strokes.
- **Pink text** is for needs-you labels ("2 need you"). Tappable words
  inside rows or sentences (Change, Undo, Pause) are ink (owner,
  2026-10-13). Never for headings or body copy.
- **Type** follows Apple's text styles so it scales with the iPhone's text
  size:

| Style | Size / line | Face |
| --- | --- | --- |
| Large title | 34 / 41 | Founders Grotesk Semibold |
| Title 1 | 28 / 34 | Founders Grotesk Semibold (sheet titles) |
| Title 2 | 22 / 28 | Founders Grotesk Semibold |
| Body | 17 / 22 | Untitled Sans Regular, Medium for row titles and labels on buttons |
| Long text | 17 / 24 | Untitled Sans Regular (descriptions, emails) |
| Subhead | 15 / 20 | Untitled Sans |
| Footnote | 13 / 18 | Untitled Sans |
| Tab label | 10 / 12 | System font |

Hierarchy comes from the inks and the weight, never from extra sizes. Items
on one line share a size.

## Surfaces, depth and shape

- **Three heights:** the screen (`bg`, Mist); white cards on it
  (`bg-grouped`; the card shadow only for paper objects); things that float
  (`bg-elev` with the pill shadow: the tab bar, toasts). Higher is lighter,
  so nothing sits on the page darker than it except a control and the paper
  objects: `paper` is a touch darker than Mist and its shadow lifts it
  (owner, 2026-10-15: kept as it is for now, to revisit).
- **White sits on gray, in sheets too** (owner, 2026-10-15, Paper "Sheets ·
  three ways" A): a sheet is Mist (`sheet`) and its groups and fields are
  white (`sheet-group`), as Apple's grouped sheets are. Gray groups on a
  white sheet read as wells, the opposite of the page. Dark keeps a lighter
  group on a darker sheet. Research: `proof-and-sheets-research-2026-10-15.md`.
- **Rows and feeds sit on the page** (owner, 2026-10-15, after trying five
  page colors on the phone): job rows, Tracker and Today's lists have no
  card. White cards are for settings, as on You. Search is the one darker
  well. Research and contrast numbers: `surfaces-research-2026-10-15.md`.
- **Our own sheets:** float 8 in from the edges with 40 corners. Each step
  is its own card at its own height. A grab bar sits on top; swipe down or
  tap behind to close. A sheet with its own header (a logo, a person, a
  question that came back to you: "Did you apply?", Apply at) has the 36
  close button instead, and no grab bar (owner, 2026-10-15). The queue is a
  glance you swipe away, so it has the grab bar (owner, 2026-10-16). A step opened from the
  first one has a round Back button at the bottom, left of its Done. Long
  lists scroll. They replace the system sheet everywhere.
- **What a sheet holds is a plain menu** (owner, 2026-10-12): rows in a
  flat white card (`sheet-group`), with no lift and no grain. Menu rows
  are 50 tall: the label, then the value in `ink-3`, then a chevron. Paper
  objects (the ticket, the punch card) stay on their pages; a raised card
  on a sheet loses its edge in dark mode.
- **Squares round at a quarter of their side** (owner, 2026-10-15): a 28
  tile at 7, a 40 logo or date tile at 10, a 48 logo at 12, a 56 logo at
  14. `CompanyLogo` and `IconTile` compute it at the build.
- **Corner radius:** 8 for small controls, 12 for cards and lists,
  16 for the ticket, 40 for sheets, fully round for buttons, chips and
  fields. Groups inside a sheet are concentric with it: the sheet's 40 less
  its 20 padding is 20, and the last group's bottom corners follow the
  sheet's bottom (`concentricRadius`, about 27 on current iPhones). Groups
  on a plain page stay 12 (owner, 2026-10-14).
- **Layout:** one column, 4pt spacing (4, 8, 12, 16, 20, 24, 32, 40), 16
  side margins. Rhythm is 4–8 inside an item, 12–16 between items, 24–32
  between sections. Job rows are three 20pt lines (84 tall) with the 40
  logo on the 16 margin. Row text and separators start on the 68 line.
- **Fixed sizes:** button 50 (36 small: Follow, Show, See Pro), list row
  44 or more, chip 32, icon button 44, badge 20, logo 40 in rows and 48 in
  every page header (job, company, event, person), 32 in a card's list (the
  review), 28 two to a slot (stacked), punch hole 24.

## Status, badges and dots

- **Unread:** an 8pt pink dot after the time.
- **Counts that need you:** a pink badge with a white number (the Today
  tab), 20 tall.
- **Stages:** the ring that fills as an application advances. Green only for
  Offer; endings are gray.
- **Applied:** the torn stub (a paper object), not a checkmark.

## Icons

- **One set everywhere:** Phosphor, on iOS and the web
  (`shared/icons.ts`). iOS's own menus carry them too (owner, 2026-10-16,
  Paper "Menus · Oct 16"): template images in the app's asset catalog
  (`ios/Pinkslip/Images.xcassets/menu-*`, drawn at the kit's line), so iOS
  tints them like its own. A long-press menu has an icon on every item; the
  job page's ⋯ puts Save and Hide as icons alone across the top. Every
  action menu (a ⋯) is `GlyphMenu` with an icon per item; a value picker
  (Degree, Appearance, Auto-apply's time) stays the system menu with a
  tick and no icons. A new menu icon needs a native build.
- **The line is proportional to the icon** (owner, 2026-10-15, replacing
  "1.75pt at any size"): 1.75pt at 24, which is 7.3% of the icon. So 1.46
  at 20, 1.31 at 18, 1.17 at 16, 1.02 at 14 and 0.88 at 12. The lit tab is
  2pt at 24 (8.3%), and small checks on pink use that ratio too, so they
  hold up on the colour. In Paper, a Phosphor outline on its 256 grid gets
  a 2.67 stroke in its own colour (5.33 when lit); a centre-line path gets
  18.67 on a 256 box, or 7.3% of whatever its box is. Filled icons for
  saved marks only.
- **Sizes:** 24 in the tab bar, 20 in icon buttons and on 50 buttons'
  labels, 16 in round 36 buttons and on 36 buttons' labels, 18 on a
  settings tile.
- **Chevrons:** 12 in `ink-4` at the end of a row; 11 in `ink-3` only
  where a chevron follows words ("Applied 142 ›"). The up-and-down caret
  for a value that opens the iPhone's menu is two 12 chevrons with a gap
  between them (owner, 2026-10-15: they had sat too close).
- **Color:** `ink-2` at rest, `ink` when primary, white on pink, `ink-4`
  for chevrons.
- **Settings tiles** (`IconTile`, owner 2026-10-14, Paper "You · Oct 14"
  B4): an 18 icon on a 28 tile, radius 7, a faint tint on the white card. The tile's color is the row's meaning, never decoration, and
  rows of one meaning share a card. Copy is our own mark (two squares, the
  same 2.5 corner), drawn in `Icon.tsx` rather than Phosphor's Copy.
- **The bot mark** (owner, 2026-10-14, Paper "Bot icon · options" B2, and
  the System page's Parts): our own icon for "Pinkslip does it for you", on
  Apply for me, Answer for me, the live bar and the Auto-apply row. It's an
  antenna with a ball, a round head and two pill eyes, drawn on Phosphor's
  256 grid at the kit's line. It replaces Phosphor Robot, whose mouth and
  eyes filled in below 20. Every robot on the Approved page is this mark
  now (2026-10-15: four still showed Phosphor's).
- **Staying with Phosphor** (owner, 2026-10-14): Lucide was ruled out as
  overused. When Phosphor's glyph doesn't hold up at our sizes, we draw our
  own on its grid rather than switch packs.
- **The selected tab** keeps its outline icon, in pink (`accent`) at a 2pt
  stroke, on the gray oval; Tracker's end dot fills in (owner, 2026-10-12).
  The tabs are Today, Jobs, Tracker, Search and You (the user circle), 56
  apart; the 64 × 46 oval is wider than that (owner, 2026-10-15).
- **Search** (2026-10-15): the Search tab finds jobs and companies, so
  companies need no search of their own in settings. Jobs' field says
  "Search these jobs" and only narrows your feed.
- **Search is a quick lookup at the bottom** (owner, 2026-10-22, Paper
  "Search at the bottom · Oct 22", A; replacing the field under the title
  of 2026-10-19; research in `search-tab-research-2026-10-22.md`). Picking
  the tab brings up the keyboard; the tab bar steps aside for the field
  and an X, each 44 and floating like the page bar's buttons (`Floating`,
  the X a `PageBarButton` with its 20 `ink` icon), 8 apart on the gutters.
  With the keyboard up they ride 8 above it; down, they sit on the tab
  bar's line. The X goes back to the tab you came from and empties the
  field; the field's own clear button only clears the words. A page opened
  from the results keeps the tab bar, and coming back leaves the keyboard
  down. Rejected the same day: one pill with the X inside (B), which put
  the clear button and the X side by side. Before you type, Recent lists
  your searches with the 18 clock centred in the 40 logo column, so it
  lines up with the company rows and the words start on the 68 line.
- **An empty resume leads with Import a PDF** (2026-10-24), above the
  sections, since importing is the quick way in; once anything is in it,
  "Import a new PDF" sits under the sections.

## Motion

Values live in `uiMotion` (tokens), and the Paper "Motion and icons" page is
the storyboard spec. These were chosen in the Motion lab
(https://claude.ai/artifact/PFVndsQWKHNHfGYocjtFhK).

- **Sheets** move like Vaul's drawer: 500ms on cubic-bezier(0.32, 0.72, 0,
  1) for opening, closing and settling.
  - Between steps, each step is its own card (owner, 2026-10-13, picked in
    the Sheet transitions lab): a step opened from the menu slides in from
    the right at its own height as the menu slides off to the left, both
    in 400ms on the same curve; Back reverses it.
  - A step whose content changes (the menu loading in) eases to its new
    height in 270ms on cubic-bezier(0.25, 1, 0.5, 1), standing on its
    bottom edge.
  - A list hands a downward drag to the sheet only if it was already at its
    top when the drag began, so scrolling back up never closes the sheet.
  - They close past a quarter of their height, or on a flick faster than
    400pt/s.
  - Dragging up stretches like a rubber band.
- **The tab oval** glides on Apple's spring: response 0.4s, damping 1.
  - Press and slide along the bar: the oval follows the finger, and the icon
    under it turns pink with a selection tick. Let go and it settles on the
    nearest tab (or where a flick was heading) and opens it.
- **The stub tears off** on Apply: Peel, with a light rip (owner,
  2026-10-18, picked from four ways tried on the phone; Paper "The stub
  tears off, frame by frame"; `motion.stub`, path in `ui/stub-motion.ts`).
  One continuous path, so nothing stalls where the tear hands over to the
  fall (the first cut did, and felt choppy):
  - It tears from its left end round a hinge at its top right, -4° in
    160ms, speeding up as the holes give, with a rip of nine light taps
    closing up along them.
  - Then it falls behind the job page's pinned bar under gravity
    (5200pt/s²), carrying on at the speed and spin it tore with (the spin
    dies away over 100ms) and shrinking to 96% over 350ms. Its time is the
    distance's, so a ticket high on the page falls a little longer.
  - The Apply button catches it: the bar dips to 97% (90ms) and back
    (200ms) on the strong ease-out, reads Applied, and the success haptic
    plays. A ticket scrolled out of view skips the fall.
  - It waits until the in-app browser and "Did you apply?" have gone.
    Undo runs the same path back at 80% of the time, with a tap as it
    meets the ticket; either way can turn around halfway.
  - Reduce Motion: the stub fades and the button changes.
- **A stamp lands** (`motion.stamp`): a new step's stamp on your stub
  comes down at its own angle, from 112% and clear, in 160ms ease-in (a
  hand pressing down), with a tap as it meets the paper. The one before it
  fades to `ink-3` in 200ms. Only steps that arrive while the page is open.
- **A hole is punched** (`motion.punch`): it sinks to 82% in 90ms and comes
  back in 200ms on the strong ease-out.
- **Small state changes** (owner, 2026-10-24, picked in the kit's Motion lab
  from `motion-opportunities-2026-10-24.md`):
  - A progress bar (`ProgressBar`, the resume import's) grows to each real
    step's share over 600ms on the strong ease-out. It never runs ahead of a
    step and never animates back down.
  - The segmented control's thumb is one view that slides to the tapped
    segment on the tab glide, clamped so it doesn't overshoot. Its first
    place is set, not travelled to.
  - The copy button's glyph turns into the check and back: the leaving one
    shrinks to 60% as it clears and the arriving one grows from 60%, 140ms on
    the strong ease-out. A field appearing shows its icon still.
  - Not taken: the first page of jobs fading in (no visible difference), the
    update notes rising in, and the Offline pill easing in. The swipe settle
    is part of the swipe rework.
- **Swipe actions** move after iOS Mail (owner, 2026-10-24; parts under
  Swipe actions below; `swipe-frame-analysis-2026-10-24.md`):
  - Each pill grows in its slot at the screen's edge as the row uncovers it.
    Its size chases the drag on `motion.swipe.grow` (0.24s), so it eases in
    a beat behind the row, never cut and never pushed out.
  - Past the open point the outer pill stretches toward the row. Past the
    commit point it fills solid to the row's edge, with a tap, and the other
    pill is gone first.
  - Letting go springs from the finger's speed and never overshoots.
  - Hide leaves on that spring and the space starts closing 120ms in.
  - Save, Read and Applied come home in their colour, then run.
- **Onboarding** (`motion.onboarding`; the Onboarding Motion Lab, owner
  2026-10-14; Paper "Onboarding · the build · Oct 18"):
  - The hook's mess lands card by card over 860ms, each gap 0.8 of the one
    before, like things piling up on a desk. Each card falls from 560pt up,
    at 116% and turned 14°, on Apple's spring (response 0.42s, damping 0.7:
    it falls, so it may bounce), with a light tap and a 2pt nudge of the
    pile as it hits. Then the headline and buttons rise 14pt, 90ms apart,
    with no bounce.
  - Leave it to Pinkslip throws the mess off, nearest the button first
    (26ms apart): each card flies away from the button at about 1500pt/s
    under 1400pt/s² of gravity, spinning and growing 12% over 600ms. The
    button grows to fill the screen (response 0.5s, damping 1), paling from
    pink to the page in 300ms; page two takes over 62% of the way.
  - Page two's rows rise 8pt and fade in one at a time, 60ms apart, in
    420ms on the strong ease-out, with a selection tick each; no bounce and
    nothing turned (owner, 2026-10-18: the lab's drop from above needed
    refining). I'm ready slides the page off to the left as Jobs slides in
    from 30% to the right, and the questions rise over it.
  - The feed behind the questions answers every chip at once (owner,
    2026-10-18: "like the artifact"). Its jobs are fetched while the hook
    plays (the search widened to everything first), and each tap narrows
    them on the phone: a job that now fits comes in from 14pt up at 98%,
    28ms after the one above, on Apple's spring (response 0.42s, damping
    0.88); one that doesn't slides 24pt left and fades in 220ms; the rest
    move to their places on the same spring. Each chip ticks. An empty
    question doesn't narrow it; before the first answer it shows
    placeholders.
  - From one question to the next the words slide 40% of the screen and
    fade (response 0.42s, no bounce) as the sheet eases to its new height.
    The answers are saved once, at the end. Then the feed behind moves to
    Jobs' own list for them (the same rows, sections and counts Jobs will
    show), the sheet goes, and the feed fades over Jobs showing the same,
    so nothing reloads: you're simply in Jobs (owner, 2026-10-18).
  - Reduce Motion: the cards fade in where they lie and fade away; the rows
    fade without rising; the feed and the questions change in place.
- **Nothing overshoots.** Bounce is only for a throw that carried momentum,
  as Apple does.
- **Presses** dim to 60%.

## Paper objects

| Object | Means | Where |
| --- | --- | --- |
| Grained ticket with perforated stub | A job's facts: Level and Experience, then Location, then Pay and Visa sponsorship last (owner, 2026-10-19) | Job page |
| Torn stub | You applied | Job page after applying (it falls into the Apply button), your stub on the application |
| Punch card | An allowance (rows of ten, up to 30) | Plan, usage |
| Carbon-copy mark | Pinkslip itself (logo placeholder) | App icon, small marks |

## Before drawing (check every time)

The values are in `packages/tokens/src/tokens.ts` (`uiType`, `uiSpace`,
`uiSize`, `uiRadius`) and the parts in `apps/native/src/ui`. Older Paper
pages are not the spec. Clone parts from the Paper "System" page; when a
part isn't there yet, draw it from the kit's values and add it to that page.

- **The row** (`JobRow.tsx`): three lines, at least 84 tall, growing with
  its content. The 40 logo (radius 10) sits on the 16 margin; text and
  separators start on the 68 line. Nothing sits in the left gutter.
  - **On Jobs** the lines are all Subhead (15/20). Company and title are
    Medium until opened, then Regular; the facts line is `ink-2`; the age is
    `ink-3` (`ink` while unread). One 8pt pink dot follows the age.
  - **On Today** (owner, 2026-10-13) line two is the headline: Body 17/22
    Medium `ink`, the thing to do or the news ("Reply to the offer",
    "Mercury interview"). Lines one and three are Subhead Regular `ink-2`,
    and the age is `ink-3`. Nothing is bold for being new. Only Needs-you
    rows carry the pink dot. Built as `JobRow headline="news"` with
    `needsYou` for the dot (first used by Job emails, 2026-10-14).
  - **On Tracker** (owner, 2026-10-13, TR2b) line one is the headline: the
    company in Body 17/22 Medium `ink`, since the stage headers already say
    where it stands and most titles read "Software Engineer, New Grad".
    The role and the latest news are Subhead Regular `ink-2`. The time is
    Subhead `ink-3` on the company's baseline: minutes or hours within a
    day, then the date ("Oct 11"). No dots, and nothing changes for being
    new; Today carries the news. Built as `JobRow headline="company"`.
  - **Tracker's line three, today** (TR2c): the location; past Applied,
    the location and when you applied ("New York · applied Oct 2"); an
    ending says only how it ended (Rejected, Withdrawn, Ghosted). The goal
    is the next thing that happens, from email and auto-apply (Paper
    "Tracker · the goal").
  - **One headline line at most:** Body 17 Medium `ink`; everything else in
    the row is Subhead 15, and times are `ink-3`.
  - **Several companies in one row** (auto-apply's results): two logos
    stacked in the 40 slot, the second 12 down and right with a 2pt ring in
    the page colour. Never a number in the logo slot.
- **Section header** (`SectionHeader`): Footnote Medium `ink-2`, then the
  count in Footnote `ink-3` after a 6 gap, the way chips and segments carry
  theirs (owner, 2026-10-13), on every screen; never at the far right.
  Pink only for Needs you. 24 above a header that follows a list, 16 when
  it's the first thing under the title or chips, 4 below (owner,
  2026-10-15).
  Tracker's stage headers lead with the stage mark and open their stage,
  with a chevron after the count ("Applied 142 ›"); All shows each stage's
  latest three (owner, 2026-10-13: a "See all" row looked strange).
- **Stage marks** (`StageMark.tsx`): Saved is the bookmark, since saving
  isn't a stage. The ring fills as a stage advances and is drawn at the
  kit's line like every icon, 14 beside small text and 20 in a sheet
  (beside the 24 check).
  - **Color only where something's happening** (owner, 2026-10-14):
    Assessment amber, Interviewing blue, Offer `good`. Saved, Applied and
    the endings are grey, so most rows stay calm. Color is on the mark only,
    never text or fills; pink stays the one "needs you" color. Linear colors
    every state; ours did that and the violet fought the pink check.
  - **Endings each have their own mark,** grey: Rejected is the ring with
    an ✕, Withdrawn the ring with an arrow back, Ghosted (was "No reply")
    Phosphor's ghost. Tracker's Closed group keeps the ring with a dash.
- **Sign in** (`ui/SignIn.tsx`, `SignInSheet.tsx`; Paper "Sign in · Oct 15",
  S1 approved as K1; built 2026-10-18): one sheet over the page you were on,
  opened with `openSignIn()` (You's guest card, the welcome's "I have an
  account", Account as a guest). The ways in are 50 capsules 12 apart, each
  leading with its own mark as tall as the label (Apple's at 18, whose glyph
  stands 16; Google's G, which fills its square, at 16) and the label in
  Body Medium: Apple black
  (white in dark mode) with Apple's logo, Google `sheet-group` with a 1pt
  `outline` and Google's own "G" (an image from Google's 2026 kit, which
  react-native-svg can't draw), email on `fill`. Email is S2 then S4: the
  field is white at the sheet group's radius with its label always above,
  and the code is six 60-tall boxes 9 apart (the next one ringed
  `accent-fill` with its caret), filled from Mail. What goes wrong is one
  `bad` line: under the title (Apple or Google didn't finish), under the
  field, or under the boxes, whose rings turn `bad`; an expired code greys
  the digits and offers "Send a new code" in pink. Under the ways in, S1's
  Footnote `ink-3` line, centred: "By continuing you agree to the Terms and
  Privacy Policy.", each opening its page in the in-app browser (Terms at
  `/terms` since 2026-10-23). The two links keep the line's colour and are
  underlined, as links in a job's description are, and the line is set as
  two centred lines with the links together on the second, 24 in from the
  sheet's sides (2026-10-24: one full-width line looked crammed).
  - **Code first** (owner, 2026-10-19, Paper "Sign in, code first · Oct
    19"): the email step's pink is "Send me a code", with "Use my password"
    under it. The code step keeps the email step's shape: Back and a grey
    "Send it again" (A), which turns pink as "Send a new code" when the code
    expires. After a code, an account with no password gets "Make a
    password" (Save password or Not now); "Forgot it? Email me a code" ends
    there as "Make a new password". A wrong password never says which part
    was wrong ("That email and password don't match."); too many tries makes
    the pink "Email me a code". "This email uses Apple" is gone.
  - **When it asks:** a guest's first save, once per phone ("Keep your
    saved jobs", one line why, Not now under the ways in). There is no
    separate ask for keeping a search (owner). After the first sign-in on a
    phone, if new-job alerts aren't reaching it, "Be first to apply" shows
    the Alerts page's own preview (`AlertPreview`: the app icon, "3 new
    jobs") with Turn on alerts and Not now.
- **Sheet or page** (owner, 2026-10-15): a sheet is for a quick choice or
  form that drops you back where you were (sign in, report, edit search,
  pick a plan, change stage, What's new). Anything you read, come back to
  or share is a page (a job, an application, a company, an event).
- **Update notes** (owner, 2026-10-23, Paper "Update note · Oct 23", A;
  `whats-new.tsx` and `update-notes.ts`): an over-the-air update that
  changes something you'd notice says so once, at the launch it arrives:
  the "New in 1.4" sheet without its title, its notes in the one white
  group (icon tile, Medium title, an `ink-2` line only if the title needs
  one), then the grey Got it. A title-only note is Regular and centred on
  its tile (owner, 2026-10-24: Medium read too heavy, and the tile sat
  high).
  Any number of notes; the group scrolls when they outgrow the sheet. Fixes
  stay silent, a new install sees none, a phone that missed several sees
  the newest set, and a big release's sheet wins the launch. The notes then
  lead their release in You's What's new. Each line is the owner's to
  approve. Rejected: a card over the tab bar (B, where toasts go) and a
  centred card (C, a pattern the app doesn't use).
- **Empty and error states** (`EmptyState.tsx`, Paper "Parts · Empty
  state"): Title 2, one Body line in `ink-2`, the button under it on the
  same centre line, all centred in the room under the header. The slips
  show only when a list is empty, not when it failed to load; a retry is
  the grey button.
  - **Errors** (owner, 2026-10-15, Paper "Errors · Oct 15" and "Part ·
    Errors"): only a screen with nothing on it becomes an error screen; the
    title says what happened (offline, Pinkslip down, the thing is gone).
    A retry is grey, a way somewhere else is pink. Offline with no data
    has no button: it loads when the connection is back.
  - **Rare ones get a stamped slip** (a job that closed shows its own
    ticket stamped CLOSED; a broken link, Pinkslip down and a version too
    old get a blank slip): `paper`, radius 16, 16 padding, tilted a few
    degrees; the stamp is Founders Mono 18/22 over 12/16, a 2pt `ink`
    border, radius 8, at 88%. One dry line at most. Common errors, fields
    and toasts stay plain.
  - **With things already on screen, keep them** and say only what failed,
    where: offline is a small Offline pill (`fill`, 28 tall, Footnote
    Medium `ink-2`) beside the large title; a failed refresh is the error
    toast; a failed next page is "Couldn't load more" (`ink-3`) and "Try
    again" (`ink` Medium) at the list's end; a sheet that didn't load says
    so in the sheet with a grey Try again. Never a toast and an error screen
    for the same problem.
  - **A one-tap action that fails** (Save, hide, move) undoes itself and
    the toast says "Couldn't …" with Try again. Offline, those taps just
    work and sync later, silently. Typed text is never lost: a send that
    fails keeps the words and puts one `bad` Footnote line above the button.
  - **A field in a card that's wrong:** its label turns `bad`, one `bad`
    Footnote line goes under the value inside the row, and the fix follows
    in `ink` Medium when there is one ("Use …/in/jordanlee"). A standalone
    field keeps the sign-in ring.
  - **Words:** what happened, then the fix. Never "we" or "us" (Pinkslip is
    one person), "invalid", "sorry", "please", "oops" or codes. Reassure
    when things might look lost ("Your applications are safe").
- **Loading** (Paper "Loading · Oct 15", L1): the screen's own parts show
  at once; what's still coming is grey (`fill`) in its real shape, pulsing
  softly, after a second of nothing. A list is `RowPlaceholders` in its
  rows' shape (`lines`, `logo`: a company's jobs are two lines with no
  logo, hidden companies a logo and a name); settings are
  `GroupPlaceholders`, their white cards with a grey bar per row (Alerts;
  Paper "Consistency · Oct 19", C3b). A spinner is only for a single
  thing on its way (a posting's text, a button's own wait).
- **Words for empty and not yet** (owner, 2026-10-19): a list that fills
  over time says "Nothing yet" (Today, Tracker, Job emails). Something not
  built yet is "Soon" as a row's value; its wrench page is titled by what's
  coming ("Tailoring is coming", "Answers are coming", "Pro is coming").
- **Your stub** (`Stub` in `Ticket.tsx`, owner 2026-10-14): the ticket's
  torn-off stub on an application's page. Its top is the tear's other half;
  each step is a rubber stamp (Founders Grotesk Mono caps: the step in
  Medium 13/16, the date in Regular 11/14, both 0.06em; a 1.5 frame,
  radius 6, drawn as a line (`StampFrame`) so it stays smooth at its own
  angle), the newest in `ink` and older ones `ink-3`;
  email steps add "· EMAIL" and the foot offers "Not right?". The Mono is
  the trial cut for now; the owner buys it with the other Klim licences
  before release (2026-10-14).
- **Pay by place** (owner, 2026-10-19, Paper "Pay by place · Oct 19"): the
  ticket's Pay is the range for the place on its Location line. When a
  posting names the places each range covers, the Locations sheet groups
  places under their pay (P2: the range as a Footnote Medium `ink-2` label
  above each card); when it names only zones, the places stay as they are
  and a "Pay" card lists each zone with its pay as the row's value (P1), and
  the ticket shows the whole spread.
- **Fixing a step's date** (owner, 2026-10-19, Paper "Step dates · Oct
  19"): tap a stamp on your stub. The sheet asks the step's own question
  ("When did you apply?", "When did it arrive?"), adds which email it came
  from for an email's step ("The assessment, from Mercury's email"), and
  shows iOS's calendar up to today, with Save. A step is never dated ahead.
- **Copy field** (`CopyField.tsx`, Paper "Parts · Copy field", owner
  2026-10-14): a value to paste somewhere else, white (`sheet-group`) at
  the sheet group radius. Copy is our two soft squares (copy D) in a 36
  round button on `fill`, 10 in from the field's edges; after a tap it's a check
  for 1.5s, with a light tap. `line` (an address, Founders 17) and `code`
  (Gmail's code, Founders 40) put it right of the value, centred; `block`
  (a filter, Footnote `ink-2`) puts it in the top right corner. Tapping the
  value copies too. A row that copies (the status page's address) shows a
  16 copy mark after its value instead (`ListItem trailing`).
- **Page actions are pinned** (owner, 2026-10-14): a page's action
  button (Add experience, Send) sits in a bar pinned to the bottom, on
  `bg` with the home indicator's room below, as the job page's Apply does.
  The line above it shows only once content scrolls under the bar (owner:
  not on a page that fits). The tab bar steps aside on those pages.
- **No tab names** (owner, 2026-10-15, after living with L2): the lit tab
  is a 64 oval around its pink icon; the others stay 56 icons. The oval
  grows and shrinks on the tab spring. Names are for VoiceOver only.
- **Tab bar on scroll** (owner, 2026-10-14): scrolling a list down shrinks
  the pill to 84% towards the bottom edge; scrolling up, reaching the top,
  touching the bar or changing tabs brings it back, on the tab bar's
  no-bounce spring. Lists under the bar spread `useTabBarScroll()`.
- **Toast** (`ui/Toast.tsx`, Paper "Toast · Oct 14" T1, owner 2026-10-14):
  a 48 capsule in the tab bar's glass, hugging its words, 12 above whatever
  is pinned at the bottom (the tab bar, a page's bar, the keyboard). It
  leads with the action's icon in `ink-2`, a pink check, the `bad` mark,
  or a filled pink heart after a tip;
  Undo (the U-turn arrow) and Try again are 32 round icons on `pill`, with a
  2pt `ink-3` ring running down the time left. Three stack, 8 and 16 behind
  at 95% and 90%; tap to spread, swipe one down or aside to clear it; the
  clock stops while it's touched or spread. It says only what the screen
  can't: something left the screen, it happened elsewhere, or it didn't
  work. Liquid Glass can't fade with a parent, so the glass materializes
  and dissolves on its own.
- **Swipe actions** (`SwipeRow`; owner, 2026-10-24, after iOS Mail,
  replacing S4's circles):
  - Up to two pills a side, 44 tall, each sized to its 18 icon and Subhead
    Medium label inline: 14 padding, at least 72 wide, 8 apart and 8 from
    the screen's edge.
  - They're tinted by meaning (the ink at 14%), with the icon and label in
    the tone's ink. The outer one fills solid once a full swipe arms.
  - A short swipe stays open on them; all the way runs the outer one.
  - The row being swiped is a card: corners round to 22 and it takes the
    separator's grey. `JobRow` drops its own background inside one.
- **Dashed outlines** mean "add" or "not set yet" (an Add chip, the empty
  date tile): 1.5 stroke in `ink-4`, 5 on and 4 off, round ends.
- **Settings cards** (`ListGroup surface="fill"`, which now draws
  `bg-grouped`): a white card, radius 12, on the Mist page; inside a sheet
  the group is `sheet-group`, white on the sheet's Mist. These are settings, drawn like the
  sheet's menu rows (Paper "You · Oct 14"): rows 50 tall, values `ink-3`,
  12 chevrons in `ink-4`, details in Footnote, radio titles Regular, lines
  inset 16 on both sides, and the card's label 4 above it, lined up with
  the rows' content 16 in (owner, 2026-10-14; it sat on the card's edge
  before, and `ListGroup`'s `headerOnEdge` still does until the build). A row whose value opens the iPhone's menu in place (Appearance) ends
  in the up-and-down caret (`accessory="pick"`); a row that deletes is
  `destructive` red.
- **Date tile** (`DateTile.tsx`; Coming up rows, an application's Next row;
  `EmptyDateTile` is the dashed one for a date not set yet): 40 square, radius 10, `fill`, in the logo
  slot, so it matches the logos (owner, 2026-10-13). The month in caps
  (Founders Semibold 11/12, 0.08em, `ink-3`) over the day (Founders
  Semibold 20/20, `ink`). Like logo initials, it's exempt from the type
  scale. The weekday goes on line one of the row and the time trails it.
- **Needs you lives on Today only.** Tracker has no Needs-you chip or
  section; the Today tab's badge carries the count.
- **Tracker order:** chips and groups run Saved, Applied, Assessment,
  Interviewing, Offer, Closed, the way an application moves (owner,
  2026-10-13; closest-to-an-offer first had put Saved near the bottom).
- **Large title:** 8 under the 44 nav row on every tab, so titles line up
  across tabs. A date eyebrow sits inside the nav row, not above the title.
- **A tab's top** (owner, 2026-10-19, Paper "Consistency · Oct 19", C7b):
  rows scrolled up go soft under a blur behind the clock (`TopEdgeBlur`:
  iOS's thin material, solid through the status bar, gone 32 under it), as
  iOS 26 does at a scroll edge. A flat band of the page colour was harsh.
  Like iOS's, it shows only once the list has scrolled past 8 (the mostly
  empty nav row), fading in over `uiMotion.topEdge` (200ms), so a tab at
  rest has nothing behind the clock; the material reaches 24 past the
  screen's edges, where it would otherwise lighten. A tab root makes it
  with `useTopEdge()`, passed to `useTabBarScroll`. Nothing at the bottom;
  the tab bar floats on its own.
- **A pushed page's top** (`ui/PageBar.tsx`; owner, 2026-10-19, option A in
  `consistency-audit-2026-10-19.md`): Back on the left and the page's
  actions on the right, pinned, each on `Floating` glass over a
  `TopEdgeFade`. The page's title (Title 1, or a job's identity) sits 8
  under Back and scrolls away; the bar has no title of its own. Every pushed
  page uses it: You's pages (`YouPage`), the job, application, event,
  company and person pages, email tracking, the kit's pages, and their
  loading and error states. iOS's own bar isn't used.
- **Cards:** radius 12 (`bg-grouped`). Only the ticket is 16, on `paper`.
- **Tappable words inside rows and cards** (Pause, Change, See all,
  All 142) are `ink` Medium; pink stays for Needs you (owner, 2026-10-13).
  Chevrons are `ink-4`.
- **Badge** (`Badge.tsx`): 20 tall, Footnote Medium, white on pink.
- **Chips** (`Chip.tsx`): 32 tall, Subhead, 16 each side, outlined when
  off; a count is `ink-3` after a 6 gap. `tone="pink"` for chips that save
  to your search (Selection, above).
- **Progress:** one solid bar, as on the Live Activity (owner, 2026-10-14:
  no segments, no green beside the pink).
- **Spacing:** only 4, 8, 12, 16, 20, 24, 32, 40. 24–32 between sections.
- **Emphasis** comes from the four inks and Medium, and from the one
  headline line a row has.
- **Copy, don't redraw** (owner, 2026-10-15): before drawing anything,
  find the approved screen or part that does the same job (the Paper
  "Approved" page, then the System page) and clone it. Draw new only when
  nothing does, and add it here. When one copy changes, change the others.
- **"Did you …?" after leaving the app** (`DidYouApply`, Paper "Apply 2";
  "Did you send it?" on Outreach): a sheet with the question in Title 1,
  one Subhead `ink-2` line, the 36 close button, then the pink yes ("Yes,
  I applied") and the gray secondary "Not yet", 8 apart. No grab bar.
- **A Pro-only choice on Free** (owner, 2026-10-15): "Pro" in `ink-3`
  takes the place of the radio or check, on the row's line; nothing
  under the title.
- **A value with no chevron keeps the chevron's 12 space** (owner,
  2026-10-15), so values line up down a card (Auto-apply's "Soon", "How
  many"). `ListItem` doesn't yet; fix it at the build.
- **Settings pages:** two groups where possible, and no detail lines
  under row titles; if a row needs one, reword its title (owner,
  2026-10-15, on Alerts).
- **People** (Outreach): a round 40 avatar of initials (Founders 15
  `ink-2` on `fill`), where companies have square logos.
- **The sample person** (owner, 2026-10-15): one Jordan Lee everywhere, a
  recent grad with a personal address (jordan@lee.dev), searching New grad
  and Early career ("New grad +1"). No school email, no "Interns" search.
  Career stages list Internships last. These screens become the App Store
  screenshots.
- **Times:** within a day, "9h"; after that, "Oct 12". Future events keep
  their clock time.

After drawing, screenshot each artboard and check it against this list
before showing it.

## A new feature, step by step

1. **Name the view's one job.** That's its only pink button, if any.
2. **Build from the roles.**
   - Surfaces from the three heights.
   - Text from the four inks.
   - Selection in ink.
   - Secondary actions in gray.
   - Repeated pink actions outlined.
3. **Use existing parts first.** These are rows, the ticket, sheets,
   choices, chips, buttons and the tab bar. If one almost fits, extend it
   and note it here.
4. **Draw it in Paper, light and dark.** Get approval, then build.
5. **Anything new** (a color, a size, a component, a motion) is proposed in
   this file and drawn on the System page before it is used.

## Token audit (done, 2026-10-12)

The redesign's colors grew while we explored. Repeats and unused colors were
cut so that each remaining one has a job.

- **In code, `ui.color` went from 27 colors to 22:**
  - `badge-ink` merged into `accent-ink` (both white).
  - `track` merged into `fill`.
  - `glass`, `bar` and `accent-soft-ink` were cut, being unused. The tab
    bar draws real glass, or `bg-elev` before iOS 26.
  - Kept, each with a job: `pill` (the see-through tab oval), `seg-on` (the
    segmented thumb), `screen-grouped` (settings-style pages) and
    `accent-soft` (fields assisted fill filled in).
- **In Paper:**
  - Take B was archived as images in `docs/port-design/take-b-archive/`,
    and its 13 `--b-*` colors were cut.
  - Bar, track, pink-tint text, badge ink and the 12pt caption were cut,
    with their dark twins, after their uses were moved to page background,
    gray fill, pink text, white and footnote.
  - `--color-glass` stays in Paper only, as the drawing stand-in for iOS's
    own glass (notifications, menus). The app has no token for it.
- **Fixed in Paper:**
  - `--font-sans` is now Untitled Sans, and `--font-display` (Founders) was
    added.
  - `--spacing-keyline` is 68. 20 and 40 joined the spacing scale.
  - The type tokens follow Apple's names: `--text-large-title`,
    `--text-title-1` (new, 28) and `--text-title-2`.
- **Mist in Paper (2026-10-15):** the light tokens match `tokens.ts`:
  `--a-bg` Mist #F8F8F9, `--a-grouped` white, `--color-screen-grouped` the
  page, and see-through `--a-fill` and `--a-line`. `--color-paper` and
  `--color-outline` (with `--ad-outline`) were added. Every ticket and stub
  ("Facts", "Facts · torn", "Your stub") was moved onto `--color-paper`.
  The three surface comparison boards on "Apply flow · Oct 14" keep their
  old colors as literals, so they still show what was compared.
- **Not part of this audit:** the web's older palette (`packages/tokens`
  `base`/`dark`/`light`, the `--color-*` CSS the live web uses) stays until
  the web's own redesign.

## Open decisions

- None right now. The application page was decided as C, your stub
  stamped with each step (Paper "Application page · ideas · Oct 13"), and
  is built.

## Changelog

- **2026-10-16**
  - Built (see `redesign-wireframes.md`, "The build"): the kit's form parts
    (`ui/Form.tsx`: a white field group, labels that sit in place until you
    type, the month wheel in place, bullet rows, a red row in its own card),
    the stamped slip (`ui/StampedSlip.tsx`), placeholder rows
    (`ui/RowPlaceholders.tsx`), the bot mark and the wider caret in
    `Icon.tsx`, proportional icon lines, 20pt icons on 50 buttons.
  - Sheets rise with the keyboard. A sheet step can drop its grab bar for a
    close button (Q7). A page's pinned action rises with the keyboard too,
    and the tab bar steps aside for it.
  - Later (owner's review): the tab oval glides and follows the finger
    again; a toast drags one way only; the queue has a grab bar; a paused
    bar shows play. Menus carry Phosphor icons (`ui/GlyphMenu.tsx`, Paper
    "Menus · Oct 16"). Admin moves to this kit (Paper "Admin · Oct 16"):
    Home is Needs you with verbs, the Inbox is three swipeable lists with
    one entry per page, Jev is one comparison at a time, Runs, Sources and
    Product health lead with numbers. Kit additions for it: `ListItem
    headline` (a Medium verb over an `ink-2` line), `ListGroup` `count`
    and `needsYou`, `JobRow` `factsBad` and `quiet`, and a top-bar
    `action` on You's pages. The owner wants fewer numbers and more
    visuals in Admin later, once the chart libraries are looked at.
  - While the backend session runs: the stub's proof for applications
    Pinkslip sent (Paper 6.1, 6.2): `StubStamp` `pending` (dashed, `ink-3`)
    for SENT until the board or the company's email confirms it, then
    APPLIED with "Confirmed / by Stripe's email, 9:58 AM"; the foot says
    "Sent by Pinkslip · via Greenhouse" and "What it sent ›" (`Stub`
    `action.opens`). Samples only until sends are recorded. The Search
    tab's field moved to the bottom (Search, above).
  - Admin's Recruiters on this kit (Paper "Admin · Oct 16", note 7, not
    drawn): Jev's pattern, one person at a time with "1 of N", what the
    search made of them as label rows, Open in LinkedIn, and the two
    questions pinned as `Segmented` controls (which now take no answer
    yet); both answered brings the next person. Home's "Label N
    recruiters" counts the same queue.
  - The Apply button, every state (Paper board 1): `ui/ApplyButton.tsx`
    is the job page's one button. Apply, Apply for me (a split capsule;
    its caret's menu ticks Apply for me and holds Apply myself), Queued,
    Applying (the capsule fills in `accent-soft` as the form does),
    Answer N questions, Sent · waiting, Applied, and on later visits the
    stage with "View in Tracker". Pink only when the move is yours; Save
    only beside Apply and Apply for me. It morphs between states: the
    capsule springs to its new width on `tab.glide`, its colour eases,
    the words cross-fade. Live today: Apply, Applied and the later stage;
    the rest wait on auto-apply. Icons `split` (CaretDown) and `waiting`
    (Clock); menus gain `menu-bot` (a native build) and a ticked choice
    (`GlyphMenuItem.on`).
  - The in-app browser and fill bar (Paper board 2): a page sheet with ✕,
    "Apply at Stripe" over the lock and the board's host, and ⋯ (Fill
    again, Open in Safari); a 2pt pink line while a page loads. The fill
    bar is a glass capsule 16 in from the edges: "Filling the form · 4 of
    5" with a spinner; "5 of 7 filled" with "2 need you" in pink, arrows
    to each blank and Done; "All 7 filled · Submit is at the bottom" with
    a pink Go to Submit that scrolls to the board's button and rings it,
    never pressing it. On the page, what Pinkslip filled is `accent-soft`
    and what needs you is ringed in `accent`. While you type, the bar
    steps aside for iOS's own form bar. The board's confirmation page
    marks it applied with the toast "Applied to Stripe. It's in Tracker."
    and Undo; a pressed Submit with no confirmation after 6 seconds asks
    "Did that go through?" with a pink "I applied"; closing with neither
    asks "Did you apply?". Not built: 2.3's saved answers above the
    keyboard. The kit opens it on a local form the real loop fills.
  - Dark mode, checked on everything built this week (Admin and
    Recruiters, the menus, the stub's SENT and APPLIED, the Search bar,
    the Apply states, the browser, the toast, Today's applying bar). Two
    fixes, both where a light web page sits under our chrome: the page's
    marks always use the light theme's pinks (the board's page is light
    whatever the app is), and glass over it, the fill bar's and the
    toast's, keeps the app's scheme and is tinted `bg-elev` in dark, since
    Liquid Glass otherwise lightens over a white page under the dark
    theme's words.
- **2026-10-17**
  - The in-app browser on a live Greenhouse form (owner: the pink was too
    bright and squared, the bar vanished after the first fills, the arrows,
    ✕ and ⋯ read thin). Fixed: marks go on the box you see, not the element
    the filler stamped (a dropdown's is a hidden 5pt input, which showed as
    a pink sliver); filled is the light accent at 7% instead of
    `accent-soft`; what needs you is an inset 2pt ring (React-Select forces
    outline off), so both follow the field's corners; a hidden resume
    input rings its Attach button. The bar steps aside only while iOS's
    keyboard is really up (filling a dropdown and the arrows focus fields
    with no keyboard). The browser is a sheet, so ✕, ⋯ (22, ink), the arrows
    and Go to Submit's caret take the sheet's 2pt line. Greenhouse's
    reCAPTCHA badge moves above the bar. Apply's sheet names the PDF kept on
    this iPhone (what gets attached), or "Add your PDF".
- **2026-10-18**
  - The job and application page header tops the 48 logo with the company
    name instead of centring it on company and title together, so a title
    on two lines grows downward and the logo stays with the name (owner).
    Paper's headers on the Approved page follow.
  - Paper caught up with the code: board 2's filled fields are the 7% pink
    on the board's own gray border, its ✕, ⋯ (22), arrows and Go to
    Submit's caret take the sheet's 2pt line, and the Search tab's folded
    circle and field are 56.
  - The answers strip (board 2, 2.3): while you type in a blank, "From
    your answers" sits above the keyboard with your newest saved answer
    of the same kind of question (why this company, why this role, a
    project, anything else; otherwise one whose question shares most of
    its words). Tapping it drops the answer in as written, cursor still
    there to edit; nothing is rewritten. Beside it, Answer for me with
    the bot and "Soon", a roadmap signal until Pro writes answers.
  - The stub tear (owner, Paper "Motion and icons", The stub tears off,
    frame by frame): the job page hides the tab bar for its own Save and
    Apply bar, so the stub drops into the Apply button rather than the
    Tracker tab, and Tracker gets no count. It tears from its left end
    (a light tap), falls behind the bar, and the button dips and reads
    Applied (success). Undo runs it backwards. It waits for the in-app
    browser and "Did you apply?" to be gone, so you see it.
  - A new step's stamp on your stub comes down onto the paper with a tap;
    the stamp before it fades to `ink-3` (owner).
  - The punch card's hole comes back to size without springing past it,
    as nothing overshoots (owner).
  - Later the same day: the owner found the tear's hand-off from tear to
    fall choppy and wanted a ripping haptic. It became one continuous
    path; of four ways (Peel, Snap, Flutter, Swing) and three rips (ticks,
    light, rigid) tried on the phone, the owner picked Peel with light.
  - A new stamp lands once its sheet has gone, after the date it asks for,
    not behind the sheet (owner).
  - Stamps' frames are drawn, not bordered (owner, Paper "Stamp ink", A
    of five): a turned view's own border is stair-stepped on iOS. The
    owner preferred the smooth line to inked specks or a hand-cut wobble,
    as the cleanest and least busy. The error slips' stamps use it too.
  - Onboarding, the build (Paper "Onboarding · the build · Oct 18"): the
    hook reads "Job hunting shouldn't be another job." at Title 1 so it
    stays on two lines, with Leave it to Pinkslip. Page two is "What
    Pinkslip handles": six rows straight on the page, each the kit's icon
    at 24 in its meaning's ink (blue finds, green applies, pink Pro), no
    tile, since the pale tiles vanish on the page (owner: the first icons
    weren't ours; rows on the page, not in a card). I'm ready replaces
    Let's go, which says "us". The three questions (career stage, roles,
    where) are chips, each step with "1 of 3" over its title and Back
    beside Continue, in a sheet that leaves Jobs bright behind it and can't
    be swiped away. Chips, not Your search's menu rows: the rows made the
    sheet cover the feed, and seeing it fill in is the point of the sheet
    (owner). Each answer is saved a moment after a tap, so the jobs behind
    change as you pick. The last button is Show my jobs.
- **2026-10-19**
  - Page two's icons get their own colours, `glyph-find`, `glyph-apply`
    and `glyph-pro` (owner, Paper "Page two icons and filled chips · Oct
    19", B of three): the tile inks were quieted to sit on a tile, so
    standing alone in dark they read dim, and a touch thin in light. Same
    1.5pt line; the 2pt option wasn't needed.
  - Onboarding's question chips are pink when on, since each answer is
    saved to your search (owner, Paper "Pink chips, refining E · Oct 19"):
    1, a pink line and pink label with no fill, in both modes (E's pink
    tint was tried in light first). The owner found the solid ink chip harsh
    with several on; the board also tried heavier lines, berry and ink
    labels, softer, rose and magenta pinks, a pastel fill, and Linear's way
    (a grey fill, colour only in small marks). Jobs' filters stay ink.
- **2026-10-19 (night)**
  - Pay by place built (see the rule above): every Greenhouse range is kept
    with its zone or places (`jobs.pay_ranges`, migration 0101), the ticket
    shows the pay for its place, and the Locations sheet groups by pay.
- **2026-10-19 (evening)**
  - Sign-in, code first, built (see Sign in): A on the code step, M1 on a
    guest's first save, S5 after the first sign-in, and "Make a password"
    after a code (`POST /auth/password`, within 15 minutes of the code).
  - Fixing a step's date by tapping its stamp, built.
  - A link the app has no page for shows W4's slip (`app/+not-found.tsx`).
- **2026-10-19 (later)**
  - The Search tab's field moved from the bottom (where the tab bar folded
    round it) to under the title, like Jobs'; the tab bar no longer
    changes on Search (owner).
  - Consistency pass (`consistency-audit-2026-10-19.md`, owner: Search's
    header stuck, the job page's buttons were see-through, headers
    differ). Fixed to rules already here: Search's title scrolls with its
    page; Jobs' and Search's titles sit under the 44 nav row like every
    tab's; the job, application and event pages' pinned Back, share and ⋯
    are `Floating` (glass) over a `TopEdgeFade`, since the grey `fill` let
    the page show through.
  - The owner picked option A for every pushed page's top: the kit's
    `PageBar` (Back and actions pinned in glass over the fade, the title in
    the page, no title in the bar). You's pages keep their look with Back
    staying put; the company page, a person, email tracking, the kit's
    pages and the job and application pages while loading leave iOS's bar
    for it.
  - The audit's other findings, to rules already here: a person's ⋯ is a
    `GlyphMenu` (They replied with the open envelope, Don't follow up with
    the ✕); a company's jobs and events, a job's emails and hidden companies
    load as placeholder rows in their own shape, not a spinner
    (`RowPlaceholders` gains `lines` and `logo`); Admin's Add and Edit source
    are Pinkslip's sheet (`admin/SourceSheet.tsx`). Every screen imports
    `toast` from `ui`. Drawn for the owner (Paper "Consistency · Oct 19"):
    Locations in our sheet (C1), Alerts loading as its cards (C3b), and a
    fade behind the clock on scrolled tabs (C7).
  - The owner approved them, built the same day: a job's Locations is
    Pinkslip's sheet; the ticket reads Level | Experience, Location, Pay |
    Visa sponsorship (owner: visa last); Alerts loads as `GroupPlaceholders`;
    every tab's top is `TopEdgeBlur` (C7b, redrawn from a flat fade to a
    heavy blur at the owner's ask; top only), shown once a list scrolls
    under the clock; new token `uiMotion.topEdge`. Empty lists say "Nothing yet";
    Tailoring's row says "Soon" and Answers' wrench page "Answers are
    coming".
- **2026-10-22**
  - Support Pinkslip (Paper "Support Pinkslip · Oct 22", A approved): a
    row in its own card at the end of You, a filled pink heart on the pink
    tile (owner: the gray heart looked plain). It opens a sheet copied from
    Plan's See Pro: one line in the owner's words, One time or Monthly, the
    amounts as radios, "Support with $5 ↗" to a Stripe Payment Link. Back
    from Stripe, the toast leads with the filled pink heart, "Thank you for
    your support!". Built the same day (`SupportSheet`); the row shows once
    the Worker has `SUPPORT_LINKS`.
- **2026-10-24**
  - Support Pinkslip takes any amount, one time or monthly (Paper A3, A4,
    approved): picking Other amount opens the number pad with "$7" typed
    in that row where Plan's prices sit, with the pink caret (`AmountInput`
    in `Choice`'s new `trailing` slot). Nothing below $1 or above $500 goes
    in, so there's no error state; the button stays gray until there's an
    amount.
- **2026-10-15**
  - The measured audit (`design-audit-2026-10-15.md`) is settled. The
    owner agreed with the report and decided Q1 to Q12; its "Decided"
    section lists each answer. Written into this file: the 3:1 bar for the
    pink button; the proportional icon line (Paper's ~1,100 icons and the
    System page re-stroked to it); five tabs with Search finding companies
    too; the close-or-grab-bar rule for sheets; header spacing and counts;
    tags; which side a selection circle sits; the quarter-side radius;
    48 header logos; the sample person; times. The eight contradictions it
    found are fixed (the unread dot is 8, Today carries the badge, button
    icons are 20 on 50 buttons, logos follow the quarter rule, the tab list
    has Today, the selected tab is outline, and chevrons are 12 or 11).
  - Tokens: `ink-3` (light) 0.53 to 0.51, and Assessment amber 0.68 to
    0.65 so its mark clears 3:1. Paper's tokens match, with `good`,
    `scrim`, the stage and tile colors added.
  - The up-and-down caret gets a wider gap between its chevrons (owner).
  - The ticket's paper stays a touch darker than the page for now (owner:
    revisit later).
  - Decided (owner, Paper "Outreach · Oct 15"): Outreach, recorded in
    `redesign-wireframes.md`. New rules above: copy, don't redraw; the
    "Did you …?" sheet; Pro in place of the radio; the chevron's space;
    two groups and no detail lines on settings pages; round people
    avatars.
  - Decided (owner, Paper "Dark mode · Oct 15"): the main screens, sheets
    and states checked in dark with the `uiDark` values. One change, for
    the build: in dark, paper objects get a 1pt `separator` edge in place
    of the drop shadow, and the same dark grain as light mode (the light
    grain read as TV static). The stamp turns light ink. Tab icons on
    some older boards were drawn at 1.5pt; the rule stays 1.75, and 2
    when lit.
  - Paper "System" gains Part · Buttons (primary, secondary, outline,
    disabled, plain, text), drawn from `Button.tsx`; the outline kind was
    in the kit but not on the page. Follow on a company page is outline
    (owner: filled pink is too much for something that matters this
    little). Button icons are 20 at the 1.75 stroke.
  - Decided (owner): sheet or page, see "Before drawing". An event is a
    page.
  - Decided (owner, Paper "Errors · Oct 15"): error screens and states,
    recorded under "Empty and error states" above, with "Part · Errors" on
    the System page. The owner struck the "we/us" voice. Not built yet.
  - Decided and built (owner, after an on-phone lab of five page colors):
    the light page is Mist, #F8F8F9 (`bg` and `screen-grouped`); settings
    cards and sheets are white; `fill` and `separator` are see-through ink;
    chips that are off are outlined (new `outline` token); the ticket and
    stub keep their own `paper` (new token). Dark mode only gains
    `outline` and `paper`. Paper "System": new Part · Surfaces, outlined
    chips, and the settings rows on Mist. The page color lab in You is
    removed.
  - Rejected: a warm page (read pink and cheap), a gray page with white job
    rows, and gray cards on a white page (they read as sunken).
  - Decided and built (owner): the tab bar loses its names (L2 is undone);
    the lit tab is the 64 oval with its pink icon.
  - Decided and built (owner): a picked chip's label stays Regular, so the
    chip keeps its width.
  - Decided and built (owner): a sheet's round Back has a 2pt chevron, as
    the lit tab's icon does; at 1.75 it looked light beside a Medium label.
  - Drawn for sign-in (Paper "Sign in · Oct 15"), the rule for a field
    that's wrong: a 1.5pt `bad` ring on the field, then one Footnote line
    in `bad`, 8 below and 16 in. The way out sits right there (send a code,
    Continue with Apple). `--color-bad` was added to Paper.
  - Decided and built (owner, Paper "Sheets · three ways" A): sheets are
    Mist with white groups and fields, new `sheet` and `sheet-group` tokens
    (dark keeps its values). `Sheet`, `Choices`, `CopyField` (its button
    now gray) and the date step use them. Paper has the same tokens, and
    the Apply flow sheets and System parts follow.
  - Decided (owner, Paper "What we sent · three takes" W3): proof is a
    quiet log, newest first, small grey dots and only the latest step in
    ink. No ticks: a finished record doesn't need them, and black fill
    means "on".
  - Paper follows: its tokens are Mist (see "Token audit"), and the Apply
    flow boards are redrawn with white cards on the page, white sheets with
    see-through groups, and outlined chips.

- **2026-10-14**
  - Decided (owner): a group's label lines up with its rows' content, 16
    in, not the card's edge (Paper "Apply flow · Oct 14"). Still to build
    in `ListGroup`.
  - Decided (owner): the bot mark B2 replaces Phosphor Robot everywhere it
    means "Pinkslip does it for you" (Paper "Bot icon · options"; Part ·
    Bot mark on the System page). Still to build: draw it in `Icon.tsx`
    as copy D is, and point `autoApply` at it. Phosphor stays the set;
    Lucide was ruled out as overused.
  - Built You as picked (B with the B4 tiles): `IconTile` and the six tile
    colors in `tokens.ts`; settings rows on `ListGroup surface="fill"` (50
    tall, quieter values and chevrons, `pick`, `destructive`); `Segmented`
    in the kit (the company page moved to it, now 40 with the 4 inset);
    `Choice value` for a price before the check; the system menu's check
    (`Menu` items take `checked`); copy D replaces Phosphor Copy. Icons
    added to `shared/icons.ts`: plan (Ticket), appearance (CircleHalf), help
    (ChatCircleDots), admin and soon (Wrench), kit (Swatches), pick
    (CaretUpDown); answers is now ClipboardText and autoApply the Robot.
  - Decided (owner): copy is an icon, the two squares, never the word
    ("Parts · Copy field"); the filter's sits in its top right corner.
    Built as `CopyField`. Also built for email tracking: `JobRow
    headline="news"` with `needsYou` (Today's row), `ListGroup
    surface="fill"`, `ListItem trailing`.
  - Decided (owner): the stub's stamps use Founders Grotesk Mono (trial cut
    until the licence is bought).
  - Decided (owner): the application page's Change stage is gray, not pink.
  - Decided (owner): stage marks take color only where something's
    happening (Assessment amber, Interviewing blue, Offer green); marks are
    20 in a sheet; Rejected, Withdrawn and Ghosted (was No reply) each get
    their own grey mark. Groups inside a sheet are concentric with it.
    Paper "System" updated (stage rings, and a new "Sheet with groups").
- **2026-10-13, late night (3)**
  - Decided (owner): segmented controls are 40 tall with the thumb 4 inside
    (32, like a chip). Paper "System" updated; the redesign kit has no
    segmented control in code yet.
  - Decided (owner): outreach belongs to the company. An application page
    shows "You reached out" (the person, when, whether they replied) for
    contact with anyone at that company from about two weeks before you
    applied, through the application's life; it isn't a stamp. Tapping the
    person opens their page: the emails, then your applications there.
- **2026-10-13, late night (2)**
  - Decided (owner): the application page keeps the job page's ticket,
    torn, rather than a pink carbon copy (Paper "Application · alternative"
    is kept for reference). The app icon gets a dark version, chosen by the
    phone's theme, and both icons give the mark more room: it's drawn at
    80% of the canvas, centred on its visual middle, so iOS's rounded
    corners and glass edge don't crowd it.
  - Logos filling the tile (Paper "Logos · square ones fill the tile") is
    wanted but waits: telling a full-square logo from a circle needs the
    server to read each favicon's edges.
- **2026-10-13, app icon**
  - Built (owner go-ahead): the app icon is the carbon-copy mark (Paper "The
    mark", A), as a full-bleed 1024 square on its warm white (Paper "App icon
    · 1024 · carbon copy (A)"); iOS rounds the corners. It needs a native
    build, not an over-the-air update. Dark and tinted versions aren't drawn
    yet, so iOS tints the light one.
- **2026-10-13, Tracker built**
  - Decided (owner): no "See all" row; a stage's header opens it. Stats
    stays as a button and says it's coming soon. The goal for line three is
    kept on Paper as "Tracker · the goal".
  - Built: Tracker from TR2c (`TrackerScreen.tsx`), `StageMark`,
    `EmptyState`, chip counts, and section counts after the label (Jobs
    too). Stats is Phosphor ChartBar, in Paper and code. Long-press a row to
    move it to another stage or remove it (a system menu, text only).
- **2026-10-13, past midnight**
  - Decided (owner): Tracker rows are TR2b, the company as the headline
    with the role and news in `ink-2` and a quiet `ink-3` time. TR2 had the
    time at 17, black dots and three time formats. The Paper "Parts" board's
    Row part now shows the Jobs, Today and Tracker rows as decided.
- **2026-10-13, late night**
  - Decided (owner): auto-apply's mark is the robot (Phosphor Robot) in
    the live bar's round white badge, in place of a company logo.
    "Save your changes?" is D3: Save search on top, Discard changes under
    it as ink text, no back button. Swiping the question away or tapping
    behind it goes back to the edits.
  - Built: the step, `useSheetGuard` in the kit, and the `text` button. The
    Paper "System" page has the Text, ink row.
- **2026-10-13, night**
  - Decided (owner): the in-app browser has no permanent "I applied"
    button; a strip ("Did that go through? · I applied") shows only when a
    submit couldn't be confirmed. The fill bar keeps its arrows, and
    "2 need you" also jumps to the next blank. The weekly report is a
    Monday popup you swipe away. "Save your changes?" is approved.
- **2026-10-13, late**
  - Decided (owner): Today rows have one headline line (Untitled Medium 17;
    Founders tried and dropped, since it reads smaller); rows grow past 84
    when they need to; the date tile is square to match the logos; pink is
    for Needs you only, so Pause and other tappable words are ink; no dots
    on What changed. The Since-yesterday numbers card is off Today while
    its options are explored.
- **2026-10-13, night**
  - Decided (owner): Needs you lives on Today only, so Tracker loses its
    Needs-you chip; Tracker chips and groups run Saved → Closed in the
    order an application moves; the Coming up date tile shows the month
    over the day (40×48, Founders), the two-line tile from the Events page.
- **2026-10-13, evening**
  - Decided (owner): section counts sit after the label with a 6 gap; the
    stage ring is drawn at the 1.75 stroke; Saved is the bookmark. The
    Parts board on the Paper System page holds every part to clone.
  - Added "Before drawing": the checklist every Paper round goes through,
    after the Tracker and Today drafts used the old 60-line row, a 32 logo
    and a 17 headline. The kit is the spec; older Paper pages set the feel.
- **2026-10-13, later**
  - Decided (owner): each step of a sheet is its own card and slides in at
    its own height, from the Sheet transitions lab (You → Kit → Redesign kit).
    The cross-fade and its tokens are gone.
- **2026-10-13**
  - Sheets: a grab bar replaces the close button; Back moves to the bottom,
    left of Done; steps change like Family's trays (quick resize, content
    fading in place). Researched: Apple's sheet guidelines and Family's
    trays (docs/redesign-wireframes.md).
  - Proposed, not built: our own "Save your changes?" step when a sheet with
    unsaved changes is swiped away.
- **2026-10-12, evening**
  - Decided (owner): Your search is a plain menu, not the ticket; sheets
    hold plain menus. The "Alerts and companies" step is gone; Alerts and
    Hidden companies are menu rows that open their screens under You.
  - Steps cross-fade in place instead of sliding.
  - The selected tab is a pink outline icon; icons 56 apart; the bar can be
    dragged.
  - Then: tabs go Jobs, Tracker, Search, You; You is the user circle; the
    lit icon is 2pt with Tracker's dot filled.
  - Steps push in from the right and the sheet still sizes to each one
    (400ms for both). Fixed: the first step slid in from the left on open,
    and a scroll that reached the top of a list closed the sheet.
- **2026-10-12, later**
  - Decided (owner): pink checks and switches, gray disabled buttons, and
    an outline button for repeated pink actions.
  - Tokens trimmed in code and Paper (see "Token audit").
- **2026-10-12**
  - Pink set to #EE5FAC with white on it. Pink text uses the deeper pink in
    light mode, and Increase Contrast deepens the fill.
  - Icons take one 1.75pt stroke. You is the person icon.
  - Motion chosen (Vaul for sheets, Apple's spring for the tab oval) and
    moved into `uiMotion`.
  - Our own floating sheets, our own tab bar (option C), and Phosphor
    everywhere.
  - Type and layout written down (see `redesign-wireframes.md`, "The
    system"). Corrected here for the three-line rows: 84 tall, 68 line,
    40 logo.
