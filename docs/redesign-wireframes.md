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
- **The applied stamp** sits in the location row's empty half, so it covers no
  facts.

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
  - **The stamp:** real ink, with patchy coverage, roughened edges and a
    slight tilt. It sits in the location row's empty half and covers no
    facts.
  - **The ticket:** faint paper grain, the perforation drawn as punched holes
    (the screen colour showing through), and a slight lift off the page.
  - **The stub tear:** on Apply, the stamp comes down, the stub tears along
    the holes and drops into the Tracker tab, and the tab's count goes up by
    one. Each step gets a haptic.
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
  - Dark mode for these objects is still open.

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
  - Every stamp is the inked one.
  - Every ticket has grain, punched perforation and a slight lift.
  - The Plan page uses the punch card.

## Next

- **The iOS tokens and kit** for Take A, in light and dark.
- **Then the screens:** Jobs and the job page first, then Tracker (replacing
  Library), then You.
