# Section headers, counts and the Today tab: research (Nov 8)

You said the little labels ("Needs you", "What changed", "Coming up", "Tools"
in Admin) could be much better, the counts look off, and Today needs
rethinking: what it's called and what icon it uses. This is what I read and
what it means here. Nothing is built.

## What ships today

- **The label:** Footnote 13 Medium `ink-2`. Pink only for Needs you.
- **The count:** Footnote 13 Regular `ink-3`, 6 after the label, on every
  screen and never at the far right (decided Oct 13).
- **The space:** 24 above, 4 below, 16 above when it's the first thing.
- **Where:** Today, Jobs, Tracker, Company, Search, Job emails, and as
  `ListGroup` headers in Admin, Alerts and Outreach settings.

**What's wrong with it, measured against the rows under it:**

1. **The label is the quietest thing in its section.** Rows lead with Body 17
   Medium in `ink`, and the label above them is 13 in a grey. A section title
   should be what your eye lands on when it skims, and here it's what it skips.
2. **The count is a second grey voice at the same size.** Two 13pt words in
   two nearly equal greys, 6 apart, read as one muddy phrase: "What changed 3".
   Nothing says the 3 is a different kind of thing.
3. **Most counts say nothing.** On Today you can see the three rows under
   "What changed". The number repeats what the screen shows. A count earns
   its place only when the rows don't show it: Tracker's All view (latest
   three of 142) and Jobs (a long list).
4. **One style does four jobs.** A call to action (Needs you), a stretch of
   time (New today), a category (Tools) and a door to a page (Applied ›) all
   look the same.

## How other apps do it

Looked at on Mobbin, Nov 8. Links open the screens.

