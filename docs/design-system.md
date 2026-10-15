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
| Floating | `bg-elev` | The tab bar, toasts (both glass on iOS 26), menus | Inline content |
| Sheet | `sheet` | A sheet's own surface: Mist in light, like the page | Anything inside it |
| Sheet group | `sheet-group` | Groups and fields inside a sheet: white in light | The page |
| Control | `fill` | Gray buttons, search, icon buttons; see-through | Groups, fields |
| Outline | `outline` | The 1pt ring of a chip that's off | Card borders |
| Rule | `separator` | Lines between rows and inside the ticket | Borders around cards |
| Text | `ink` | Titles, values, row titles, chips that are on | |
| Secondary text | `ink-2` | Facts, descriptions, sheet body copy, icons at rest | Titles |
| Tertiary text | `ink-3` | Labels, captions, times, counts, placeholders | Anything to act on |
| Strokes | `ink-4` | Empty radios, chevrons, disabled marks | Text, ever |
| Pink | `accent-fill` | The primary button, checks and switches that are on, badges | Text, chips |
| On pink | `accent-ink` | Text and icons on pink (white) | Anything else |
| Pink text | `accent` | Needs-you labels, unread dots, tappable text, outline buttons, a done toast's check | Headings, body |
| Pink tint | `accent-soft` | Fields Pinkslip filled in (assisted fill) | Buttons |
| Good | `good` | The Offer stage only | Success toasts, checks |
| Tiles | `tile-find`, `tile-apply`, `tile-pro`, `tile-app`, each with its `-ink` | A settings row's 28 tile, by what the row is for: blue finds jobs, green is what you apply with, pink is Pro, gray is the app. Dark mode is D2, quieter (owner, 2026-10-14) | Text, anything outside settings rows |
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

## Buttons

| Kind | Looks | When | Examples |
| --- | --- | --- | --- |
| Primary | Pink fill, white label | The one action the view exists for. One per screen or sheet | Apply, Save search, Continue, Open application |
| Secondary | Gray fill, ink label | Every other action that deserves a button | Save, Not yet, Done, Careers site |
| Outline | No fill, pink edge and pink label | A pink action that repeats down a list or sits inside a card, where filled pink would shout | Follow on company rows, Answer in a needs-you card, Approve in admin lists |
| Text | No container, `ink-2` label (`plain`) | Quiet ways out | Not now, Skip, I already applied |
| Text, ink | No container, `ink` label (`text`) | The other answer under a primary, when it's a real choice | Discard changes |
| Icon | Round gray, 36 or 44, `ink-2` icon | Close, back, share, more, the filter button | |
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

## Selection

- **Chips filter what you see,** so they are ink. Off is outlined: clear
  inside, a 1pt `outline` ring, ink text (owner, 2026-10-15). On is ink fill
  with white text. The label is Regular either way, so a chip doesn't
  change width when it's picked (owner, 2026-10-15). A count sits after a
  small gap in `ink-3`.
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
- **Tab bar:** the selected tab sits in a soft oval with its filled icon.

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
  so nothing sits on the page darker than it except a control.
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
  is its own card at its own height. A grab bar sits on top instead of a
  close button; swipe down or tap behind to close. A step opened from the
  first one has a round Back button at the bottom, left of its Done. Long
  lists scroll. They replace the system sheet everywhere.
- **What a sheet holds is a plain menu** (owner, 2026-10-12): rows in a
  flat white card (`sheet-group`), with no lift and no grain. Menu rows
  are 50 tall: the label, then the value in `ink-3`, then a chevron. Paper
  objects (the ticket, the punch card) stay on their pages; a raised card
  on a sheet loses its edge in dark mode.
- **Corner radius:** 8 for logos and small controls, 12 for cards and lists,
  16 for the ticket, 40 for sheets, fully round for buttons, chips and
  fields. Groups inside a sheet are concentric with it: the sheet's 40 less
  its 20 padding is 20, and the last group's bottom corners follow the
  sheet's bottom (`concentricRadius`, about 27 on current iPhones). Groups
  on a plain page stay 12 (owner, 2026-10-14).
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
- **Settings tiles** (`IconTile`, owner 2026-10-14, Paper "You · Oct 14"
  B4): an 18 icon on a 28 tile, radius 7, a faint tint on the white card. The tile's color is the row's meaning, never decoration, and
  rows of one meaning share a card. Copy is our own mark (two squares, the
  same 2.5 corner), drawn in `Icon.tsx` rather than Phosphor's Copy.
