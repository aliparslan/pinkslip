# Consistency audit (iPhone redesign), 2026-10-19

The owner flagged three things: Search's header stays put while no other
tab's does, the job page's Back, share and ⋯ are see-through, and You's pages
don't use the header the rest of the app does. They asked for a deeper look
for other inconsistencies. This covers what's built in `apps/native` with the
redesign on, checked in code and on the simulator.

## Fixed in this pass (each broke a rule already in `design-system.md`)

1. **Search's title stayed pinned.** It sat outside the list; every other
   tab's title scrolls with the page. It now scrolls, in the recent searches
   and in results.
2. **Jobs' and Search's titles sat 40pt higher than Today's, Tracker's and
   You's.** Rule: "Large title: 8 under the 44 nav row on every tab, so
   titles line up across tabs." Both now have the 44 row (empty, as on
   You).
3. **The job page's, application page's and event page's top controls were
   see-through.** They float over the page but used `fill`, the grey meant
   for buttons that sit on it. Rule: what floats is the floating material
   (glass on iOS 26, as the tab bar and toasts). New `ui/Floating.tsx`:
   `Floating` (Liquid Glass, white with the pill's shadow before iOS 26) and
   `TopEdgeFade` (the page's colour fading out under the bar, so text no
   longer runs under the clock and the buttons).

## The header decision

**Decided (owner, 2026-10-19): A, with no title in the bar.** Built as
`ui/PageBar.tsx` on every pushed page; see `design-system.md`, "A pushed
page's top".

The options as they were put:

What's built today, four ways:

| Where | What you see | Sticks? |
| --- | --- | --- |
| Tab roots (Today, Jobs, Tracker, Search, You) | No bar; Large Title 34 in the page under a 44 row | No (Search did; fixed) |
| You's pages (Resume, Account, Alerts, Answers, Help…), email pages, a person | Our grey round Back on the page, Title 1 (28) under it | No, Back scrolls away |
| Job, application, event | Our Back and share/⋯ floating over the page, no title | Yes |
| Company page, the kit's pages, job/application while loading | iOS's own bar: system Back (glass on iOS 26); the kit's show a centred title | Yes |

So three back buttons (grey on the page, floating, the system's), and two
title treatments (centred in a bar, big in the page).

**A. Our floating bar on every pushed page (recommended).** Back on the
left, a page's actions on the right, pinned and floating (the new
`Floating`: glass on iOS 26), the page fading out under them. The title stays
big in the page (Title 1, as You's pages and the company page already do) and
scrolls away. The company page, the kit's pages and loading states move to
it. Swipe-back still works (the stack is native).
- For: one look everywhere; it's already the job page's (Paper "Job page"),
  and You's pages keep their look apart from Back staying put; same on every
  iOS version; our Phosphor glyphs; actions sit in the bar.
- Against: our code, not the system's (one shared part, so small).

**B. iOS's own bar on every pushed page.** System Back and scroll-edge
effect; a small centred title appears in the bar once the big one scrolls
off.
- For: least code; exactly how iOS 26 apps look.
- Against: the system font and chevron, not ours; the job page's share/⋯
  pill and the ticket's top would need reworking; the centred title adds text
  (owner: less text); looks different before iOS 26.

**C. Nothing pinned.** You's pattern everywhere: Back scrolls away with the
page.
- For: simplest; the page is all content.
- Against: on long pages (a job's posting, Resume) getting back or sharing
  means scrolling up or swiping; the job page loses its pinned share/⋯.

Sub-question if A or B: should a small centred title fade into the bar once
the big title scrolls off? Recommendation: no, the page's own title and the
logo already say where you are, and it's less text.

## Other inconsistencies found

Ordered by how visible they are. "Paper first" marks ones that change a look,
so they get drawn and approved before code.

1. **Two kinds of sheet.** The job page's Locations list and Admin use the
   old kit's `Sheet` (iOS's full-height page sheet with a title and close
   button); everything else uses Pinkslip's own sheet (`ui/Sheet`: floats 8
   in, 40 corners, grab bar). Fix: move both to `SheetModal`. Paper first
   for Locations (a list in our sheet).
2. **Fixed with A.** **Loading pages show the system bar, then swap to ours.** A job or
   application that's still loading shows iOS's Back (`title: ""`), then the
   floating bar replaces it, so Back jumps. Fix with the header decision:
   the same bar while loading.
3. **Lists load two ways.** Jobs and the onboarding feed show placeholder rows
   (`RowPlaceholders`); a company's jobs, hidden companies, a job's emails
   and Alerts show a centred spinner. Fix: placeholder rows wherever rows
   will appear; a spinner only for a single thing (a posting's text).
4. **Empty-state copy.** Today and Job emails say "Nothing yet", Tracker says
   "Nothing here yet". Pick one (suggest "Nothing yet").
5. **"Soon" and "Coming soon".** You lists Outreach, Plan and Auto-apply as
   "Soon" (no chevron) but Tailoring as "Coming soon" with a chevron to its
   wrench page; Answers' wrench page is titled "Coming soon". The wrench
   pages stay (roadmap signals); the wording should match. Suggest "Soon"
   on rows, and the wrench pages titled by what's coming.
6. **A person's ⋯ menu has no icons.** Rule (Paper "Menus · Oct 16", M2):
   menus carry our Phosphor icons (`GlyphMenu`). `PersonPage` uses the old
   `Menu` for They replied / Don't follow up. Value pickers (Degree,
   Earliest start, Auto-apply's settings) using the system menu with ticks
   are fine; only action menus get icons.
7. **Rows run under the clock on every tab.** Scrolled, a tab's rows pass
   under the status bar with nothing behind it. A `TopEdgeFade` the status
   bar's height on each tab would match the pages that float a bar. Paper
   first.
8. **Fixed with A** (`features/kit/KitPage.tsx`). **Kit pages use the system bar with a centred title** (Redesign kit, Icon
   sets, Sheet transitions, Swipes, Kit). Only the owner sees them; they
   follow whichever header is picked.

Code hygiene (no visible change):

- 13 files import `toast` from the old `kit` (a re-export of `ui/Toast`);
  import it from `ui`.
- Old screens kept for the non-redesign build are still routed (Preferences,
  Tailor, the old Welcome onboarding); they're unreachable with the redesign
  on, so they go when the old build does.
