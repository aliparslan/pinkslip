# Lo-fi wireframes (2026-10-11)

Step 3 of the sequence in [redesign-2026-10.md](redesign-2026-10.md), built
against the approved [brief](redesign-brief.md).

**Paper file:** [Pinkslip · Redesign wireframes](https://app.paper.design/file/01M4PHGHP6STZ6E2GH8TBPYZD5),
page "Lo-fi · Jobs · Tracker · You".

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

These are on the pages "Take A · Quiet" and "Take B · More paper" in the same
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
    and the header collapses (drawn on the "Job row density" page).
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
  Pro and National 2 on the Paper page "Type pairings").
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
- **Job rows** (Paper page "Job rows · Oct 12"): the owner found titles too
  heavy and the unread dot out of line. Options:
  - Today: 17 medium, wrapping titles, a 32 logo and the dot on the title line.
  - A · Compact: 15 medium on one line, a 40 logo that exactly spans the two
    text lines, and the dot centred on the logo. Fixed 64pt rows, 7 visible.
  - B · Calm: 17 regular, titles wrap to two lines, a 42 logo spanning the
    first two lines, and the dot centred on the logo.
- **Swipe actions** (Paper page "Swipe actions · Oct 12"): today's full pink
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

- **Job rows are A · Compact**, and every row is one line each: long titles
  end in "…" and the job page shows them in full. The logo is 40, a quarter
  radius (10), exactly the two 20pt lines. As in Mail, the unread dot starts on
  the 16 margin (level with the logo's centre) and the logo follows it, so
  nothing crosses the margin: text and separators start on the 84 line.
  - In review, switchable in the redesign kit (sheet:
    `docs/port-design/redesign-kit/unread-options-2026-10-12.png`): the dot;
    quiet (no mark, opened jobs step back to regular weight and lighter ink);
    a badge on the logo's top-right corner; a dot beside the age. All but the
    dot keep the logo on the 16 margin.
- **Swipes are A · Capsule:** the page stays put, a grey circle grows from
  the row's edge and turns into an ink capsule with the label once letting go
  will act. One action per side.
- **The punch card got more physical:** the card has the ticket's paper
  texture, and a punched hole looks through to the shaded surface below
  (option C of four studies: darkest under the top edge, lifting toward the
  bottom; a faint lit lower lip in dark mode). Solid black was tried and
  dropped as too harsh (owner, 2026-10-12). The spots still to use stay pink
  outlines. A spot punched on screen presses in.
- **Paper texture:** the per-pixel noise read as static (it was also drawn
  at a third of the screen's resolution). `apps/native/scripts/paper-textures.py`
  makes seamless 256pt tiles from three layers of real paper (pulp clouds,
  fibres, a faint tooth) at full resolution. Cotton is the default; stock and
  recycled are in the kit to compare. Sheet:
  `docs/port-design/redesign-kit/paper-textures-2026-10-12.png`.
- **Icons:** SF Symbols on iOS and Phosphor Regular on the web, both from one
  table of ideas in `shared/icons.ts` (iOS fails to compile on a symbol that
  doesn't exist; a test checks the web names). Saved jobs use the bookmark;
  the stage ring is only for application stages.

## Next

- **Tracker** (replacing Library), then You.
