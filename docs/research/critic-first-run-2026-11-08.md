# The design critic's first run (2026-11-08)

This was the first pass of the fresh-context critic (directions D7) on three
current screens: Today for a new guest, Jobs, and You. It ran on the iPhone
17e simulator in light mode. The critic saw only the screenshots, so it
knows none of the owner's decisions. Each finding below is marked against
what has already been decided.

**Score: 6/10.** The critic named the aesthetic as calm, Apple-native and
Things-like. What holds the score down: a stock empty state on Today, feed
rows that don't lead with the job title, and a tab bar that looks like
glass without the blur to match.

## Findings, checked against what's decided

1. **Today for a new user is a stock empty state.** It has a centred grey
   illustration, a headline, a pill button and a link, with dead space
   under the title. The skeleton card reads as "loading". "Track one from
   an email" doesn't look tappable. The critic's alternative: a short
   setup list ("Add a resume", "Turn on alerts") and the top three new
   matches. *Open.* This matches the owner's own Oct 13 note ("Today was
   grey and boring").
2. **Job rows lead with the company, not the title.** Titles truncate
   while "Apple" gets a whole line. "New grad" repeats on every row of a
   new-grad feed. Two Apple postings differ only by pay. *Partly decided.*
   The row's order came from Paper. Dropping the repeated level is
   polish-pass item 11, and the look-alike rows are item 12.
3. **Three signals mean "new"** (a dot, a darker age, a heavier title), and
   the dot pushes "5d" out of line with "4d". Section headers don't
   match: "Earlier this week 3" has a count and "Older" has none. *Open,
   small, concrete.*
4. **The tab bar.** The blur is too weak: rows read clearly through it.
   It has five icon-only tabs. The Tracker glyph is hard to guess. Search
   duplicates Jobs' search field. *Partly decided.* The bar's shape was
   the owner's pick (Paper, Oct 12). How strong the blur is remains open.
5. **The You list.** The tile colours look arbitrary. The pink tiles
   compete with the accent. "Soon" rows look like live ones. The guest
   card hides sign-in behind a chevron. The critic also flagged Kit as an
   internal tool; Kit shows only on development and owner builds, so that
   one is moot. *Open:* the tile style, and how Soon rows look (they stay;
   they're roadmap signals). The guest card's sign-in is open too.
6. **Two pinks; white on pink is about 3:1. Outlined chips beside filled
   controls.** *Pinks: decided.* White on the pink fill is the owner's
   Oct 12 choice, Increase Contrast swaps in a deeper pink, and the deeper
   magenta exists so pink text passes 4.5:1. *Chips: open.*

The critic couldn't judge larger Dynamic Type from stills. It pointed to
the two-line rows and You's values as where it would break first.

Worth keeping, per the critic: the large titles with the date above
Today, the inset dividers, the dense meta line with salary, and You's
plain trailing values.

## What this run says about the critic

It found the issues the polish pass found (items 11 and 12) and two new
concrete ones (3 and the tab bar's blur) in one pass, without the repo.
It also re-raised two settled decisions (white on pink, Kit), as expected
of a reviewer who doesn't know them. Read its findings against
`directions.md` before acting on any.
