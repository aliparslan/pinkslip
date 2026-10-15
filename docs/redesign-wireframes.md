# Lo-fi wireframes (2026-10-11)

Step 3 of the sequence in [redesign-2026-10.md](redesign-2026-10.md), built
against the approved [brief](redesign-brief.md).

**Paper file:** [Pinkslip · Redesign wireframes](https://app.paper.design/file/01M4PHGHP6STZ6E2GH8TBPYZD5),
page "Archive · Lo-fi · Jobs · Tracker · You".

**Scope:** structure, grid and grouping only, so judge layout, not looks.
- Greyscale. Pink appears only where the rule says it can: act, or needs
  you.
- SF Pro stands in for type. Klim and the paper moments come in the visual
  pass.
- iPhone frames at 390pt, with the agreed 16pt margin and 60pt content
  keyline, and the five text sizes (34, 22, 17, 15, 13).

## The five frames

| Frame | What it settles |
| --- | --- |
| **Jobs** | The shared row: the company with a trailing age, a semibold title, then level, place and pay. A small unread dot sits in the gutter, centred on the logo. Rows already in your pipeline show a stage mark (Saved, Applied) beside the age. Quick refinements sit under the search field, and Edit search is the top-right button. The list is grouped into "New today" and "Earlier this week" with counts |
| **Job page** | The header puts company and title beside the logo, centred on it (owner, 2026-10-11). Next comes a facts panel: level, pay, location, visa sponsorship, experience and deadline, with the posting date and source as its footer. Then a "Fits your search" line, then the description. Save and Apply are pinned to the bottom |
| **Apply button states** | One button through all seven states: Apply; Apply for me (Pro, with "Apply myself" in its menu); Queued; Applying with progress; Needs you; Applied; and Interview · View in Tracker on later visits |
| **Tracker** | Needs you at the top, then the batch card (only while a batch runs), Applications · Outreach, and applications grouped by stage. The stage glyphs fill up as an application advances |
| **You** | The identity card, then grouped lists with values on the right: Profile, Search, Automation, Notifications and email, App, Admin (admins only) and Sign out. The version line sits at the bottom |

## Calls I made that you may want to change

1. **The unread dot is dark grey, not pink.** "New" isn't "act", so the
   pink rule keeps it neutral. Tracker's Needs-you rows use the same dot in
   pink, so one shape means "look here" and pink means it's your move.
2. **The selected tab is neutral, and the Tracker badge is pink.** Today the
   tab tint is pink everywhere.
3. **A selected chip uses the pink fill**, as the system rules say. That
   gives pink a third role ("on"), next to act and needs you. A lighter
   option is the pale pink tint for "on" and the full pink only for actions.
   I lean that way.
4. **Save disappears once a job is queued or applied.** By then it's already
   in Tracker, so the Apply button takes the full width.
5. **Needs you uses plain rows, not a card.** That keeps everything on the
   60pt keyline. The queue card is the only boxed element in Tracker.
6. **Search stays in the Jobs header.** The alternative is iOS 26's search
   tab next to the tab bar. It's worth testing once we know whether
   expo-router's native tabs support it.
7. **Automation rows say "Soon"** and have no chevron, as roadmap signals.
8. **Delete account** isn't on the You screen itself. It would sit behind the
   identity card with the account details, which Apple requires to be
   reachable.

## Owner feedback (2026-10-11)

- Happy overall. Liked the Apply button direction, Tracker and You.
- **Job page header:** company and title sit beside the logo. Done. The
  posting date moved into the facts panel's footer. A title that wraps to two
  lines wraps in the narrower column beside the logo.
- **Unread dot:** keep it for now and judge it in practice. It's now centred
  on the logo.

## Visual pass: two takes (2026-10-11)

These are on the pages "Take A · Quiet" and "Archive · Take B" in the same
Paper file. Each take has five frames: Jobs, the job page, the job page just
after applying, Tracker, and You. Both keep the wireframe layouts exactly.

| | Take A · Quiet | Take B · More paper |
| --- | --- | --- |
| **Ground** | White, with warm stone for grouped screens and the ticket | Warm form paper (#F5F0E6), with a lighter sheet for grouped cards |
| **Text** | Near-black and warm greys from today's light tokens | Carbon-brown inks |
| **Type** | Founders Grotesk for the big titles, job titles and logo initials. Untitled Sans for everything else | The same, plus Founders Grotesk Mono in caps for section labels, ages, dates, ticket labels and the version line, and a mono line above each big title (date, counts, plan) |
| **Facts panel** | A stone ticket with notches and a dashed tear line above a stub that holds the posting date | A pale pink slip. Labels are mono caps and values are Founders Grotesk, so the numbers read at a glance |
| **Applied stamp** | A single-line pink stamp | A double-ruled stamp with a mono date |
| **Pink** | The Apply fill, needs-you dots and labels, the badge, and the stamp. A selected chip uses pale pink | The same |

**What both takes leave out:**
- **Dark mode.** It comes after you pick a take.
- **Empty states** and the Live Activity.

**Font caveats:** these come from Klim's trial files.
- **Missing characters:** $, ·, – and / fall back to the system font.
- **No semibold Untitled Sans:** titles use Medium until the real licence.

**Logos:** company logos are brand-coloured initials standing in for the real
images.

## Owner pick: Take A (2026-10-11)

### Several locations on the job page

These are drawn on the Take A page: "A · Job page, several locations" and
"A · All locations sheet".

- **The ticket grid is the same for every job:**
  - Level | Pay
  - Location, as a full-width row
  - Visa sponsorship | Experience
  - The stub, with the posting date, the deadline and the source
- **With one place,** the location row shows just that place.
- **With several places:**
  - The label just says "Locations", with no count. The "and 3 more" line
    already says there are others (owner, 2026-10-11).
  - The place that matches your saved search comes first, at full size, with
    a check.
  - The rest go on a quieter line: "San Francisco, Seattle, Austin and
    3 more", with a chevron.
  - Tapping that line opens a sheet with every place. Matches come first and
    are marked "Your search"; the rest follow in the posting's order.
- **Pay that varies by place:**
  - The pay cell shows the band for the place that matches your search, and
    its label says so: "Pay in New York".
  - The sheet becomes "Locations and pay", with each place's band on the
    right. A place with no listed band says "Not listed".
  - If no place matches your search, the label reads "Pay" and the value
    spans the lowest to the highest band.
  - The feed row shows the same band as the ticket.
  - The extractor stores one salary text per posting today, so per-place
    bands need backend work: parse zone or city bands from the posting.
- **The deadline moved into the stub** ("Posted Oct 9 · Rolling deadline · via
  Greenhouse"). Dates read as the ticket's stub, and the grid stays even.
- **The applied mark** is the torn stub (2026-10-12): after Apply, the ticket
  keeps a torn edge where the stub was. It covers no facts.

**For the build:**
- **Search-matched place first in rows:** `formatRowLocation` in
  `packages/core/src/job-format.ts` today shows the posting's first place
  ("New York +5"). The feed row should show the place that matches the search
  first, as the ticket does.
- **The full list:** `jobLocationParts` already returns every place for the
  sheet.

## Tracker order (owner, 2026-10-11)

From the top: the Applications · Outreach switch, the "Applying to" card for
work in progress, Needs you, then the stages.

## Take A in dark mode (2026-10-11)

These are on the page "Take A · Dark", as images of the seven Take A frames
rendered with the dark palette. The palette is the `--ad-*` tokens in the
Paper file, and it follows today's graphite dark tokens:

| Role | Dark value |
| --- | --- |
| Screen | `oklch(0.165 0.005 285)` |
| Ticket, queue card | `oklch(0.215 0.006 285)`, a step above the screen |
| Grouped cards, sheets | `oklch(0.205 0.006 285)` |
| Grouped screen (You) | `oklch(0.125 0.004 285)`, darker than its cards, as on iOS |
| Ink ramp | 0.965 / 0.82 / 0.68 / 0.50 |
| Lines | 0.29 |
| Pink ink | The pastel `oklch(0.78 0.153 350)`. Deep pink doesn't read on graphite |
| Selected chip | `oklch(0.30 0.07 350)` with pale pink text |
| Badge | Pastel with dark text, not white |

- **How it's built:** Take A's colours all go through `--color-*` aliases.
  Pointing those at `--ad-*` turns the whole page dark, including the icons,
  and pointing them back at `--a-*` restores light. The status bar, tab bar,
  bottom bar, segmented control and scrim now use tokens too, so they flip
  with the rest.
- **Open item for the build:** the brand-colour logo tiles have no outline,
  so very dark logos such as Plaid's lose their edge on graphite. Use today's
  image outline on the logo tile in dark mode.

## Paper objects (owner, 2026-10-11)

Drawn on the Paper page "Paper objects". The owner wanted more skeuomorphism,
but only in chosen places.

- **The rule:** one paper object per screen at most. Buttons, lists and
  controls stay flat and native.
- **In:**
  - **The mark: carbon copy.** A pink form and its paler copy, with printed
    rules, a perforated stub line, a folded corner and soft shadows. This is
    the app-icon treatment. The icon rail, tab and favicon keep today's flat
    two-slip shape so it reads at 16px. It can also serve as the brief for the
    commissioned logo.
  - **The stamp:** replaced by the torn stub on 2026-10-12 (see "Revisions
    decided").
  - **The ticket:** faint paper grain, the perforation drawn as punched holes
    (the screen colour showing through), and a slight lift off the page.
  - **The stub tear:** on Apply, the stub tears along the holes and drops
    into the Tracker tab, and the tab's count goes up by one. Each step gets
    a haptic.
  - **The punch card:** the Plan page's weekly allowance is a card with
    5 holes, punched as they're used, and a cut corner. "2 left" stays as
    text.
- **Tabled:** the receipt share image for Stats and the offer envelope with
  a green wax seal. Both are drawn for later.
- **Paperclip: not now.** If it comes back, it's a drawn object, only where
  something is literally attached (the resume on what you sent). It's never
  an icon or a control, and never on the app icon.
- **For the build:**
  - The ink and grain use fractal noise and displacement. react-native-svg
    doesn't support those filters, so they need Skia (which has noise shaders
    and a displacement filter) or baked textures.
  - Built (2026-10-12): the iOS grain is a baked 128pt tile, tinted by mode
    and matched to the Paper renders' paper tone (light 236, dark 34 on the
    0–255 scale). Dark grain lifts the graphite slightly, as in the renders.

## The consistency pass (owner, 2026-10-11)

Applied across Take A and every batch page in Paper.

- **Job rows are two lines:**
  - Line one is the title, with the age on the right.
  - Line two is the company in dark ink, then "· level · place · pay" in
    grey. Places are short ("New York", not "New York, NY") and pay is
    compact ("$145–175K").
  - Long titles wrap instead of being cut off. Line two ends in "…" when it
    doesn't fit.
  - **Stage goes where the age goes.** A job you've saved or applied to
    shows "◌ Saved" or "◔ Applied" in the age slot, at the same size. The
    left edge holds only the unread dot.
  - Roughly 6 to 7 rows fit on the Jobs screen, and 8 to 9 once you scroll
    and the header collapses (drawn on the "Archive · Job row density" page).
- **Selected chips are dark:** an ink fill with white text. Pale pink is no
  longer an "on" colour anywhere: the selected price on the Plan page is
  dark too. Pink now means only "do this" or "needs you".
- **One button pink.** Filled pink elements (buttons, the Tracker badge) all
  use the lighter pink with dark text. The deeper pink is only for text,
  dots and stamp ink. "Import contacts" and the badge were fixed to match.
- **The badge** uses Untitled Sans Medium 13, and sits just off the icon's
  top-right corner.
- **The Tracker tab icon is a stack of tickets.**
- **The type scale** follows Apple's text styles, so it scales with the
  iPhone text-size setting:
  - Founders Grotesk for display: 34 (large title), 28, 22.
  - Untitled Sans for text: 17 (body), 15, 13.
  - 10 for tab labels.
  - Off-scale sizes were snapped (24 to 22, 26 to 28, 20 to 22, 12 and
    11 to 13, 14 to 15). Logo initials, system mock-ups (lock screen,
    notifications) and employer web pages inside the in-app browser are
    exempt.
  - Items on the same line share a size. Use colour, weight or an icon to
    tell them apart, not size.
- **Wording is for intern to about 5 years in.**
  - No class, campus, semester, student, school or "season".
  - "Season" became "3 months", "Shared by a student" became "Shared by the
    community", and "School" became "Education".
  - Example events and people are hiring nights and technical recruiters,
    not career fairs and university recruiters.
  - Example jobs mix levels, such as "Software Engineer II" and "0–2 yrs".
- **Paper objects in the screens:**
  - The welcome screen uses the carbon-copy mark.
  - The applied mark is the torn stub (2026-10-12).
  - Every ticket has grain, punched perforation and a slight lift.
  - The Plan page uses the punch card.

## Dark mode for the batches (2026-10-12)

Every batch screen and the core Take A screens are rendered in dark, as
images, on the Paper pages "Batches · Dark" and "Take A · Dark" (refreshed
after the consistency pass). They're made the same way as before: point the
`--color-*` aliases at `--ad-*`, export, then point them back.

- **Paper objects in dark:**
  - The ticket turns graphite and keeps its grain, punched holes and lift.
    The holes show the screen colour, so they stay holes.
  - The stamp ink follows the accent colour, so it turns pastel pink on dark.
  - The punch card's punched holes are the darker screen colour, and the
    unpunched rings are a faint pink.
  - The carbon-copy mark stays pink.
- **Fixed for dark:**
  - The job page's ⋯ menu and the notification mock-ups (onboarding alerts
    and the lock screen) now use the glass colour and ink tokens, not fixed
    light values.
  - The alerts illustration's panel follows the palette.
- **Stays light on purpose:** the employer's web page inside the in-app
  browser, because career sites don't follow the app's appearance.
- **Selected chips and prices** invert to a light fill with dark text.
- **Still open for the build:** very dark logo tiles (Plaid's) lose their
  edge on graphite and need the image outline in dark mode.
- **Shadows use two tokens,** contact and lift: warm brown in light, black in
  dark (fixed 2026-10-12, so the ticket no longer glows on dark).
- **Dark renders refreshed (2026-10-12)** after the revisions and the audit.

## Revisions decided (owner, 2026-10-12)

Options are on the Paper page "Revisions · Oct 12". The picks are applied
across Take A and every batch page.

- **Level in job rows:** line 2 drops the level when the title already says
  it, so place and pay stop getting cut off.
  - A short word list counts as saying it: intern, co-op, new grad,
    graduate, junior.
  - Vague titles keep the level: "Software Engineer", "Associate Product
    Manager", "Software Engineer I", "Backend Engineer II".
  - A row with no listed pay leaves pay out. It never says "Pay not listed".
- **The applied mark is the torn stub** (option A of five).
  - On Apply, the stub tears off along the punched holes and drops into the
    Tracker tab. The job page keeps the torn edge, and the button below
    reads "Applied Oct 10".
  - The inked stamp is gone from the job page, the welcome screen and the
    stub-tear board. It needs no ink texture, so the build only needs noise
    for the paper grain.
  - The rejected options (date stamp, postmark, punched check, embossed
    seal) stay on the revisions page for reference.
- **The punch card at any limit:**
  - Up to 5, the holes sit beside the label.
  - Above 5, they move under the label in rows of ten, split into fives.
  - A limit that isn't a multiple of five ends with a short group.
  - A card holds 30 at most. Over 30 it shows a number and a bar, and with no
    limit just the count.
  - If one allowance on a card stacks, they all stack, so the holes line up.
  - Over the limit after a downgrade, the holes are all punched with "+3"
    after them.
  - A daily limit says "Today" and "Resets at midnight".
- **The Plan page uses plan rows** (option A).
  - The punch card, then "Jobs, alerts and the Tracker are always free." as
    a section footer.
  - "Pro" with four features, then weekly, monthly and 3-month rows with a
    radio and the weekly equivalent.
  - The trial button and its price line are pinned to the bottom.
  - The Free and Pro table (option B) stays on the revisions page.
- **The alerts step is a real lock screen:** iOS notification styling, the
  system font, the app icon and a stack.
  - The second board is the iOS prompt that follows "Turn on alerts".
  - iOS shows that prompt only once, so "Not now" doesn't trigger it, and the
    app can ask again later.
  - The lock-screen notifications board got the same treatment.
- **Untitled Sans stays** for text (compared with Founders Grotesk Text, SF
  Pro and National 2 on the Paper page "Archive · Type pairings").
- **Contact import is admin only.** It loads recruiter contacts into
  Pinkslip's shared list, which company pages show as "from Pinkslip's list".
  Users can't import their own contacts yet.

## The system: type and layout (owner, 2026-10-12)

The rules every screen follows, and what the iOS tokens and kit encode.

**Type** follows Apple's text styles, so it can scale with the iPhone's text
size setting.

| Style | Size / line height | Face |
| --- | --- | --- |
| Large title | 34 / 41 | Founders Grotesk Semibold |
| Title 1 | 28 / 34 | Founders Grotesk Semibold |
| Title 2 | 22 / 28 | Founders Grotesk Semibold |
| Body | 17 / 22 | Untitled Sans 400, or 500 for row titles and emphasis |
| Long text | 17 / 24 | Untitled Sans 400, for job descriptions and emails |
| Subhead | 15 / 20 | Untitled Sans |
| Footnote | 13 / 18 | Untitled Sans |
| Tab label | 10 / 12 | System font |

- Items on the same line share a size.
- Hierarchy comes from the four ink shades and the weight, not extra sizes.
- Exempt: logo initials, system mock-ups (status bar, lock screen,
  notifications, iOS prompts) and employer web pages in the in-app browser.

**Layout** has no column grid: iPhone screens are one column. The system is a
4pt unit plus fixed alignment lines.

- **Spacing** is a multiple of 4: 4, 8, 12, 16, 20, 24, 32, 40.
- **Rhythm:** 4 to 8 inside an item, 12 to 16 between items in a group, 24 to
  32 between sections.
- **Side margins** are 16. Grouped lists and cards are inset 16.
- **The 60 line:** row text starts 60 from the edge, after the 16 gutter and
  the 44 logo slot. Separators are inset to it.
- **Fixed sizes:** job row 64, list row 44 or more, large button 50 (Apple's
  size), chip 32, icon button 44, punch hole 24.
- **Corner radius:** 8 for logos and small controls, 12 for cards and grouped
  lists, 16 for the ticket and sheets, fully round for buttons and chips.
- **Capsule padding:** 16 on each side for buttons and chips.
- **Derived, not hand-set:** the unread dot and logo align to the title's
  first line, and list rows centre their content in a minimum height. In
  code these are computed, so a 10 or 11 inside a row is not a spacing
  value.
- **System chrome follows iOS:** the status bar, home indicator and safe areas
  come from the system.

**Audit (2026-10-12):**
- Large titles were 36 and are now 34/41.
- Title line heights moved to Apple's: 22/28 and 28/34.
- Email and composer text is 17/24.
- Off-grid spacing was snapped: 18 to 16, 14 to 16 (or 12 between an icon
  and its label), 10, 7 and 6 to 8. Holes and radios went from 22 to 24.
- Labels inside fixed-height controls (chips and logo tiles) keep their line
  height, since the control centres them.

## In review (owner, 2026-10-12)

- **Search moved to iOS 26's search tab.** Jobs keeps its title, quick filters
  and Edit search. The owner expects many people to look for search on Jobs,
  so this is on trial.
- **Job rows** (Paper page "Archive · Job rows · Oct 12"): the owner found titles too
  heavy and the unread dot out of line. Options:
  - Today: 17 medium, wrapping titles, a 32 logo and the dot on the title line.
  - A · Compact: 15 medium on one line, a 40 logo that exactly spans the two
    text lines, and the dot centred on the logo. Fixed 64pt rows, 7 visible.
  - B · Calm: 17 regular, titles wrap to two lines, a 42 logo spanning the
    first two lines, and the dot centred on the logo.
- **Swipe actions** (Paper page "Archive · Swipe actions · Oct 12"): today's full pink
  and red slabs use the old kit. Options are A · Capsule, B · Just the mark
  and C · Soft slab. Open question: Mail-style two actions per side, where a
  full swipe runs the outer one.
- **Icons:** the dev screen You → Kit → Redesign kit → Icon sets shows every
  concept in SF Symbols and Phosphor Regular, Bold, Duotone and Fill, with
  the stage ring beside the stages. Sheet in
  `docs/port-design/redesign-kit/icon-sets-2026-10-12.png`.
- **Pay is always shorthand** ("$147–210K"): amounts written without commas
  now compact like the rest (0dd4044).

### Decided (owner, 2026-10-12)

- **Job rows are three lines, laid out and read the way Gmail shows mail**
  (owner, 2026-10-12, after trying two-line rows with the dot inside the
  margin, a quiet read state, a badge on the logo, a dot by the age and a
  Messages-style dot at the left edge). Line one is the company and the age;
  line two the title, cut off with "…"; line three level, place and pay,
  with the stage (Saved, Applied) at the end where Gmail puts the star.
  Until you open a job the company and title are Medium and a pink dot
  follows the age ("2h •"); once opened they're Regular, the age grey and
  the dot gone. This applies to every job you haven't opened, not only the
  last 48 hours. The 40pt logo is the height of the first two lines, on the
  16 margin (quarter radius, 10). Every row is 84pt; text and separators
  start on the 68 line. The Paper pages still show the two-line rows.
  - Bold here is Medium (500): the licensed family has no Semibold, and
    Bold (700) is outside the type rules.
  - The dot is pink by the owner's call, a deliberate exception to "pink is
    for acting or needs you" (wireframe call 1 had it grey).
- **Swipes are A · Capsule:** the page stays put, a grey circle grows from
  the row's edge and turns into an ink capsule with the label once letting go
  will act. One action per side.
- **Punch card holes are the original style** (owner, 2026-10-12, after
  trying see-through and solid black): a punched hole shows the page behind
  the card, shaded under its top edge, and the spots still to use are faint
  pink rings. The card has the ticket's paper texture, and a spot punched on
  screen presses in.
- **Paper texture:** the per-pixel noise read as static (it was also drawn
  at a third of the screen's resolution). `apps/native/scripts/paper-textures.py`
  makes seamless 256pt tiles from three layers of real paper (pulp clouds,
  fibres, a faint tooth) at full resolution. Cotton is chosen (owner,
  2026-10-12); stock and recycled stay in the kit for reference. Sheet:
  `docs/port-design/redesign-kit/paper-textures-2026-10-12.png`.
- **Icons:** SF Symbols on iOS and Phosphor Regular on the web, both from one
  table of ideas in `shared/icons.ts` (iOS fails to compile on a symbol that
  doesn't exist; a test checks the web names). Saved jobs use the bookmark;
  the stage ring is only for application stages.

- **Edit search is built** (2026-10-12): the Jobs tab's top-right button
  opens "Your search" as a page sheet with its own stack, matching the Paper
  frame "6 · Edit search". It edits the one saved search (it replaces the
  old filter sheet and Preferences): career stage, roles and experience open
  pickers inside the sheet; Remote and visa sponsorship are switches; hidden
  companies and alerts open their screens under You. Save is the pink
  prominent button, enabled once something changes; Cancel drops the draft.
  The quick chips on Jobs stay as one-tap refinements on top of it.
  - Not yet: the live match count in the header (the feed API stops counting
    at a page, so it needs a count endpoint) and minimum pay (the saved
    search has no pay field). Both are small, additive backend changes.

## Paper first, our own sheets (owner, 2026-10-12)

- **The built Edit search is rejected.** It followed the old filters and
  Preferences structure and reads as an iOS settings list. From now on every
  screen is designed in Paper first and the app is built to it, never the
  other way round.
- **Sheets are ours, not iOS's.** The owner is happy to replace the stock
  sheet everywhere, as Family and Instagram do. The new sheet floats 8pt in
  from the screen edges with 40pt corners, sizes to its content and changes
  size in place between steps. It has a round close button top right and no
  grabber.
- **Proposals on the Paper page "Filters and Apply · Oct 12"** (sheet:
  `docs/port-design/redesign-kit/filters-apply-2026-10-12.png`):
  - **Filters A · your search as a ticket:** the saved search drawn on the
    job page's ticket grid (stage | pay from, roles, where, visa |
    experience). Alerts and hidden companies sit on the stub. Tapping a box
    turns the sheet into that choice with round checks (the onboarding
    style), and Done goes back.
  - **Filters B · one page of chips:** every choice inline with no
    drill-downs. The sheet is nearly full height and scrolls under a pinned
    Save.
  - **Apply 1 · Tap Apply:** "Apply at Stripe · Opens on Greenhouse". Your
    resume, email, LinkedIn and saved answers sit on a ticket with copy and
    share buttons, then Open application and "I already applied".
  - **Apply 2 · Back from the posting:** replaces today's system alert with
    "Did you apply?" over a small ticket for the job. Yes tears the stub off
    into Tracker (the existing motion); Not yet closes.
  - **Jobs · search beside the filter button:** the search field and the
    filter button share a row under the title, with the three-line rows we
    settled on. This would retire the iOS 26 search tab.
- **Selected chips:** the owner finds black too harsh. The page compares
  black, pale pink, outline, raised slip, check and pink fill in light and
  dark (`docs/port-design/redesign-kit/chip-options-2026-10-12.png`). The
  owner suggested pink fill with black text; it is drawn in Filters B as
  well, where it sits next to the pink Save button.

### Decided after review (owner, 2026-10-12)

- **Filters A is picked:** your search as a ticket, each box opening its
  choice inside the same sheet. The Paper frames now sit over the Jobs
  screen with bar C.

- **Selected chips stay black** (ink fill, white text). The owner tried pale
  pink with black text and pink fill, then kept black. The Paper frames are
  back to black.
- **No match count** ("About 48 new jobs a week") on the filter sheets. It
  had no source (the feed API doesn't count matches), so it's gone.
- **Apply sheet rows are things you can change, not copy:** resume, email,
  LinkedIn and answers each open to be changed (a chevron, no copy or share
  buttons).
- **"Did you apply?" has no ticket:** the person just came from the posting
  and the job page is right behind the sheet. It's the title, one line,
  "Yes, I applied" and "Not yet"; Yes tears the job page's stub into Tracker.
- Sheet: `docs/port-design/redesign-kit/filters-apply-2026-10-12-r2.png`.
- **Apply without assisted fill skips the sheet:** Apply opens the posting
  straight away and "Did you apply?" asks on return. The sheet with the
  changeable rows is only for people whose form Pinkslip fills.

## Our own tab bar, one icon set (owner, 2026-10-12)

- **One icon set everywhere: Phosphor**, on iOS and the web. This replaces
  the SF Symbols / Phosphor split decided earlier the same day; the brand
  should look the same on every surface. Regular for resting icons, Fill
  for the selected tab, Bold where a heavier mark is needed. Phosphor is
  already a dependency of both apps (`@phosphor-icons/react`,
  `phosphor-react-native`). Where iOS draws for us (long-press menus), use
  text only rather than mixing in SF Symbols.
- **Tracker's icon is Path** (owner, 2026-10-12): the road from applied to
  offer. It replaces Ticket, which the owner didn't love; CardsThree and
  Kanban were the other finalists. Options: `docs/port-design/redesign-kit/tracker-icons-2026-10-12.png`.
- **Counts in chips and segments** are a separate, lighter number with a
  6pt gap ("Jobs  12", the number in ink-3).
- **The tab bar becomes ours**, like Instagram's. Options on the Paper page
  "Tab bar · Oct 12" (sheet `docs/port-design/redesign-kit/tab-bars-2026-10-12.png`,
  close-up `tab-bars-closeup-2026-10-12.png`), all with Jobs, Search,
  Tracker and You (your photo or initials):
  - **A · Flat, icons only** (Instagram, Threads): a plain white bar with a
    hairline; outline icons, the selected one filled.
  - **B · Flat, with labels** (Airbnb): the same bar with 11pt labels.
  - **C · Floating pill** (Cash App, Savee, Oura): a small centred
    capsule; the selected icon sits on a soft circle.
  - **D · Ticket stub bar:** the bar is the ticket's stone paper with a
    torn top edge, and the selected tab gets a punched hole under it.
  - With our own bar the Search tab's field moves to the top of the screen
    (iOS 26 only puts it at the bottom for the system bar).
- **The selected tab sits in an oval, and the pill is glass** (owner,
  2026-10-12, after Instagram): real Liquid Glass on iOS 26 (expo-glass-effect,
  already linked by expo-router), solid paper before it, and no white fade,
  so rows show through as they pass under it.
- **Picked (owner, 2026-10-12): C · Floating pill.** "There's really
  just one new icon, and users will know to go there." The Search tab with
  this bar is drawn on the same page.
- Research: Mobbin screens of Instagram, Threads, Airbnb, Public, Fresha,
  Waymo, Opal, Cash App, Savee and Oura; Instagram tested reorganising its
  bar around Reels and messages in late 2025.

## Search and companies (owner, 2026-10-12)

On the Paper page "Search and companies · Oct 12" (sheet:
`docs/port-design/redesign-kit/search-companies-2026-10-12.png`).

- **Two searches.** Jobs gets a search field beside the filter button: it
  narrows the feed you're looking at, chips still apply, and it covers all
  open jobs, not only your saved search. The Search tab stays (iOS 26's
  separate button by the tab bar) for jobs, companies and events together.
  Jobs results end with "Search everything for …", which opens the Search
  tab with the same words.
- **Search tab before typing:** recent searches, companies you follow and
  coming events. Typing gives the scoped results (All, Jobs, Companies,
  Events) with the company first, then three-line job rows, then events.
  The field sits at the bottom, as iOS 26 draws it.
- **Job page → company page:** the company name above the title shows a
  chevron ("Stripe ›") and, with the logo, opens the company page. The
  company page opens on Jobs: "Fits your search" first, then "Other roles".
  Its rows drop the logo and company name, since every row is the same
  company.

## Built from Paper (2026-10-12)

All in the redesign build only (development and the owner's phone build).

- **Tab bar C** (7440604, 227a6b6): our own floating pill of Liquid Glass
  (expo-glass-effect; solid paper before iOS 26), icons only, the selected
  tab in an oval with its Fill icon, You as your initials. Tapping the
  current tab scrolls to the top. Screens that aren't redesigned yet
  (Library, You) end above it.
- **Phosphor everywhere** (7440604): `shared/icons.ts` names Phosphor only,
  and the iOS Icon draws it; long-press menus are text only. Tracker is Path.
- **Your search** (e7f2170): our sheet (`ui/Sheet.tsx`: floats 8pt in, 40pt
  corners, resizes between steps, drag down or tap outside to close) with
  the search on a ticket. Each box steps into its choice; Pay from says
  "Soon" until the saved search has a pay floor.
- **Search** (0201d78): Jobs has its own header with the field beside the
  filter button; typing narrows the feed and ends with "Search everything".
  The Search tab has its own field at the top, recent searches, matching
  companies (one row per company) and every open job.
- **Company page** (0201d78): opened from "Stripe ›" on the job page or a
  Search result. Follow says "Soon"; Careers site opens the website; Jobs
  merges every job source the company has, "Fits your search" first.
  People and Events say they're coming.
- **Apply** (417d9dc): without assisted fill, Apply opens the posting and
  "Did you apply?" asks on return in our sheet. With it, "Apply at …"
  shows what the form will be filled with, each row opening where it's
  changed.
- **Job page top bar** (9d329a5): back, and share with ⋯ in one pill, in
  our icons; the ⋯ menu is the system's, text only.

## Icons, pink and motion (owner, 2026-10-12)

The Paper page "Motion and icons · Oct 12" holds the comparisons.

- **Icon weight, decided:** one stroke for every line icon, 1.75pt at any
  size. Filled marks stay filled. Before this, strokes ran from 1.1pt (a
  12pt chevron) to 1.5pt (a tab icon), beside Untitled Sans stems of 1.4pt
  (Regular) and 2.2pt (Medium). The iOS Icon takes the heaviest Phosphor
  weight that's no thicker than 1.75pt at the size it's drawn, then adds an
  outline stroke for the rest.
- **You is the person icon** (Phosphor User), never initials, on iOS and the
  web.
- **White text on the pink, still open.** These are measured, not judged
  by eye:
  - **Today's pink, `oklch(78% 0.153 350)`:** white text on it is 2.2:1,
    APCA Lc 46. Ink text on it is 9.1:1.
  - **About 68% lightness:** white first reaches 3:1, which is where
    Airbnb, Lyft, X and Venmo put white on their brand colors.
  - **About 59% lightness:** white reaches 4.5:1.
  - **The App Store label:** Apple's "Sufficient Contrast" label asks for
    4.5:1 on text up to 17pt. The label is optional. An app can also
    qualify by switching to stronger colors when Increase Contrast is on.
  - **Brands that pair black text with a light bright color:** Robinhood
    puts black on its green (2.3:1 with white).
  - The owner is choosing in the Pink lab artifact
    (https://claude.ai/artifact/9MUgCfLE1YLEiBbuybUA74).
- **Motion, being tuned:** Paper can't animate. It drops CSS animation and
  has no duration or easing token types, so the Paper page is a storyboard
  spec. The owner is tuning the values in the Motion lab artifact
  (https://claude.ai/artifact/PFVndsQWKHNHfGYocjtFhK); once chosen, they
  belong in `packages/tokens` for iOS and the web. Sources:
  - **Apple, WWDC 2018 "Designing Fluid Interfaces":** start at 100% damping.
    Use 80% only when a swipe carried momentum. Throws land where their
    velocity projects.
  - **Apple, WWDC 2023 "Animate with springs":** smooth, snappy and bouncy
    presets.
  - **Vaul:** 500ms on cubic-bezier(0.32, 0.72, 0, 1). Closes past 25% of
    the drawer's height or on a flick faster than 400pt/s.
  - **Emil Kowalski, "Great Animations":** usually under 300ms, ease-out.
  - The first sheet bounced because its spring was at 84% damping, close to
    Apple's swipe value but wrong for a tap.

## Filter as a plain menu, tab bar spacing and drag (owner, 2026-10-12)

From the owner's phone review of `66d63d6`:

- **Your search is a plain menu,** not the ticket (Paper "Filters and Apply":
  "Your search as a plain menu", its dark version, and "a step as a plain
  menu"). The owner found the raised ticket odd in a sheet, especially in
  dark mode. Rows are on a flat gray card: Career stage, Pay from (Soon),
  Roles, Where, Visa sponsorship and Experience asked. Below them, Alerts
  and Hidden companies open their screens under You. The choice steps use
  the same flat card. The textured ticket stays special to the job page.
- **No "Alerts and companies" step.** Claude had added it, with a "These
  live under You" note, while building; it was never in Paper.
- **Steps cross-fade in place.** The sheet used to slide each step 20pt
  sideways while the content rode its top edge about 320pt up or down
  (measured from a recording); the owner saw it move back and forth.
- **Tab bar:** the selected icon stays an outline, in pink (the filled You
  icon looked off). Icons 56 apart (option A over 52) with the same 64 × 46
  oval. Press and slide: the oval follows the finger, the icon under it
  turns pink with a tick, and letting go opens that tab. Claude couldn't
  check Instagram's newest app, so the drag follows the iOS 26 tab bar.
- **After trying `1adfb11`:** the sheet's height morph between steps felt
  odd. A fixed-height push (`d1c01de`) wasn't it either; the owner wanted
  each step at its own size with the conventional slide, so choices push in
  from the right while the sheet eases to their height, both over 400ms. Tabs go Jobs, Tracker, Search, You; You is the user circle;
  the lit icon's stroke is 2pt (1.75 at rest) and Tracker's end dot fills.
- **Dark-mode pink:** measured identical to light (#EE5FAC on the Apply
  button and badges). It reads deeper on near-black. Lightening it for dark
  mode would put white text under 3:1, so it stays.

## Sheet steps, grab bar and Tracker (owner, 2026-10-13)

- **Research for the sheet steps:**
  - Apple's sheet guidelines say to include a grabber on a sheet you can
    drag. They also say people "expect to swipe vertically to dismiss a
    sheet instead of tapping a dismiss button".
  - Back "isn't intended to dismiss a sheet". Avoid showing Cancel, Done and
    Back together.
  - Ask before throwing away unsaved changes on a swipe.
  - Family's trays change height on purpose between steps. A public
    recreation (cult/ui's Family Drawer) resizes in 270ms on a sharp
    ease-out. It swaps content with a fade and a 96% scale over 150–270ms,
    with no slide.
  - Every version we'd tried resized over 400–500ms on the drawer curve,
    which lingers.
- **Decided:**
  - Steps change the Family way.
  - A grab bar replaces the ×.
  - On a step inside a sheet, Back sits at the bottom, left of Done. Both
    return to the menu, since picks apply as you tap.
  - Swiping away with unsaved changes asks first. The owner wants our own
    step, not the system action sheet. Proposed on Paper "Filters and
    Apply": "Save your changes?" with Save search, Discard changes and
    Back to keep editing.
- **Tracker:**
  - The finished state, assuming every backend feature exists, is drawn
    with fake data on Paper "Tracker · Oct 12".
  - Applications run: batch card, Needs you, then Offer, Interview, Screen,
    Applied, Saved and Closed (superseded by the kit page below).
  - Outreach runs Follow-up due, Waiting, Replied.
  - How to filter or organize the list (for example, to see only Saved) is
    being discussed.
- **Today:** still planned for later, once background applying ships. It's
  already drawn as "28 · Today tab" on Batch 3. When it arrives, Needs you
  and the batch card move there.
- **Then the cross-fade didn't land either.** A lab in the redesign kit
  (You → Kit → Redesign kit → Sheet transitions) put five versions side by
  side: each step its own card, a second sheet on top, push and resize,
  push at one height, and the cross-fade. The owner picked each step its
  own card: the step slides in from the right at its own height as the
  menu slides off left, 400ms on the drawer curve.

## Today and Tracker on the kit (owner, 2026-10-13)

The Paper page "Today and Tracker · Oct 13" (superseded boards moved to "Archive · Today and Tracker explorations · Oct 13"); every part comes
from the Parts board on the System page. The first drafts ("Tracker · Oct 13
· Now and pipeline") used the Oct 11 row and stay as an archive.

- **The moment.** Today: a few minutes in the morning; "did anything
  happen, and what do I owe?" Tracker: "where does everything stand?"
- **Decided:**
  - Four tabs: Today, Jobs, Tracker, You.
  - Today owns now: the batch card first while a batch runs, the numbers
    card (Since yesterday), Needs you, What changed, Coming up. The Today
    tab's badge is the Needs-you count. A quiet day says "Nothing new since
    yesterday." and keeps Coming up.
  - Tracker owns everything: Applications and Outreach segments, then chips
    that filter the applications: All, Saved, Applied, Assessment,
    Interviewing, Offer, Closed, in the order an application moves. All
    shows every group with its first rows; a chip shows that stage alone,
    grouped by time (Overnight, This week, Earlier), so hundreds of
    applications never make one long list.
  - Needs you is on Today only. Tracker has no Needs-you chip.
  - One row everywhere, the 84 kit row; a verb on line two is Medium.
  - Section counts sit after the label; the stage ring is drawn at 1.75;
    Saved is the bookmark.
  - The Coming up date tile shows the month over the day (40×48,
    Founders), the Events page's two-line tile, with the weekday on line
    one and the time trailing.
- **Calls to veto:**
  - The count tile ("6 applied overnight", "9 new jobs") sits in the logo
    slot in Untitled Medium 17; it could take the date tile's Founders 22.
  - The quiet Today keeps one "In Jobs" row pointing at the new jobs.
  - A stage chip's view groups by time; by company is the alternative.
  - Stage headers lead with their ring; Saved leads with the bookmark.
- **Next for the kit:** the count after the label, the ring at 1.75, the
  date tile, chips on Tracker, the Today tab.
- **Then, the feel (owner, 2026-10-13, late):** the kit drafts were right
  in structure but flat: every row weighed the same, pink was everywhere,
  and two grey boxes sat on top. "1b · Today · busy · Untitled headline"
  fixes that and was liked "a lot":
  - Line two of each Today row is the headline, Untitled Medium 17. A
    Founders version (1c) read smaller and heavier, so it was dropped.
  - Rows grow past 84 when they need to.
  - Pink only for Needs you. Pause is ink; What changed has no dots.
  - Auto-apply's results show two stacked logos, not a "6" tile.
  - The date tile is a 40 square, like the logos.
  - The Since-yesterday numbers card is off; options for it and for the
    Applying card are being drawn.

## Today on the current kit (owner, 2026-10-15)

Paper "Today · Oct 15": 1b brought onto Mist, the five-tab bar, the Ask
first card and the live bar.
- **T1, a morning with something to send:** Ask first is the only box,
  then Needs you, What changed and Coming up as plain rows with one
  headline each.
- **T2, while it sends:** the card gives way to the live bar above the tab
  bar.
- **T3, a quiet day:** no statement at all (owner: "Nothing new" was too
  bold and not needed); "12 new jobs today", then Coming up.
- **T4, the first day:** the kit's empty state (Browse jobs, Track one
  from an email).
- **The tab bar has no names** (owner, same day): the lit tab is the 64
  oval with its pink icon, so five tabs are 298 wide and fit any iPhone.
- **At release** (T1r, T3r): follow-ups wait for Outreach, so Coming up
  holds only dated steps from applications, interviews and assessments.

## Report a job (owner, 2026-10-15)

Paper "Report · Oct 15", approved. Replaces `ReportSheet.tsx` (a reason
dropdown and a details form).
- From the job page's ••• menu, a sheet: "What's wrong with it?", then one
  white group of choices: It's closed, The details are wrong, It's listed
  twice, The apply link doesn't work, Something else (the existing report
  types). Send is grey until one is picked.
- Picking one shows a note field under the group, asking what fits the
  reason ("Which details?"); the note is optional. Send turns pink.
- Sent: the sheet closes and the toast says "Report sent".
- **"It's closed" also takes the job out of your Jobs**, as hiding it does
  (owner).

## Auto-apply settings (owner, 2026-10-15)

Paper "Auto-apply settings · Oct 15". Opened from the Auto-apply row in
You (it says Soon today). Drawn for Pro; what Free sees comes with the Pro
moments round.
- **Picked: A, settings rows**, the established pattern, like Alerts:
  - **Mode:** Ask first (with its time chip, 8:00 AM, "Pick from a list
    each morning."), Automatic (grey, "Sends as jobs post. Coming soon."),
    Off.
  - **Which jobs:** Matches (Strong only), Posted in the last (3 days),
    A day (Up to 10), At one company (3 a month), each opening the iPhone's
    menu in place; then Hidden companies.
  - **What it sends:** Resume and Answers, then one Footnote: it never
    answers visa or work-status questions, and a job waits for you when it
    doesn't know an answer.
  - **Pause** asks how long (a day, a week, two weeks) and resumes by
    itself; Off stays off. While paused, a card leads the page ("Paused
    until Wed, Oct 22 · No lists until then") with a grey Resume.
- **B, one sentence you edit in place,** is kept as an option, not built.
- **Following a company** isn't built (the company page says "Follow ·
  Soon"), so there's no "only companies I follow" rule yet. The owner
  wants Alerts to offer "only companies I follow" too; both are decided in
  the Outreach round, with Follow itself.

## Errors (owner, 2026-10-15)

Paper "Errors · Oct 15", from [the research](errors-research-2026-10-15.md).
Approved; rules in design-system.md under "Empty and error states".
- **1 · Nothing to show:** W1 Jobs offline (no button), W2 Tracker didn't
  load (grey Try again, "Your applications are safe"), W3 a closed job (its
  ticket stamped CLOSED, "More jobs at Mercury"), W4 a broken link (RETURN
  TO SENDER, "Go to Jobs"), W5 Pinkslip down at launch (BACK SOON / ON IT).
- **2 · Something on screen:** P1 the Offline pill, P2 the refresh toast,
  P3 "Couldn't load more · Try again" at the list's end (today it's a
  toast), P4 a sheet that didn't load.
- **3 · Didn't go through:** A1 Save undoes and toasts, A2 a message that
  didn't send keeps its words, F1 a wrong link in a card with the fix, F2
  a PDF that couldn't be read (Choose another file, Fill it in myself).
- **4 · First:** K1 "Sign in again" with the sign-in buttons, K2 alerts off
  in Settings as one card above the rows, K3 a version too old (NEW
  EDITION, Update).
- **Owner:** no "we" or "us" anywhere. The email setup sheet still says
  "What should Gmail send us?" and "A Gmail filter we write for you"; fix
  those when this is built.

## Sign in on the kit (2026-10-15)

Paper "Sign in · Oct 15". Asked when it matters, in sheets (Sheets A) over
the page you were on; Apple and Google finish in the system's own sheets.
- **S1, the ask:** the title says why ("Save your jobs"; "Welcome back"
  from "I have an account"). Apple is black, Google white with a 1pt
  outline (their brand rules), email gray. One line of terms.
- **S2, email;** then **S3a, new** (the iPhone's strong password, the yellow
  field, Create account, "Email me a code instead") or **S3b, back** (your
  password, Sign in, "Forgot it? Email me a code").
- **S4, the code:** six white boxes that send on the last digit; Back and
  "Send it again" share the bottom row.
- **S5, one alerts ask** after the first sign-in only: a sample
  notification, Turn on alerts, Not now. **S6:** back on the job, saved.
- **Errors** ("Sign in · when it goes wrong"): not an email, the email uses
  Apple (a note and the Apple button), wrong password, too many tries (a
  code instead), a password under 8 characters, a wrong code (all six boxes
  ring red, then clear), an expired code (gray digits, Send a new code),
  Apple or Google not finishing, and offline. Nothing typed is lost.
- Text buttons are `ink` Medium (round 1 had them pink).
- **Parked (owner, same day):** it needs work, and the owner will come back
  to it; it isn't the most important thing. Don't build it yet.

## Applying for you and the weekly slip (owner, 2026-10-13, late)

On Paper "Today and Tracker · Oct 13" (superseded boards moved to "Archive · Today and Tracker explorations · Oct 13"), rows A to T.

- **Applying for you:**
  - **Picked:** A3, the queue as logos. Today shows A3; every other tab shows A4, a slim live bar above the tab bar (C3); both open one sheet with Now, Up next and Applied (C2).
  - **A batch longer than the strip** (C1): done ones fold into "✓ 5" on the left, the rest into "+3" on the right, and the current one keeps its ring.
  - **Sheet rows:** every row has a time on the right: when it will go, or when it went. "5 more" lines up with the row text.
- **The summary:**
  - The daily numbers card is off.
  - **A weekly paper object on Mondays is liked:** the carbon-copy slip (D1), and the time card (D3). The receipt is out ("Pinkslip isn't a grocery store"), and so is the monospace (Founders Grotesk Mono, from the receipt).
  - Variations to pick from:
    - E1 · While you were out
    - E2 · Triplicate form
    - E3 · Memo
    - E4 · One big number with a carbon ghost
    - T1 · Classic time card, days down the side
    - T2 · Punched holes
    - T3 · Clock stamps
    - T4 · In the rack
- **Research and inspiration:**
  - **The pink "While You Were Out" pad:** pink stock so a message stands out on a desk, an Urgent box, and checkboxes such as "Wants to see you".
  - **NCR carbonless sets:** the triplicate is white, canary, then pink, so the pink copy is the last one, the one you keep.
  - **Time cards:** they run seven days, with paired in and out columns and a total.
  - **Flighty's Passport:** shows stats as an official document.
  - **Wallet and airline passes:** small caps labels over big values.
  - **pushr and Alta:** show the week as day pills or columns.
  - Sources:
    - [Quill message pads](https://www.quill.com/quill-while-you-were-out-pads/cbs/010858.html)
    - [4over4 NCR forms](https://4over4.com/printing/Carbonless-Forms)
    - [Carbonless copy paper](https://en.wikipedia.org/wiki/Carbonless_copy_paper)
    - Mobbin: [Flighty passport](https://mobbin.com/screens/5ae29fe8-e962-43a0-a716-79153607252e), [pushr week](https://mobbin.com/screens/bd1913f9-cb73-4126-9c41-fb92dfe61b97), [Apple Wallet pass](https://mobbin.com/screens/fe3800b2-59af-4229-9412-115dcb51c881)
- **Calls to veto:**
  - These slips put pink paper on Today once a week, an exception to "pink only for Needs you" for the brand's own object.
  - The time-card stamps use a violet ink that isn't a token.

## Decisions, 2026-10-13 (night)

- **The weekly report is a popup, not a card on Today:**
  - It shows on Monday's first open and is swiped away (W1, with E1 inside).
  - Which design goes in it is still open: E1 to E4 or T1 to T4.
- **"Save your changes?" is approved** (Paper "Filters and Apply · Oct 12"): our own step when an edited search is swiped away.
  - The first drawing was off-axis: a round back button pushed Save right while Discard stayed centered, it offered three ways out, and red sat under pink. Redrawn as D2 (two equal buttons) and D3 (stacked).
  - **Picked: D3** (owner, 2026-10-13): Save search, then Discard changes in ink, no back. Swiping the question away or tapping behind it returns to the edits. Built.
- **Push soon.** TestFlight builds never set EXPO_PUBLIC_REDESIGN, so testers keep today's app. The bundled Klim trial fonts ship in the binary either way.
- **Proposed and drawn, waiting on the owner:**
  - **C1b:** A3 without the "Applying for you" line, in two sizes (17 for the headline, 15 for the rest).
  - **TR1 and TR2:** Tracker in the new feel. TR1 makes the job title the headline; TR2 makes the company the headline, because most titles read "Software Engineer, New Grad". Outreach came out of both once it was decided not to be a place.
  - **Picked: TR2b** (owner, 2026-10-13). TR2 with the type made deliberate: the time drops from 17 to Subhead `ink-3` on the company's baseline, one time format (hours, then the date), no dots, and the role in `ink-2`, so the company is the only dark line. "Tracker row · four ways" holds the other headlines (title, Jobs row, status).

## Where things live, decided (owner, 2026-10-13, night)

- **Tabs: Today · Jobs · Tracker · You.**
  - **Today** is the one-minute answer: Needs you, What changed, Coming up.
  - **Tracker** is the record: applications by stage, with no Outreach chip.
  - **Outreach is actions, not a place:** follow-ups due and replies show up in Today, and the people you've contacted show up on each company and application page.
- **Applying for you is A4 everywhere,** Today included: one slim live bar, which opens the queue sheet (C2). A3's logo strip is dropped as too busy. Variations to pick from:
  - A4a · a dark island, like the Live Activity
  - A4b · light and floating
  - A4c · a ticket with a stub
  - **Picked: A4b** (owner, 2026-10-13). Light and floating, the bar fills from the left as the batch goes, and there's a round pause button.
  - **Its mark is the robot** (owner, 2026-10-13): a company logo in a pill looked wrong, so the badge holds auto-apply's own icon. Tried: paper plane, pen nib, signature, stamp, the slips, the robot ("A4b · auto-apply icon options").
- **The weekly report is tabled.** People hear about interviews by email, not from the app, so a recap should lead with what only Pinkslip knows (auto-apply's work, which applications went quiet, follow-ups due). Back to it later.

## Tracker, built (owner, 2026-10-13)

- **Built from "Tracker · what we build now (TR2c)":** chips for All and
  each stage that has applications, then each stage's latest three under a
  header that opens it. A stage on its own splits into This week and
  Earlier. Rows open the job; long-press moves one to another stage or
  removes it. Stats opens a sheet that says it's coming soon.
- **"See all" was dropped** (owner: "it looks really strange"). The stage
  header is the way in.
- **Line three's goal** is the next thing that happens, from email and
  auto-apply ("Closes Fri · $140–170K", "Due Oct 15 · about 60 min",
  "Interview Oct 16 · from an email", "Offer · reply by Oct 20"). It stays
  on Paper as "Tracker · the goal". Pay could come first: job listings
  already have it.
- **Needs the applications backend deployed.** Production doesn't serve
  `/applications` yet (worker 602a03d and migration 0089 are on main, not
  deployed), so Tracker shows "Tracker didn't load" there. The redesign
  kit's "Tracker with sample data" shows it full.

## The application page (owner, 2026-10-13, late)

On "Today and Tracker · Oct 13": the page is the job page with what happened
added, so the two feel like one place.
- **With a next step:** the header, the ticket torn (you've applied), "Next"
  as a Coming up row (the date tile, "Thursday · 11:00 AM", "Interview"),
  then the timeline (each stage with its mark and date, the current one in
  Medium), then the posting. The bar is Next step and Change stage.
- **Nothing scheduled:** no Next section.
- **Change stage:** the stages with their marks, endings in their own group;
  tapping one moves it and closes the sheet.
- **Next step:** what (Interview, Assessment due, Reply to an offer by,
  Follow up), the date and time, Save; Remove next step when editing.
- No notes. Tapping a Tracker row opens this page.
- **The ticket stays** (owner): a pink carbon copy was drawn as the
  alternative and set aside.

### Five ideas (2026-10-13, night)

On "Application page · ideas · Oct 13", each drawing the same application.
Researched trip and delivery tracking (Flighty, Blue Apron, Ro, Delta's bag
status, Shop), no job apps.
- A · the job page plus what happened (above); B · the countdown (days to
  the next step, or since you applied); C · your stub (the stub that tore
  off, stamped with each step); D · the thread (newest first, each step's
  source); E · two sides (Application and Posting under a segmented control).
- **The owner likes C** and is deciding. Drawn for it: just applied (one
  stamp, "15 days, no reply yet"), and the Next step sheet over it.
- **Outreach, decided (owner):** company-scoped, not per role, because cold
  emails rarely name one. "You reached out" sits under the stub for contact
  with anyone at the company from about two weeks before applying through
  the application's life; every open application there shows it. Not a
  stamp. A due follow-up goes to Today. Tapping the person opens their page:
  the emails (sent, scheduled, the last one only if no reply), then your
  applications at that company, and "They replied" in the bar.
- **Next step and Change stage are one button** (owner, 2026-10-14): the
  two asked for the same news twice. The bar is Change stage alone. Applied
  and endings move and close; Assessment, Interviewing and Offer slide on to
  their date ("When's the interview?", the calendar and a time, Save or
  Skip). The date shows as the Next row under the stub; tap it to change or
  clear it. A dated stage without one shows "Add the interview date". Drawn
  as "C · 1" to "C · 4". The backend needs one date per application, kept
  with its stage and cleared when the stage changes.

### The application page, built (2026-10-14)

- `ApplicationPage.tsx`, at `applications/[applicationId]` in the Tracker
  tab. Tracker rows past Saved open it; Saved rows open the job page.
- The stub (`Stub`), the Next row (`DateTile`) or "Add the … date", About
  the role, and one Change stage button, gray (owner: the pink fill was too
  much for a page you come back to check). The tab bar steps aside, as on
  the job page.
- Change stage: the stages with their 20pt marks; Applied, Saved and the
  endings move and close; Assessment, Interviewing and Offer move, then ask
  for their date (iOS's own calendar; a time for an interview only), Save or
  Skip. The Next row reopens it, with Remove date.
- "Not right?" asks "Back to Applied?" with the email's subject, then undoes
  the email's step.
- ⋯: Add a hear-back date (Applied), Open the posting, Remove from Tracker.
- Samples for the kit at `applications/sample-interview`, `sample-applied`
  and `sample-no-date` (You → Kit → Redesign kit), so the simulator's
  signed-in account is never touched.
- Needs the server change (`stage_date`, migration 0091) deployed before
  dates save in production.

## You (owner, 2026-10-14)

Paper page "You · Oct 14". Five takes on the tab (A plain, B your name
first, C what's-working tiles, D your slip, E the punch card first), then
every page under it.

- **The tab is B:** your name and email on top (it opens Account), then
  Your search, Email tracking, Alerts; Resume, Answers, Tailoring (coming
  soon); Auto-apply and Outreach (soon, as in Take A); Plan, Appearance,
  Help and feedback; Admin and Kit for admins; the version line. Hidden
  companies stays in Your search, which links it.
- **Pages picked:** Resume A, sections as rows (the page-preview B waits
  until after release). Answers B, what's missing first (how the missing
  ones are shown gets another pass). Appearance A, three choices. Help and
  feedback, Tailoring and Hidden companies as drawn. Account as drawn.
- **Alerts:** B, how often with a preview. "Once a day" takes a time you
  pick. Both need server work: alerts are only on or off today.
- **Row icons (owner):** soft tiles, fainter, colored by meaning (B4):
  blue finds jobs (Your search, Email tracking, Alerts), green is what you
  apply with (Resume, Answers, Tailoring), pink is Pro (Plan, Auto-apply,
  Outreach, now one group, as X and Structured group what's paid), gray is
  the app and admin. Tiles are lighter than the gray card so they read.
- **Copy icon (owner):** D, our own: two squares with soft corners of the
  same radius, at the 1.75 stroke. Replaces Phosphor Copy in `CopyField`.
- **Alerts' time:** ink on a white chip; pink on gray was too faint.
- **Plan (owner):** C, numbers first: what's left this week fills from the
  left and empties from the right; Pro is a pink card whose See Pro opens
  the billing sheet (the same sheet serves the paywall when an allowance
  runs out). E is the page once you're on Pro. The Pro card is the soft
  one (pale pink, pink "Pro"), for now: the owner expects to rebuild Plan
  later and wants Plan A and B (Free and Pro side by side) kept to come
  back to.
- **Appearance (owner):** the iPhone's menu opens from its row; no page.
- **Alerts (owner):** "Application changes", "When an email moves one to a
  new stage".
- **Email tracking copy (owner):** the steps written for Outlook, iCloud and
  school mail, and the waiting states, stand for now.
- **Invite code:** drawn with onboarding, later.
- **Built (2026-10-14):** You (B4) with the Appearance menu, Account,
  Alerts, Help and feedback, Hidden companies, Tailoring, and Plan C, its
  Pro sheet and E, in `features/redesign/you`. Samples in the redesign kit:
  You, Account signed in, Alerts with every option, Hidden companies, Plan
  Free and Pro. Liberties, for the owner to veto:
  - Plan, Auto-apply and Outreach say Soon on the live tab, since Pro
    isn't sold; Plan C and E open from the kit's You sample.
  - Alerts shows only what the server does today (as they post, or off).
    Once a day at a time and Application changes appear when it sends by
    kind and on a schedule; the kit sample has them. The preview follows
    the choice ("3 new jobs · now" as they post) and hides when off.
  - Resume and Answers still open today's screens: Resume A's sections and
    Answers B's editors aren't drawn yet.
  - A guest's name card reads Guest · Sign in to sync and opens today's
    sign-in page; Account for guests isn't drawn yet.
  - Account changes the name in the iPhone's prompt; Help's Request a
    company asks for the name the same way.
  - Hidden companies shows no "Hidden Oct 9" line: the server doesn't
    keep when a company was hidden.
  - The disabled Send is gray, as the kit's buttons are, not faded pink.

## Resume and Answers editors (round 1, 2026-10-14)

Paper page "Resume and Answers editors · Oct 14". What's behind Resume A's
rows and Answers B's, drawn from the kit's settings rows.

- **Resume:** Experience as rows with company logos (R1a) or as a settings
  card (R1b); a job's page with labels above each value (R2a) or on the
  left (R2b), dates as white chips that open an inline month wheel (R3),
  "I work here now" in place of an end date, and bullets as their own rows
  with "Add a line"; Contact (R4) and a school (R5, the degree a menu, a
  second major added in place) in the same form; Skills as chips under
  each group (R6); importing a PDF ends on "Use this resume?" with what was
  found (R7). Projects follow the job page; certifications and awards
  follow Skills. Entries sort by date, so there's no reordering.
- **Answers:** each answer opens a sheet titled with its row: a choice
  saves on tap (A1), a choice can carry a follow-up (A2, hybrid's days), a
  month is the wheel with Save (A3), a typed answer shows how often forms
  ask (A4), and a question one company asked keeps its wording and who
  asked (A5). Take B (A6) answers in place inside the card instead. A new
  group, "From your applications", holds answers given on one form.
  "Forget this answer" or "Leave it to me each time" sit under each sheet.
- **Picks (owner, second pass):** R1a (rows with logos), now with a
  chevron on each row; R2a, labels above, where an empty field shows its
  label in place and the label shrinks up once you type (R2c); the month
  wheel (R3); Contact (R4); the school page (R5), titled "School". A role's
  page is titled "Role" (it covers clubs as well as jobs). No reordering
  and no hint about it: entries keep date order. Lines between fields stay.
- **Page actions are pinned** (owner): Add experience, Add a group, and
  Help's Send sit in a bar pinned to the bottom, white with a line above, as
  the job page's Apply does; the tab bar steps aside on those pages.
- **Add chips:** dashed, matching the empty date tile: 1.5 stroke in
  `ink-4`, 5 on and 4 off, round ends. Paper's default 1pt dash read as
  dots.
- **Answers (owner):** simple answers open the iPhone's menu from the row,
  as Appearance does (A7): relocation Yes, No, Ask me each time; days in
  an office Remote only, Hybrid up to 1–4, In the office, Any of these;
  pronouns with Other… and Prefer not to say. Dates open the inline wheel.
  Salary and written answers keep the sheet; salary picks "a year" or "an
  hour". "Answer for me" waits for the apply flow (it needs the job, and
  it costs per answer). A1–A3 and A6 are kept, marked replaced.
- **Dark tiles (owner):** D2, quieter tiles and icons ("Dark tiles ·
  options" on the You page), after the first ones read too bright.
- **Pinned bars (owner):** no line above the bar unless the page's content
  scrolls under it.
- **Collapsing title:** drawn on "T · The title collapses as you scroll":
  scrolled, the big title slides under the bar and returns small beside
  Back, and rows fade under the bar. Explained to the owner; not yet
  picked.

## Swipe actions on Jobs (round 1, 2026-10-14)

The owner found swiping rows "really wonky"; the recording and its causes
are in [swipe-actions-review-2026-10-14.md](swipe-actions-review-2026-10-14.md).
Paper "Swipe actions · Oct 14" has three takes, all colored: S1 the gap
fills with the action's color (Mail), S2 today's capsule fixed and colored,
S3 two buttons a side that stay open (Save and Applied right, More and
Hide left). Save is pink, Hide graphite, Applied green.

The owner likes S2 with two circles on at least one side, wants the green
toned to our scheme, and wants Read or unread and Save among two to four
actions. Drawn as S4: right is Save (outer, all the way) and Read; left is
Hide (outer) and Applied, in the meaning colors (pink, the tiles' blue and
green, graphite). **Picked and built (owner):** S4; all the way
still runs the outer action. No collapsing title (owner).

## In-app browser (owner, 2026-10-12)

The Paper page "In-app browser · Oct 12".

- **Every Apply opens the posting in our browser,** with or without assisted
  fill, so tracking works the same way for everyone.
- **Top bar:** close; the site with a lock under "Apply at …"; a ⋯ menu
  with Open in Safari, Copy link, Share and Reload.
- **Knowing you applied:**
  - When we see the job board's confirmation page, a toast says "Applied
    to Stripe. It's in Tracker", with Undo.
  - Otherwise, closing the browser asks "Did you apply?".
- **Decided (owner, 2026-10-13):** no permanent "I applied" button. A
  strip, "Did that go through? · I applied", shows only when a submit
  couldn't be confirmed. The fill bar keeps its arrows, and "2 need you"
  also jumps to the next blank. Web back and forward were dropped.
- **Only applications are read** (the owner sees no other work for now; my
  recommendation). Careers sites, event sign-ups and guides can open in the
  same browser without being read. Event sign-ups are the
  likeliest to gain from it later (marking you registered).

## Next

- **Tracker and Today** from the kit page above, then You. Tracker stages need an API to
  move an application between stages (the applications table already has
  Applied, Screen, Interview, Offer, Rejected and Ghosted).

### Toast round (2026-10-14)

The owner asked to redo the toast; the old kit's doesn't fit the system.
Paper "Toast · Oct 14": T1 a capsule over the tab bar in its glass, with a
three-deep stack like Sonner and Base UI (recommended); T2 drops from under the
Dynamic Island; T3 Undo in the folded row. Undo and Try again are 32 round
icons. Toasts only for what left the screen, what happened elsewhere and what
didn't work; the calls to cut are in `docs/toast-review-2026-10-14.md`.
**Picked and built (owner):** T1, with the countdown ring around Undo at
2pt in the first light gray (`ink-3`); the owner tried a darker one and
went back.

### Account's long email and the Appearance menu (2026-10-14)

- **E3 (owner):** a long address was cut off as a value; now the address
  is the row, whole, with "Signed in with Apple" under it (Paper "Account ·
  a long email"). The "Signed in with" row is gone.
- **Appearance:** iOS 26 grows a menu out of its trigger, so the whole row
  vanished when it opened. The trigger is now a clear layer over the row's
  right side showing only the value, so the value goes into the menu, the
  menu opens by it, and the tile and title stay.

### Tab bar: shrinking and labels (2026-10-14)

- **Shrinks on scroll (owner, built):** scrolling a list down shrinks the
  pill to 84% towards the bottom edge; scrolling up, the top of the list, a
  touch on the bar or a new tab bring it back.
- **Labels (Paper "Tab bar labels · Oct 14"):** L1 put a label under every
  icon; L2 has only the lit tab say its name beside its icon, in pink, in a
  wider oval. The owner tried L2 on the phone and picked it. Small, the bar drops the
  name and keeps the 64 oval.
- **You:** Admin and Kit moved to the top, under the person card (owner).
  They stay gray: the tile colors say what a row is for, and these rows are
  behind the scenes.

## Onboarding and sign-in, round 1 (2026-10-14)

Paper "Onboarding · Oct 14". Owner calls before drawing: jobs first (no
account to browse), no invite code, ask only level, role and location;
sign-in is Apple, Google, and email with a password (iPhone's strong
password) plus a six-digit code for signing in without one or resetting it.
No magic link, no LinkedIn. The audience is new grads through mid-career,
not students.

- **Welcome lines** W1–W7; my pick W2, "Less searching. More interviews."
- **O2 · One question at a time:** welcome with the pink slip, then level
  (list with checks), role (chips), where (Remote switch, city chips, the
  dashed Another city chip), a payoff where the slip is stamped "142
  MATCHES", then Jobs with a Keep this search card.
- **O1 · Straight in:** no welcome; the app opens on today's jobs with one
  sheet (Level, Role, Where as menu rows, each its own step), then an
  inline alerts card; saving a job asks for an account.
- **O3 · Fill in the slip:** the welcome is a pink slip with one sentence
  and three blanks ("I'm after ___ jobs in ___ ___"); a blank opens its
  sheet; the full slip is stamped and opens Jobs.
- **Sign in:** one sheet (Welcome back / Save it for later) with the three
  buttons; email, then make a password or enter yours; the code step; one
  ask for alerts after the first sign-in, with a preview notification.

## Onboarding, round 2 (2026-10-14)

Paper "Onboarding · round 2 · Oct 14". The owner didn't love round 1, then
set the brief: sell what Pinkslip does for someone's life, not its features.
"2,431 new jobs this week" read as intimidating. The owner's own story is
the pitch: they stopped checking every other board, check one app, apply as
jobs appear, and get on with their day. Every direction keeps the questions
to three taps (level, role, where) on one kit sheet, with no counts.

- **N1 · Close the other tabs:** a wall of the companies hiring. Each answer
  quietly dims the ones that don't fit, and the last screen is your
  companies, lit ("You're set").
- **N2 · A Tuesday morning:** the welcome is a lock screen with three
  Pinkslip notifications (a job posted now, a recruiter's reply, a nudge to
  follow up) under "Job hunting, in the background." The questions slide up
  over it. The last screen asks for notifications, the step that makes the
  picture real.
- **N3 · A second job:** dark, told in two beats. First a pile of
  spreadsheets, tabs, auto-reply emails and sticky notes ("Job hunting is a
  second job."), which folds into one glowing pink slip ("Let's make it a
  small one."). After the questions comes "Off your plate.", four
  struck-through chores.
- **Welcome lines** L1–L7, all about the after. Any line fits any direction.
- The live-preview and swipe-to-teach ideas were dropped as feature-led.
- The audit moved the sheet chips to the kit's 32 Chip and the titles to
  Large Title 34. Gaps are on the 4/8/12/16/24 grid.

## Onboarding, round 3 (2026-10-14)

The owner asked for real research before more drawing; it's in
`docs/onboarding-research-2026-10-14.md`. Paper "Onboarding · round 3 · Oct 14":

- **R3 · A second job, made small** (seven frames, timing notes under each).
  - The hook: the job-hunt mess lands card by card, with a spreadsheet, 14
    tabs, a sticky note, an auto-reply, a password error, a stale posting
    and 47 applied for 2 replies. It sits under "Job hunting is a second
    job.", and the button is the punchline, "Let's make it a small one".
  - **The owner loves the hook.** It's one screen where round 2 had two.
  - Everything after it (the logo slip with stamps, then a "Making it small"
    list) fell apart.
- **After the tap · two ways**, replacing everything after the tap, without
  the logo:
  - **A · Lights on.** The cards fly off and the app opens from the button.
    Level, role and where sit in a sheet over the real feed, which fills in
    as you answer.
  - **B · The slip as a form.** The mess squares up into a full-size pink
    slip ("Your job hunt", No. 0412) with Level, Role and Where fields.
    Each answer is stamped in with room to spare, then you pull the stub to
    tear it off into Jobs.
  - Both end on the Jobs tab with nothing to fill in. The account,
    notifications and Pro are asked later, in context.
- **The playable version:** the "Onboarding Motion Lab" artifact plays the
  hook and the first after-tap version (the one the owner said fell apart).
  It gets updated once the owner picks A or B.
- Logo: the carbon-copy mark (Paper "The mark", A) replaces the old
  two-slip mark everywhere.
- **Picked (owner, 2026-10-14): A · Lights on.** "This is the direction to go in for sure."
  - Still to do: the speed and smoothness of the motion, which pieces of mess get thrown, and a better tagline.
- **Picked (owner, 2026-10-14):** tagline T4, "You've done enough job hunting." with the button "Let us take it from here".
  - The seven-card mess: spreadsheet, 38 tabs, follow-up sticky, blank cold email, "Why do you want to work here?", a post 30+ days old with 200+ applicants, and "47 applied · 2 replies" last.
  - Next: an "Off your plate" list after the tap, where each thrown card becomes the help that replaces it.
- **Page two (owner, 2026-10-14):** the owner wants a full page, not a sheet. It reads "Here's what we'll take off your plate." with six items. Each has a 40 tile (blue finds, green applies, pink Pro), a title and one short line:
  1. Every job in one feed.
  2. New jobs first.
  3. Applications track themselves.
  4. Answers you type once.
  5. A nudge to follow up.
  6. Recruiter emails, written (Pro).
  - The items land straight and calm, as a mirror of the mess.
  - "Find my jobs" slides it away to the feed and the questions.
  - Paper board "A · the flow with Off your plate"; the lab is version 3.
  - Liberty for the owner's veto: a 40/24 tile here, not the kit's 28/18 settings tile.
- **Page two, P2-C (2026-10-14):** after owner feedback it reads "From here, we've got it." with "Let's go" (alternative: "I'm ready").
  - Six we/you lines, in the meaning colors with no tiles; Pro marked:
    1. We find every job.
    2. You see them first.
    3. We apply for you (Pro, "You say yes, we send it").
    4. We track every application.
    5. We remind you to follow up.
    6. We write the cold emails (Pro).
  - The icons are Phosphor Regular at 28.
  - The owner rejected the filled tiles as Bootstrap-looking.
  - Parked as good enough for now; revisit later.

## Apply flow (Paper "Apply flow · Oct 14")

Scope and decisions: `apply-flow-scope-2026-10-14.md`.

- **Board 1, the Apply button's states:** Apply, Apply for me (Pro, with
  "Apply myself" in its menu), Queued, Applying (the button fills as the
  form does), Answer 2 questions to finish, Sent · waiting, Applied, and
  Interviewing · View in Tracker.
- **Board 2, the in-app browser and fill bar:** filling, two need you,
  answering with saved answers, all filled, confirmed (T1 toast), and
  "Did that go through?".
- **Board 3, Ask first:**
  - 3.1: Today, with the Ask first card.
  - 3.2: the review is a page, not a sheet. There's no subtext and no
    guardrails, and only jobs that need something are labeled.
  - 3.3: one job's "what we'll send".
  - 3.4: select on Jobs, which ships later.
- **Board 4, while it runs:**
  - 4.1: the live bar above the tab bar.
  - 4.2: the queue (Now, Up next, Sent with Confirmed or Sent).
  - 4.3: the bar's states (sending, paused, needs you with Answer, done).
  - 4.4: the Lock Screen Live Activity, with one solid bar and Pause.
  - 4.5: the Dynamic Island (compact, minimal, expanded).
  - Owner: no segments and no green beside pink. Progress is one solid
    bar, in ink on the Lock Screen and white in the island (rings too).
  - Section headers in sheets line up with the rows' content, 16 in. This
    awaits the owner's word before the kit rule changes.
- **Board 5, Needs you:** only the job with a question waits; the rest
  keep going.
  - 5.1: one notification per question, above the Live Activity.
  - 5.2: the question sheet, with the saved answer and Answer for me
    above the keyboard, and "Send to Notion".
  - 5.3: the queue with Needs you on top, in pink.
  - 5.4: left unanswered, it waits in Today's Needs you.
- **Board 6, after: proof it went through:**
  - 6.1: the stub stamps APPLIED once the board or its email confirms it.
    Its foot reads "Sent by Pinkslip" and links to What we sent. Change
    stage is gray.
  - 6.2: until then the stamp is SENT, dashed, "Waiting for Ramp".
  - 6.3: What we sent (W3, owner 2026-10-15): proof as a quiet log,
    newest first, small grey dots and only the latest step in ink; the
    resume as a file row; each answer with its question small above it.
    No ticks. The other takes are on "What we sent · three takes".
- **On Mist (2026-10-15):** the boards follow the surface decision. Groups
  on a page are white cards (Ask first, the review); sheets are Mist with
  white groups and fields (Sheets A: the queue, a job's preview, the
  answer); chips that are off are outlined.
- **Bot mark (owner, 2026-10-14): B2**, drawn by us, replaces Phosphor
  Robot (Paper "Bot icon · options"). Phosphor stays; Lucide was ruled out
  as overused.
