# Critic fixes, Nov 8

These follow the design critic's first pass
([critic-first-run-2026-11-08.md](critic-first-run-2026-11-08.md)). The
owner said: "fix all of the things you just mentioned and show me before and
afters". Images are in `shots-2026-11-08/`; the Paper page is
**"Critic fixes · Nov 8"**.

## Built (main, local; not pushed or published)

| Fix | Before → after | Commit |
| --- | --- | --- |
| One sign that a job is new | A row you haven't opened used to show three signs: Medium weight, a darker age and a pink dot. Now it shows Medium weight only. The pink dot stays for Needs you. The ages line up in one column again. | 839f39a |
| The level a search implies | "New grad" no longer repeats on every row when your search is new grad only | 839f39a |
| A count on every section | "Older" gets its count from the Worker's new `meta.matching`. It shows once the Worker is deployed; until then it stays blank rather than wrong | 182b855, 839f39a |
| The tab bar's bottom edge | Rows that scroll under the pill go soft (`BottomEdgeBlur`) instead of reading clearly through the glass | 839f39a |
| Pre-redesign screens | Removed: 22 files, the switch between old and new, and the system tab bar | 2737cc0 |
| Tab switches | Three options to try in the kit (Still, Family, Shift) | 057e095 |

The sheet cross-fade (flow run 4.10) belongs to the other session's
"Motion fixes before 1.4.0" round, board 2. Its middle frame showed both
steps at once. It has been redrawn so the old step leaves in 100ms and the
new one arrives over 200ms, starting at 80ms.

## Drawn in Paper, for the owner to pick (pass 2)

The critic scored the first drawings 6/10. Pass 2 takes up the findings
that don't contradict an owner decision. Two of its findings stay as they
are because the owner decided them: the five-tab bar, with Search at the
bottom (Oct 12 and Oct 22), and a count on every section (Oct 13). One
it contradicted itself on: it first wanted filled chips to match the
search field, then said filled chips read as suggestions. The chips stay
outlined, as they are today.

1. **Today for a new user.**
   - "Get set up" has one strong step: Add your resume, with the only pink
     button on the screen.
   - Alerts is an inline switch.
   - "New grad jobs this week" lists only this week's jobs, in the same
     row as Jobs, then a "See all jobs" link.
   - Plain glyphs: the same style as You.
2. **Jobs.**
   - **Title first, on Today and Jobs alike.** The title can wrap to two
     lines, then Company · Place · Pay. Rows grow with the title, so the
     fixed 84pt rows go.
   - **Identical postings become one row.** Apple's two "Cellular Power
     Optimization Software Engineer, Wireless Technologies & Ecosystems"
     postings have the same title in the same place, with different pay
     bands. Wrapping can't tell them apart, so they become one row with
     the combined pay and "×2" in the trailing slot (VoiceOver: "2
     postings").
3. **You.**
   - **The guest card** is "Your saves stay on this phone" over Sign in with
     Apple. The placeholder avatar and "Guest" are gone.
   - **Plain glyphs in `ink-2`** in place of the tinted tiles.
   - **One quiet line** at the end, "Coming soon: Outreach, Plan and
     Auto-apply" with the wrench. It replaces three dimmed rows and keeps
     the roadmap signal.

Each is a change to an approved design (title-first rows and the plain
glyphs especially), so nothing is built until the owner picks.

## Pass 3, the last (6/10)

Pass 3 changes:
- Today leads with one statement, "3 new grad jobs this week", with setup
  folded into one row: "2 steps before Pinkslip can apply for you".
- The two Apple postings say "2 postings" in the meta line.
- Appearance gets its menu chevron.

The critic now gets a list of owner decisions not to re-raise (in CLAUDE.md
and the agent file). Its first two passes had spent themselves on settled
things: the tab bar, counts, white on pink, the pink dot and the avatar,
some of which it reversed between passes.

Left unfixed after three passes, for the owner:

1. **Today has two headline tiers that compete** ("Today", then the
   statement), and the page stops halfway down. Make the statement a
   section header, fill to the fold with more jobs, and end on a
   full-width "See all jobs" row.
2. **The setup row looks like the search field.** It also says "2 steps"
   without naming them. Make it a short checklist (Add your resume, Sign
   in), with the next step as the only pink.
3. **Today promises applying for you while You says Auto-apply is coming
   soon.** That's a product-truth question for the owner: which story
   ships in 1.4.0?
4. **Counts should count rows.** With the two postings as one row,
   "3" sits above two rows.
5. **Logos are drawn three ways**: inset with a hairline, full-bleed black,
   and a grey monogram. That ties in with the "Logos · square ones fill the
   tile" proposal on the System page.
6. **The guest card states a limitation, not a benefit.** Proposed: "Keep
   saves and alerts on every device". Also, "Resume · Add" puts a verb
   where the other rows have states; "None" fits better.