| App | The label | The number |
| --- | --- | --- |
| [Linear](https://mobbin.com/screens/f8a9de1f-ef1c-45e6-8db3-9239bdd5c690) | 13ish Medium grey ("In Progress", "Todo") | None on the group. A plus at the far right |
| [Granola](https://mobbin.com/screens/978cd9f4-a931-4b41-8088-cbb7a5b2bf22) | 15 Regular grey ("Coming up", "Earlier today") | None |
| [Hevy](https://mobbin.com/screens/f4d2dd73-7a30-4a55-9229-fda8a1c7b39a) | 15 Regular grey ("Dashboard", "Workouts") | Puts it in the words: **2 hours** this week, bold then grey |
| [Copilot](https://mobbin.com/screens/ff5cb687-e8be-493b-b87d-07dd6016d7fe) | 15 Semibold `ink` ("Accounts"), with a small caret | Far right, as a tracked caps column heading |
| [Copilot, minor group](https://mobbin.com/screens/f1778c3a-ee4e-4bd7-960b-52db273f15d2) | Small tracked caps in grey ("EXCLUDED") | None |
| [Monzo](https://mobbin.com/screens/6c2bac17-2f8f-468d-bc8f-c77b4cf7ea5b) | 15 Semibold `ink` ("Today", "Yesterday") | A day's total at the far right, grey |
| [Todoist](https://mobbin.com/screens/fae19fe7-6408-49a0-b854-7df1e9d73e47) | 15 Semibold `ink` | After the label in grey, like ours, but the label is dark so the two differ |
| [Mimo](https://mobbin.com/screens/e57a9a4c-95b8-479c-9bef-b86f67c757e0) | 17 Bold `ink` ("Playgrounds") | None. An action at the far right ("See all") |
| [Zing](https://mobbin.com/screens/fb410967-4a62-4021-8aad-770e93a66bf8) | 20 Semibold `ink` ("Transactions") | None |
| [Mesh](https://mobbin.com/screens/cd90ba9a-a483-4f91-af85-1a61afcc3df1) | Small tracked caps in grey ("UPCOMING") | None |
| [Cursor's live activity](https://mobbin.com/screens/8069ba2d-155b-4529-af17-e639c1495751) | "Active" in grey | Leads: **1** Active |

**What repeats:**

- Nobody who's good pairs a small grey label with a small grey count.
  Either the label is dark and the count is grey (Todoist, Monzo, Copilot), or
  the label is grey and there's no count (Linear, Granola, Hevy).
- **Most leave the count off.** Eight of the eleven have no number beside
  the label. Lists show their own length.
- **Where a number stays, it's doing a job:** a total (Monzo), a column
  heading (Copilot), or the actual news, inside the words (Hevy, Cursor).
- **The apps you've said you like (Copilot, Hevy, Mimo) use a dark, heavier
  label** or a plain grey with no count. None does what we do.

## What the reading says

- **Caps are fine for short labels and need letterspacing.** Butterick: caps
  suit "less than one line" and "labels", and always add letterspacing
  ([Practical Typography](https://practicaltypography.com/all-caps.html)).
  The course notes agree, and warn that caps look amateur without it
  (`emil-design-foundations`). Caps carry a real cost: all-capitals words lose
  their shape, and they read slower.
- **Hierarchy comes from weight and contrast before size.** The course notes
  (`emil-typography`), and our own rule in `CLAUDE.md` (the ink ramp plus the
  weight ladder).
- **Changing numbers need tabular digits,** so a count doesn't nudge what's
  beside it (`emil-typography`).
- **Screen readers need the name with the number,** not a bare "3"
  (ServiceNow's badge guidance). `SectionHeader` only does this when it's
  pressable, so that's a small fix either way.
- **No usability study compares the styles.** I looked. What's above is what
  good apps do and what type people say, not measured results.

## Today: what it's called and its icon

**The tab bar has no names** (your call, Oct 15), so the icon carries the whole
meaning at a glance, and the name only appears as the page's title.

- **NN/g's finding** is that almost no icons are universal. Home, print and
  search are the exceptions, and an unlabelled icon gets misread
  ([Icon Usability](https://www.nngroup.com/articles/icon-usability/)). A sun
  isn't one of them, and the Oct 15 audit said so too (sun and path "don't
  explain themselves").
- **Tab names work best concrete.** Brent Simmons on Twitter's tabs: people
  learn tabs by tapping them, they respond to concrete words, and vague
  words say nothing ([inessential](https://inessential.com/2011/12/08/on_the_tab_labels_in_the_new_twitter_app.html)).
  He calls "Home" what you name a tab when you have no better idea.
- **Microsoft found the first tab's name barely matters if it's generic,**
  and chose "Home" because people already called it that
  ([Jensen Harris](https://learn.microsoft.com/en-us/archive/blogs/jensenh/theres-no-place-like-home)).
  That was the Office ribbon, so treat it lightly.
- **What others call this screen:** Noom and Todoist say
  [Today](https://mobbin.com/screens/8a44fa6e-f46b-4d33-b035-a7d7eab6fc4e),
  Linear says [Inbox](https://mobbin.com/screens/f97b18e7-5e86-42f2-85df-9e7a000fae0e),
  Hevy and Monzo say Home, Copilot says Dashboard, and Buddy says Overview.

**What Today actually holds:** what needs you, what changed since you looked,
and what's coming up. It answers "is anything happening?" That's closer to an
inbox than a day planner. The date isn't what it's about: it holds things from
days ago and interviews next week.

Options are on the Paper page for this round.

## The section header options

Paper page **"Section headers and counts · Nov 8"**: five real Today screens,
and under each the same header on Jobs, Tracker and an Admin card.

| | Style | Counts |
| --- | --- | --- |
| A | As it ships: 13 Medium `ink-2` | After the label, everywhere |
| B | Dark label: 15 Medium `ink` | None on Today. At the far right on Jobs and Tracker |
| C | Slip label: 11 Medium caps, tracked, `ink-2`, like a printed form | As B |
| D | Display: Founders Semibold 18 `ink` | As B |
| E | As B on Today | The number leads on Jobs and Tracker: "12 new today", "142 applied ›" |

B to E also drop the hairline under a section's last row and use 36 above a
header and 8 below it. D needs a new text style: the kit has nothing between
Body 17 and Title 2 22.

**The design critic: 7, 7, 7 out of 10 over three passes.** It picked D twice
and E once. What I fixed along the way: the count-free Today, the closing
hairlines, the 2:1 spacing, E's mixed weights, and D's size. Still open:

- **D's size.** The critic asked for 20, then 18, then 22. At 18 it only just
  outranks the rows, and at 22 it's four titles stacked on one screen. It's
  worth judging on the phone.
- **Two sizes.** It wants D on content screens and B's quieter size over
  settings cards, since "Tools" over a two-row card is too loud. I agree.
- **Tracker's stage ring.** It would drop the ring from the header, because
  the word already names the stage. The ring is an earlier decision of
  yours, so I left it. I tried it in the logo column, and the critic thinks
  that makes "Applied" read as the first row.
- **C.** It rejected the caps all three times as the stock settings-table
  look. I kept it on the board because it's the one idea tied to the paper
  world.

## The Today options

Paper page **"Today tab · name and icon · Nov 8"**: Today with the sun (what
ships), Today with a calendar showing the date, Inbox with a tray, Home with
a house, and Desk with a lamp, each selected and with the pink count.

**The design critic: 7, 7, 7 out of 10 over three passes.** It picked Today
with the sun, then Inbox, then Today with the sun. What it said by the end:

- **The sun** can read as brightness, and the count bites into its rays.
- **Calendar with the date:** the numeral is too small and competes with the
  count. It asked for this in pass 2 and rejected it in pass 3.
- **Sun on the horizon** was on the board for pass 2, where it rejected it
  because the count covers the dome. In pass 3 it recommended it again.
- **Inbox** doesn't cover Coming up, reads as email, and its tray is a box
  beside the briefcase.
- **Home** is the clearest icon and the emptiest word.
- **Desk** has the most personality and no icon that holds at 24pt: a desk
  read as a bench, and a lamp reads as a bell.

## The Tracker icon

Paper page **"Tracker icon · Nov 8"**: the finalists Stamp, Route and Stamped
slip, and round 1 beside them. The rejected list from Oct 12 wasn't repeated.

**The design critic: 6, 6, 6 out of 10 over three passes.** It picked Stamp
twice, then Stamped slip. Each finalist still has a fault it named: Stamp is
an action rather than a place and can read as a pawn, Route is busy at 24
and reads as a workflow tool, and Stamped slip's ring can read as a camera.

## Second look (Nov 8)

Your reactions: none of the Tracker finalists, D but with the alignment
fixed, and none of the new Today options, with the calendar closest.

- **D's alignment.** Stage headers had "Applied" on the row text column while
  every other header sat on the margin, numbers stopped at different right
  edges, and Tracker's number sat on a different baseline from Jobs'. Now
  every header starts on the margin, and every number ends on one right edge
  with room for the chevron, as values do in a settings card. The second
  version moves the ring beside the count.
- **Tracker.** Paper page "Tracker icon · wider look · Nov 8": 30 Phosphor
  icons and 3 drawn for Pinkslip. No app I looked at has a settled icon for
  this: orders use a box or a tray, and job apps don't have this tab.
- **Today.** On the Today page: 10 calendar variations, showing a one-digit
  and a two-digit date and the pink count, and 5 names. Google Calendar's
  plain square with a big numeral is what fixed the unreadable date.
- **Nothing at all on Today.** Today shows the first-day state only when you
  track nothing. If you track applications and nothing's happening, the
  screen is blank under the title. Three states are drawn: a smiling slip,
  a stamped ALL CLEAR, and just words.

The design critic hasn't seen this round. The header board already had its
three passes, and it's more useful on whichever ones you pick.

## Sources

- [Icon Usability, NN/g](https://www.nngroup.com/articles/icon-usability/)
- [On the Tab Labels in the New Twitter App, Brent Simmons](https://inessential.com/2011/12/08/on_the_tab_labels_in_the_new_twitter_app.html)
- [There's No Place Like Home, Jensen Harris](https://learn.microsoft.com/en-us/archive/blogs/jensenh/theres-no-place-like-home)
- [All caps, Butterick's Practical Typography](https://practicaltypography.com/all-caps.html)
- [Apple: headerProminence](https://developer.apple.com/documentation/swiftui/view/headerprominence(_:).md),
  which shows iOS itself offers a larger, bolder section header. Apple's
  Human Interface Guidelines pages wouldn't load in the browser, so I
  couldn't read what they say on list headers or tab labels.
- [ServiceNow badge guidance](https://horizon.servicenow.com/components/now-badge)
- Mobbin screens, linked in the table above.
