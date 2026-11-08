# Signature moments: the Paper round (Nov 8)

Roadmap section 2's first two items
([design-roadmap-2026-11-07.md](design-roadmap-2026-11-07.md)), drawn on the
Paper page **"Signature moments · Nov 8"**, then built (see "Built").

## Built (Nov 8)

You said "Build both". Each moment is in the iOS app behind its own switch in
**Kit → Redesign kit → Motion fixes**: "A job grows out of its row", "SENT
on the live bar" and "OFFER, once". On is the proposal and the default, off
is what the app did before. JavaScript only, so it can go out as an update.

| Moment | Where | Checked in the simulator |
| --- | --- | --- |
| The zoom | `Link.Trigger withAppleZoom` on the rows in `JobsFeed.tsx` (Jobs, Search), `CompanyPage.tsx` and `TrackerScreen.tsx` | Jobs: opening, swiping down, and from the left edge. Tracker: no, it needs a signed-in Tracker |
| SENT on the bar | `LiveBar` in `apply-flow/WhileItRuns.tsx`, `LiveSends.tsx`, `ui/StampMark.tsx` | Yes, on Kit → Send states → "SENT lands as it goes" (tap Send it) |
| OFFER, once | `ui/Ticket.tsx` (`hero`), `ApplicationPage.tsx` | Yes, on Kit → Redesign kit → "Application with an offer" |

Where the build differs from the boards:

- **The page's header isn't the zoom's target.** As a target it hid the
  header's company and title, and it made iOS draw the page at about 1.6×
  mid-zoom. Without one, iOS grows the page out of the row at its own size,
  as the board drew it.