- **The bot mark** (owner, 2026-10-14, Paper "Bot icon · options" B2, and
  the System page's Parts): our own icon for "Pinkslip does it for you", on
  Apply for me, Answer for me, the live bar and the Auto-apply row. It's an
  antenna with a ball, a round head and two pill eyes, drawn on Phosphor's
  256 grid at the 1.75pt line. It replaces Phosphor Robot, whose mouth and
  eyes filled in below 20.
- **Staying with Phosphor** (owner, 2026-10-14): Lucide was ruled out as
  overused. When Phosphor's glyph doesn't hold up at our sizes, we draw our
  own on its grid rather than switch packs.
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
  theirs (owner, 2026-10-13). Pink only for Needs you. 16 above, 4 below.
  Tracker's stage headers lead with the stage mark and open their stage,
  with a chevron after the count ("Applied 142 ›"); All shows each stage's
  latest three (owner, 2026-10-13: a "See all" row looked strange).
- **Stage marks** (`StageMark.tsx`): Saved is the bookmark, since saving
  isn't a stage. The ring fills as a stage advances and is drawn at the
  1.75 stroke like every line icon, 14 beside small text and 20 in a sheet
  (beside the 24 check).
  - **Color only where something's happening** (owner, 2026-10-14):
    Assessment amber, Interviewing blue, Offer `good`. Saved, Applied and
    the endings are grey, so most rows stay calm. Color is on the mark only,
    never text or fills; pink stays the one "needs you" color. Linear colors
    every state; ours did that and the violet fought the pink check.
  - **Endings each have their own mark,** grey: Rejected is the ring with
    an ✕, Withdrawn the ring with an arrow back, Ghosted (was "No reply")
    Phosphor's ghost. Tracker's Closed group keeps the ring with a dash.
- **Empty and error states** (`EmptyState.tsx`, Paper "Parts · Empty
  state"): Title 2, one Body line in `ink-2`, the button under it on the
  same centre line, all centred in the room under the header. The slips
  show only when a list is empty, not when it failed to load; a retry is
  the grey button.
- **Your stub** (`Stub` in `Ticket.tsx`, owner 2026-10-14): the ticket's
  torn-off stub on an application's page. Its top is the tear's other half;
  each step is a rubber stamp (Founders Grotesk Mono caps: the step in
  Medium 13/16, the date in Regular 11/14, both 0.06em; 1.5 border, radius
  6, each at its own angle), the newest in `ink` and older ones `ink-3`;
  email steps add "· EMAIL" and the foot offers "Not right?". The Mono is
  the trial cut for now; the owner buys it with the other Klim licences
  before release (2026-10-14).
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
  leads with the action's icon in `ink-2`, a pink check, or the `bad` mark;
  Undo (the U-turn arrow) and Try again are 32 round icons on `pill`, with a
  2pt `ink-3` ring running down the time left. Three stack, 8 and 16 behind
  at 95% and 90%; tap to spread, swipe one down or aside to clear it; the
  clock stops while it's touched or spread. It says only what the screen
  can't: something left the screen, it happened elsewhere, or it didn't
  work. Liquid Glass can't fade with a parent, so the glass materializes
  and dissolves on its own.
- **Swipe actions** (`SwipeRow`, Paper "Swipe actions · Oct 14" S4): up
  to two 44 circles a side, tinted by meaning (the ink at 14%), with
  Footnote labels under them; a short swipe stays open on them, all the way
  widens the outer circle into its filled capsule and runs it. Settles ease
  out (never a spring that overshoots); a row that leaves folds its height.
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
- **Cards:** radius 12 (`bg-grouped`). Only the ticket is 16, on `paper`.
- **Tappable words inside rows and cards** (Pause, Change, See all,
  All 142) are `ink` Medium; pink stays for Needs you (owner, 2026-10-13).
  Chevrons are `ink-4`.
- **Badge** (`Badge.tsx`): 20 tall, Footnote Medium, white on pink.
- **Chips** (`Chip.tsx`): 32 tall, Subhead, 16 each side, outlined when
  off; a count is `ink-3` after a 6 gap.
- **Progress:** one solid bar, as on the Live Activity (owner, 2026-10-14:
  no segments, no green beside the pink).
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

- **The application page:** five ideas on Paper "Application page · ideas ·
  Oct 13". The owner likes C (your stub, stamped with each step) and is
  deciding.

## Changelog

- **2026-10-15**
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
