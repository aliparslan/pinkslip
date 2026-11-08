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

## Drawn in Paper, for the owner to pick

1. **Today for a new user.** "Get set up" holds Add your resume and Turn on
   alerts (the two things You shows as unfinished). Below it, "New for you"
   shows the top three matches and a "See all jobs" link. No illustration,
   nothing centred.
2. **Jobs.**
   - **Title first.** The title leads in Subhead and may wrap to two lines.
     Line two is "Company · Place · Pay". Rows grow with the title, so the
     84pt rows go.
   - **Identical postings become one row.** Apple's two "Cellular Power
     Optimization Software Engineer, Wireless Technologies & Ecosystems"
     postings are the same title in the same place with different pay
     bands. Wrapping the title can't tell them apart, so one row says
     "2 postings" and gives the combined pay.
   - **Chips are filled grey capsules,** like the search field and the
     filter button.
3. **You.**
   - **Sign in with Apple inside the guest card,** under "Your saves stay on
     this phone".
   - **Plain glyphs in `ink-2` instead of the tinted tiles.** This replaces
     the find/apply/pro tile colours on You only; Today's tiles stay.
   - **Outreach, Plan and Auto-apply move into a "Coming soon" group.**
     Their labels are dimmed and they have no chevrons. They stay as
     roadmap signals.

Each is a change to an approved design, so nothing is built until the owner
picks.
