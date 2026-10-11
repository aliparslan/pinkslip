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
  - The label gets a count ("Locations · 6").
  - The place that matches your saved search comes first, at full size, with
    a check.
  - The rest go on a quieter line: "San Francisco, Seattle, Austin and
    3 more", with a chevron.
  - Tapping that line opens a sheet with every place. Matches come first and
    are marked "Your search"; the rest follow in the posting's order.
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

## Next

- **Dark mode** for Take A.
- **Then** the iOS tokens and kit, then the screens.
