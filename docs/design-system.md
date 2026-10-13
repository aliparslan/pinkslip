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
3. **Gray is the quiet default.** Secondary buttons, fields, unselected
   chips, icon buttons.
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
| Screen | `bg` | The page behind everything | Cards |
| Card | `bg-grouped` | Cards, the ticket, choice lists, the toast's card | The page |
| Grouped screen | `screen-grouped` | A settings-style page whose cards are white | Ordinary screens |
| Floating | `bg-elev` | Sheets, the tab bar, toasts, menus | Inline content |
| Control | `fill` | Gray buttons, fields, chips (off), icon buttons | Cards |
| Rule | `separator` | Lines between rows and inside the ticket | Borders around cards |
| Text | `ink` | Titles, values, row titles, chips that are on | |
| Secondary text | `ink-2` | Facts, descriptions, sheet body copy, icons at rest | Titles |
| Tertiary text | `ink-3` | Labels, captions, times, counts, placeholders | Anything to act on |
| Strokes | `ink-4` | Empty radios, chevrons, disabled marks | Text, ever |
| Pink | `accent-fill` | The primary button, checks and switches that are on, badges, the toast's mark | Text, chips |
| On pink | `accent-ink` | Text and icons on pink (white) | Anything else |
| Pink text | `accent` | Needs-you labels, unread dots, tappable text, outline buttons | Headings, body |
| Pink tint | `accent-soft` | Fields Pinkslip filled in (assisted fill) | Buttons |
| Good | `good` | The Offer stage only | Success toasts, checks |
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

## Buttons

| Kind | Looks | When | Examples |
| --- | --- | --- | --- |
| Primary | Pink fill, white label | The one action the view exists for. One per screen or sheet | Apply, Save search, Continue, Open application |
| Secondary | Gray fill, ink label | Every other action that deserves a button | Save, Not yet, Done, Careers site |
| Outline | No fill, pink edge and pink label | A pink action that repeats down a list or sits inside a card, where filled pink would shout | Follow on company rows, Answer in a needs-you card, Approve in admin lists |
| Text | No container, `ink-2` label | Quiet ways out | Not now, Skip, I already applied |
| Icon | Round gray, 36 or 44, `ink-2` icon | Close, back, share, more, the filter button | |
| Destructive | Text button in `bad` | Remove, Withdraw. Confirm in a sheet if it can't be undone | |
| Disabled | Gray fill, `ink-3` label | Any button that can't be used yet | Save search before anything changed |

- **No black buttons.** Ink fill means a chip is on, so an ink button would
  read as a filter, and a second loud color would compete with pink.
- **Never fade pink to show disabled.** White on a faded pink is
  unreadable; disabled is gray.
- **Sizes:** 50 tall for full-width actions, 36 for small capsules (Follow),
  labels in Body Medium (17) or Subhead Medium (15) for small ones. Capsule
  padding 16 each side.

## Selection

- **Chips filter what you see,** so they are ink. Off is gray fill with ink
  text; on is ink fill with white text. A count sits after a small gap in a
  lighter weight.
- **Checks, radios and switches change a setting,** so they are pink. A
  check or radio that's on is a pink circle with a white
  check; one that's off is a 1.75pt `ink-4` ring. A switch that's on has a
  pink track.
  - Checks and switches must match. In Where, a pink switch beside ink
    checks is what looked off.
  - Ink switches don't work in dark mode: the track is near-white and iOS's
    knob is white, so the knob disappears.
- **Segmented controls:** the chosen segment is a raised `seg-on` thumb on a
  gray track.
- **Tab bar:** the selected tab sits in a soft oval with its filled icon.

## Text

- **Four inks, no other text colors.** `ink`, `ink-2`, `ink-3` for text;
  `ink-4` only for strokes.
- **Pink text** is for needs-you labels ("2 need you") and short tappable
  words inside rows or sentences (Change, Undo, See all). Never for
  headings or body copy.
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

- **Three heights:** the screen (`bg`); cards on it (`bg-grouped`, with the
  card shadow only for paper objects); things that float (`bg-elev` with
  the pill shadow: sheets, the tab bar, toasts).
- **Our own sheets:** float 8 in from the edges with 40 corners. Each step
  is its own card at its own height. A grab bar sits on top instead of a
  close button; swipe down or tap behind to close. A step opened from the
  first one has a round Back button at the bottom, left of its Done. Long
  lists scroll. They replace the system sheet everywhere.
