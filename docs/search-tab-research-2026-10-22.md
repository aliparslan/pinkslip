# Search tab: field at the bottom (research, 2026-10-22)

The owner wants Search to open the keyboard with the field at the bottom,
and an X beside it that goes back to the page you were on. This replaces
the Oct 19 call (field under the title) in
[design-system.md](design-system.md). That call came after the Oct 16
version, where the tab bar folded into a circle holding the tab you came
from beside a bottom field; the owner found it took the bar over.

## What Apple says

[HIG, Search fields](https://developer.apple.com/design/human-interface-guidelines/search-fields),
"Search as a tab", names two kinds:

- **Standard tab:** a landing page with the field at the top, for
  discovery (Apple TV's genres and categories).
- **Button appearance:** tapping the tab focuses the field and brings up the
  keyboard with the field above it. It's "a more transient experience that
  brings people directly back to their previous tab after they exit
  search", for when search should resolve quickly.

The owner's ask is the second one. Pinkslip's Search is a quick lookup (a
company, a role), and Jobs is where discovery happens, so it fits.

SwiftUI ships the same thing as
[`tabViewSearchActivation(.searchTabSelection)`](https://developer.apple.com/documentation/swiftui/tabsearchactivation):
selecting the tab activates search, and dismissing it reselects the tab you
were on.

The same page also says:

- Search as people type, refining as the words get longer (Search already
  does, debounced).
- Show recent searches before anything is typed (Search already does).
- Put the most relevant results first and group them (companies, then
  jobs, as now).
- Search at the bottom keeps it easy to reach whenever search is the
  priority.

## What it means for the design

- The X is the way out, so it has to read as "leave", not "clear". The
  field keeps its own clear button for the words.
- When the keyboard drops (scrolling the results), the field and X stay at
  the bottom where the bar was, so the way out never moves.
- Leaving goes to the tab you came from, with no page in between.

Sources: Apple HIG "Search fields" (read in full); Apple's
`TabSearchActivation.searchTabSelection` reference; WWDC26 session 292 on
search entry points (from its transcript summary only).
