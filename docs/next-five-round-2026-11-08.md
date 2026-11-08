# The next five: the Paper round (Nov 8)

You said "Do 1 2 3 4 5": Tracker rows moving, one haptics rule, a designed
first load, a share extension, and the website. Paper page **"Tracker moves,
first load, link card · Nov 8"** holds the three that are drawn. The other
two are written up for your call. Nothing here is built until you OK it,
except the website's job data and preloading (no design in them), which are
committed and not deployed.

| # | What | Where it stands |
| --- | --- | --- |
| 1 | A moved application glides to its new stage | Board 1 |
| 2 | One haptics rule | [haptics-rule-2026-11-08.md](haptics-rule-2026-11-08.md): the rule and seven changes |
| 3 | New jobs arrive as new | Board 2 |
| 4 | "Track in Pinkslip" | [share-extension-scope-2026-11-08.md](share-extension-scope-2026-11-08.md): three calls before drawing |
| 5 | The website | Board 3 (a card per shared job); `dbb5517` (job data Google reads, pages load on hover) |

## 1 · A moved application glides to its new stage

- **Today:** a stage moved from Tracker's long-press menu changes once the
  server answers: the row is gone from one stage and in the other in one
  frame.
- **Proposed:** it moves as you pick it. Once iOS has put the row back from
  its menu, it glides to its new place in 320ms on the app's ease-out while
  the rows between make room, and each stage's count rolls the way it
  changed (down for Applied 5 to 4, up for Interviewing 1 to 2). The next row
  under All rises in. Moves made elsewhere are already in place when you come
  back.
- **Build:** Tracker's list updates at once when you pick (today it waits
  for the server, then refetches), and FlashList 2.0.2's layout animation
  (`prepareForLayoutAnimationRender`) moves the rows. Behind a kit switch.

## 3 · New jobs arrive as new

Checked while drawing: Jobs already opens on the list it kept on the phone
(the cache lasts a week and is dropped on an app update), so the grey
placeholders only show on a first launch or after an update.

- **Proposed:** one entrance that means new. With a list kept, postings that
  are new since you looked rise in at the top, 30ms apart, while the rows
  below slide down. With nothing kept, the placeholders take the rows' exact
  shape (64pt rows, empty white tiles, inset separators, a bar for the
  header) and each row rises in over its own. A refresh, a chip or a search
  swaps rows with no entrance. Built behind a kit switch beside a plain
  150ms fade, so you can feel which is better.
- **Found:** today's placeholders are the old 84pt three-line rows, taller
  than Jobs' rows since they became title-first; they jump when the jobs
  come. The board's shape fixes that either way.

## 5 · A card for each shared job

**Your previews:** I checked them with Apple's own preview engine, on this
Mac and in the simulator with Pinkslip installed. A job shared from its page
previews fully, in 1 to 2 seconds. Sharing from an application sent
"Company: Title" beside the job board's link, and Messages sends text plus a
link as plain text, with no preview. That's fixed in `7b9d50e`: an
application now shares its job's Pinkslip page as a bare link. If previews
still don't show after the next update, tell me where you shared from.

- **Proposed:** each job gets its own card. Messages already shows the page's
  title under it, so the card carries what the title can't: the pay, large,
  then the place and level, beside the company's tile. With no pay, the place
  leads. Three fields: A pale pink, B dark (like the card you sent), C
  Pinkslip pink with white type. Shown in light and dark chats.
- **Words:** the page title becomes "Ramp · Software Engineer, New Grad", and
  the description "New grad · New York · $150–180K".
- **Build:** the Worker draws a card the first time it's asked for and keeps
  it. A web deploy, with your go-ahead.

## What the design critic said

**Pass 1: 6/10** (boards 7, 6, 6). Fixed:

- The glide now starts once the menu has put the row back, so it's one path.
- Counts roll the way they change; the moving row has no shadow.
- Board 2's placeholders didn't match the rows (84pt, no header); they now
  do, and each row resolves over its own.
- The card spent its biggest type on the title the caption already shows. It
  now leads with the pay, and isn't white.

**Pass 2: 7/10** (7, 7, 6). Fixed:

- Frame 2 of board 1 had its rows at different points on the curve, and the
  Interviewing header 9pt high. Every row is now at 65%, and the header
  stays put.
- The fill fading and the time changing to Now are on the timeline.
- Notion now rises in as rows do on Jobs: one entrance for a row.
- Board 2: one timing bar per row, white placeholder tiles, and the cached
  list (the critic's idea, and what the app already does).
- Board 3: light and dark chats, the no-pay card, larger facts, the mark top
  right (none on pink), and a neutral tile instead of a logo that read as
  Vercel.

**Pass 3: 7/10** (7, 6, 7), the last of three. Left for you:

- **Board 1:**
  - Interviewing's count rolls while the moving row covers it, so you never
    see 1 become 2. The critic would roll it only once the row has landed
    (about 250 to 400ms). I'd take that in the build.
  - A move to a stage below the screen's edge glides out of view with
    nothing to say where it went. The critic suggests "Moved to Closed ·
    Undo" above the tab bar. That's new UI, so it's your call.
  - It wants "Today" rather than "Now" for a row moved today; that's the
    Tracker row's existing rule, so unchanged.
- **Board 2:**
  - The kept-list case (new postings rising in above ones you've seen) is
    described but not drawn; the frames show the first-launch case.
  - On a first launch, the critic would use the plain fade for every row, so
    the rise only ever means new. I agree.
  - Each placeholder should go the moment its row starts, not fade under
    it, and the header should fade in with row 1. Once placeholders show,
    they stay at least 300ms so they never flash.
- **Board 3:**
  - It reads the tile top left and mark top right as the stock link-preview
    layout, and would drop that row: C, with the pay half as big again, and
    the logo inline with the place only when there's a real one.
  - With no pay, it would lead with what the job is ("Summer 2027
    internship") rather than the place.
  - "New grad" on the card repeats "New Grad" in the title under it.
  - It picks C: the only one that holds in both chats. It wants C tried
    with real coloured logos before deciding.

## After your picks (Nov 8)

- **The link card is black** (B), with the company's tile on top, the
  position as the biggest thing, and the pay and place on one line under it,
  ending in a small Pinkslip mark (Paper board 4; the mark moved from top
  right, where it competed with the company's logo). Deployed: web
  `ae981e02`, then the mark's move. Built: the web Worker draws each job's card at
  `/og/jobs/:id.png` and keeps it at the edge for a day; job pages point at
  it, and their share text is "Ramp · $150–180K · New York". Not deployed.
  The trial display font lacks "$", "–", "·", "(", "&" and "/", so the facts
  line is Inter, and a title word with that punctuation falls back to Inter
  SemiBold until the full licence is in. The public catalog has no level,
  so the line is pay and place.
- **The old flat slips are gone** from the website (sidebar, tab icon,
  badge, the default preview, which is now black too); the mark is the app
  icon's carbon copy (`public/brand`).

## Your calls

1. **Board 1:** build as drawn, with Interviewing's count rolling after the
   row lands? And the "Moved to … · Undo" line for moves off screen: yes or
   no?
2. **Board 2:** the rise only for postings new since you looked, and a plain
   fade on a first launch?
4. **Haptics:** the rule and its seven changes.
5. **Share extension:** the three calls in its scope doc.