- **What a sheet holds is a plain menu** (owner, 2026-10-12): rows in a
  flat gray card (`fill`, 12 corners), with no lift and no grain. Menu rows
  are 50 tall: the label, then the value in `ink-3`, then a chevron. Paper
  objects (the ticket, the punch card) stay on their pages; a raised card
  on a sheet loses its edge in dark mode.
- **Corner radius:** 8 for logos and small controls, 12 for cards and lists,
  16 for the ticket, 40 for sheets, fully round for buttons, chips and
  fields.
- **Layout:** one column, 4pt spacing (4, 8, 12, 16, 20, 24, 32, 40), 16
  side margins. Rhythm is 4–8 inside an item, 12–16 between items, 24–32
  between sections. Job rows are three 20pt lines (84 tall) with the 40
  logo on the 16 margin. Row text and separators start on the 68 line.
- **Fixed sizes:** button 50, list row 44 or more, chip 32, icon button 44,
  logo 40 (48 on a page), punch hole 24.

## Status, badges and dots

- **Unread:** a 7pt pink dot after the time.
- **Counts that need you:** a pink badge with a white number (the Tracker
  tab).
- **Stages:** the ring that fills as an application advances. Green only for
  Offer; endings are gray.
- **Applied:** the torn stub (a paper object), not a checkmark.

## Icons

- **One set everywhere:** Phosphor, on iOS and the web
  (`shared/icons.ts`). System menus are text only.
- **One stroke:** 1.75pt for every line icon at any size (owner,
  2026-10-12). Filled icons for saved marks only.
- **Sizes:** 24 in the tab bar, 20 in icon buttons, 16 in round 36 buttons
  and on button labels, 12–14 for chevrons and checks.
- **Color:** `ink-2` at rest, `ink` when primary, white on pink, `ink-4`
  for chevrons.
- **The selected tab** keeps its outline icon, in pink (`accent`) at a 2pt
  stroke, on the gray oval; Tracker's end dot fills in (owner, 2026-10-12).
  The tabs are Jobs, Tracker, Search and You (the user circle), 56 apart;
  the 64 × 46 oval is wider than that.

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
- **Nothing overshoots.** Bounce is only for a throw that carried momentum,
  as Apple does.
- **Presses** dim to 60%.

## Paper objects

| Object | Means | Where |
| --- | --- | --- |
| Grained ticket with perforated stub | A job's facts | Job page |
| Torn stub | You applied | Job page after applying, the flight into Tracker |
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
    rows carry the pink dot. Tracker gets the same row once it's drawn.
  - **Several companies in one row** (auto-apply's results): two logos
    stacked in the 40 slot, the second 12 down and right with a 2pt ring in
    the page colour. Never a number in the logo slot.
- **Section header** (`SectionHeader`): Footnote Medium `ink-2`, then the
  count in Footnote `ink-3` after a 6 gap, the way chips and segments carry
  theirs (owner, 2026-10-13; the kit still puts the count on the right, so
  the kit follows). Pink only for Needs you. 16 above, 4 below. A stage
  header may lead with its ring.
- **Stage marks:** Saved is the bookmark, since saving isn't a stage. The
  ring fills as a stage advances and is drawn at the 1.75 stroke like every
  line icon (owner, 2026-10-13; `JobRow.tsx` still draws it at 1.5, so the
  kit follows). Offer is `good`; endings are grey.
- **Date tile** (Coming up rows): 40 square, radius 10, `fill`, in the logo
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
- **Cards:** radius 12 (`bg-grouped`). Only the ticket is 16.
- **Tappable words inside rows and cards** (Pause, Change, See all,
  All 142) are `ink` Medium; pink stays for Needs you (owner, 2026-10-13).
  Chevrons are `ink-4`.
- **Badge** (`Badge.tsx`): 20 tall, Footnote Medium, white on pink.
- **Chips** (`Chip.tsx`): 32 tall, Subhead, 16 each side; a count is `ink-3`
  after a 6 gap.
- **Progress:** the segmented bar from the Live Activity, one segment per
  job.
- **Spacing:** only 4, 8, 12, 16, 20, 24, 32, 40. 24–32 between sections.
- **Emphasis** comes from the four inks and Medium, and from the one
  headline line a row has.

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
- **Not part of this audit:** the web's older palette (`packages/tokens`
  `base`/`dark`/`light`, the `--color-*` CSS the live web uses) stays until
  the web's own redesign.

## Open decisions

- **In-app browser:**
  - an "I applied" button (B) or nothing (A);
  - the fill bar's ⌃ ⌄ arrows, or "2 need you" jumping to the next blank.

## Changelog

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