- **Under SENT, the old words go before the job comes in.** Out in 80ms,
  then in from 60ms over 140ms, so the two are never readable at once (the
  sheet steps' rule). The swap starts as SENT meets the bar.
- **A real send's bar shows the company's letter tile**, since a send
  doesn't carry the company's domain. Several sends read "3 applications"
  with "2 confirmed so far" under it, beside the robot.
- **OFFER on the stub carries its date alone** ("NOV 8", not "NOV 8 ·
  EMAIL"). With the email mark it was so wide that the other stamps wrapped
  onto two rows. The foot's "Not right?" still shows when an email moved it.
- **OFFER waits for the page to finish arriving**, then 300ms. Counting from
  when the page appeared made it land mid-slide.
- **Every new stamp on a stub now keeps the one before it inked until it
  lands**, not just OFFER. Before, the old one greyed as the new one
  started.
- **SENT and OFFER land with the success haptic.** The stub's other stamps
  keep their light tap.
- **Not checked:** a real send (dry runs only), VoiceOver's Dismiss action,
  and Reduce Motion (the stamps appear in place with the tap; the zoom
  becomes iOS's own).

## 1 · A job grows out of its row

- **Today:** the job page slides in from the right, like any page.
- **Proposed:** iOS 18's own zoom, as Photos and the App Store open things.
  - The page starts at about 0.7× with its header in the row's place, then
    grows to full screen. The row becomes the page's header.
  - The frames are drawn at +30, +160 and +420ms on that spring. Jobs dims a
    little behind it, and the tab bar fades and drops by about 240ms. The
    in-between shapes are the system's; the boards draw them approximately.
  - **Back** is drawn too. Swipe down anywhere, or in from the left edge,
    and the page follows your finger, shrinking. Let go and it shrinks into
    its row, where the row's highlight fades. Let go early and it springs
    back to full.
- **Where:** Jobs, Search and a company's jobs open jobs this way. Tracker
  opens applications this way. On iOS 17 the slide stays.
- **Build:** Expo Router 57's `Link.AppleZoom` on the row and
  `Link.AppleZoomTarget` on the page's header. It's the system's spring,
  about 420ms, with nothing of ours to tune. JavaScript only, so it ships as
  an update.

## 2 · The stamp lands where you are

It's the stub's own press: 160ms, speeding up into the paper, then a success
tap and a small dip as it meets the paper. It starts larger here than on
the stub (1.12×), because it lands where you weren't looking.

- **A send goes out while you're elsewhere.** SENT comes down from 1.3×
  onto the live bar, which dips 2pt as it lands. The bar still leaves after
  4 seconds.
  - "Sending to Ramp" stays until the stamp lands, so the stamp brings the
    news.
  - Under it, the bar becomes the job. The job's logo leads, the role is
    the label ("Software Engineer", then "Ramp"), and SENT sits at the end,
    undated, so the verb is said once.
  - The green check and the X go. You swipe the bar away, or let it leave.
    VoiceOver gets a Dismiss action, and the 4 seconds wait while VoiceOver
    is on the bar.
- **Offer, once.** The first time you open an application after its offer
  arrives:
  - The page settles for 300ms. Then OFFER comes down from 1.4× and lands
    across the tear, over INTERVIEWING's corner like a second impression.
    It's 1.5× the size of the other stamps and turned a little more, so it
    reads as the one that matters.
  - The stamp before it greys, as on the stub today.
  - The ticket dips 1pt. It never plays again for that application.

## Your calls

1. **The bar's done state changes.** It drops today's green check and the
   X, and the job's logo replaces the robot once the stamp lands. An
   earlier take kept the X with a small SENT where the robot was. The
   critic called it a badge for its own sake, so it's off the board. Say if
   you want it back.
2. **OFFER in green, and larger.** Colour is only on stage marks today,
   never on text. An offer is the rarest, best moment, so it's the one
   exception proposed. It also stays 1.5× on that stub afterwards. Say if it
   should stay ink, or the stub's size.
3. **Today's rows** keep the slide for now, since they open different kinds
   of pages. They can zoom too if you like it on Jobs.
4. **Liberties:**
   - The larger starting sizes (1.3× and 1.4× against the stub's 1.12×).
   - The 2pt and 1pt dips on contact.
   - The shadow under a stamp in the air.

Left out on purpose, as the roadmap says: confetti, sound, and anything on
Save, swipes or every step.

## What the design critic said

**Pass 1: 6/10.** The in-between frames didn't show the motion. Fixed:

- The zoom's middle frames were an inset card at full size. They're now
  full width, with the page part-way in size and its edges pushing out from
  the row, plus a new +60ms frame.
- Going back wasn't drawn. It's now a row of its own.
- The tab bar and the dim were too strong in the middle frame.
- The stamps in the air were the landed size. They're now larger, clear and
  shadowed, with a contact frame.
- B confirmed the send twice (check plus SENT) and sat in the sequence as
  a fourth step in time. It's now the sequence, with A set apart.
- OFFER was a small box third in a row. It's now the hero, across the tear.
- The timing bars couldn't show a spring or a press. They're now curves
  with the frames and the impacts marked.

**Pass 2: 6/10.** Several frames contradicted their captions. Fixed:

- The +60ms "lifts out of the row" frame showed nothing lifting. It's now
  +30ms, with the page's header appearing in the row's place, barely bigger
  than the row.
- "Let go" was a copy of an opening frame. It now continues from the drag:
  the same offset, heading for the row.
- The springing-back ghost ran through the text. It's gone; a small arrow
  above the card shows the direction, and the drag arrow starts at the
  finger.
- Save and Apply were missing from the moving page (the image of it was
  cropped). Every in-flight frame keeps the home indicator.
- The bar showed the job before SENT landed. It now keeps "Sending to Ramp"
  until impact. SENT is undated and larger. Take A is dropped.
- OFFER missed INTERVIEWING by about 5pt, which looked accidental. It now
  overlaps its corner.

**Pass 3: 7/10**, the last of three. What still holds it there, left for
you:

- **Where the zoom starts.** It wants no 0.7× start: draw the first frame
  at 1× clipped to the row's exact rectangle, with the logo tile as the
  shared element, and the row's title fading out as the header's fades in.
  That may be closer to what iOS does with a full-width row. It's the
  system's geometry either way, so the build will show which.
- **One moving page, both ways.** Jobs should dim by the same amount at the
  same progress opening and closing. The tab bar should be fully gone
  before the home indicator crosses it. The card's corners should square
  off as it lands in the row.
- **SENT reads like a trailing button** where it sits at the bar's end. It
  would let the stamp bleed past the bar's top edge, and change the bar's
  words a beat earlier (about +100ms) so the stamp lands on a settled bar.
  It would also show sending as a 2pt line along the bar's bottom, instead
  of today's fill, and keep the pause button until the words change.
- **In the air reads as faded**, since pale already means "older" on the
  stub. It wants a wider, softer shadow that closes to nothing on impact.
- **Board layout:**
  - Draw "springs back" as a fork off the drag frame.
  - Put a touch dot on the tap frame too.
  - Give SENT and OFFER their own timing lanes.
  - Trim the bottom columns to what the frames can't show.
- **Missing states:**
  - Swiping down while the page is scrolled (it scrolls to the top
    first).
  - Reduce Motion. Planned: the zoom becomes iOS's own cross-fade, and the
    stamps appear in place with only the tap. That isn't drawn.

Not changed, by its account or mine:

- **Grey labels on the facts card** and the board's small frame corners
  are the job page and the wireframe style everywhere else.

- **The stub's older stamps** are the kit's sizes (13/11) and turn `ink-3`,
  as the app does. They read small only at screenshot scale.
- **"Apple ›" against "Plaid"**: the job page links the company and the
  application page doesn't, in the app today. Making applications link the
  company is a separate call.
- **A recording at 0.25×** isn't possible before it's built. Once you pick,
  both go behind Kit switches like the motion fixes, so you feel them on
  the phone first.
