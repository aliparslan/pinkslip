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

## Next

- **You:** comment directly in Paper or tell me what to change.
- **Then the visual pass on these frames:** A's native structure with B's
  moments.
  - Klim display titles.
  - Mono metadata.
  - The facts panel as a paper ticket.
  - The stamp when you apply.
- **After that:** tokens and the iOS kit.
