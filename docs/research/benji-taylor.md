# Benji Taylor's writing, against Pinkslip

Benji Taylor founded Family, the iOS wallet both of Emil's courses hold up
as the fluid interface to learn from (it was bought by Aave). He led
design at Base, and his X profile now says head of design at X and SpaceX
SI (Nov 2026). The owner shared his posts on 2026-11-07. Notes are in my
own words, with what each post means here. Directions are collected in
[directions.md](directions.md).

## Learning from Family without copying it

The owner asked on Nov 8 whether this leans on Family too much. The line:

- **Take Family's principles.** Things go where they will live. The rarer
  the moment, the more delight it can carry. A label morphs instead of
  being swapped. Nothing that persists is redrawn.
- **Don't take its signature moves.** That means its trays and its exact
  text morph, its easter eggs (the QR ripple, the trash can), and its
  look.
- **Keep Pinkslip's own signature.** Paper, tickets, stubs, stamps and
  punch cards. Family has nothing like them, and they are the part worth
  protecting.

Generic patterns that Family happens to use, such as a tab switch that
slides, are fair to try. Judge them against iOS's own apps, not against
Family.

## Family Values (Jul 2024)

Family is built on three principles: simplicity (reveal things only as they
become relevant), fluidity (no static transitions), and delight (in the
right places). The parts that apply to Pinkslip's sheets, buttons and rare
moments:

**Trays** are Family's sheets, and they follow fixed rules:

- Each next tray is a different height, so the step change can't be
  missed. Copy gets rewritten to make that true.
- Every tray has a title and one icon. On the first tray the icon closes
  it; on later trays it goes back.
- One tray holds one thing: one explanation, or one action.
- A tray takes on its context's theme: dark inside a dark flow.
- Trays are for passing actions (confirmations, warnings). A tray can
  open a flow that becomes full screen.
- A tray keeps you where you were. An approval rises out of the swap
  screen itself instead of replacing it.

Pinkslip's Apply and Send sheets already step with a direction (`Sheet`
tracks forward or back). What's missing is the height change between steps,
and the close icon turning into back. Directions A2 and B4.

**Fluidity**:

- **Every animation explains where you went.** Moving from A to B should
  show the path.
- **Tab switches move in the tab's direction.** This differs from iOS's
  own tab bars, which don't animate. It's a question for the owner, not a
  rule here, because Pinkslip matches iOS motion.
- **A label that changes morphs through its shared letters.** "Continue"
  becomes "Confirm" by animating only the letters that differ, so the user
  notices the step that matters.
- **Counts roll** instead of jumping.
- **Nothing that persists gets redrawn.** A card that stays on screen
  travels to its next place instead of being duplicated or cross-faded.
- **A pending item flies to where it will live.** After a send, the
  spinner moves into the tab that holds pending activity.

Pinkslip already does this in its own way. The torn stub falls into the
job page's pinned Apply bar, which then says Applied, so the stub lands
where the state now lives. (My first notes said it fell away; it doesn't.)

**Delight** follows frequency. The less often a feature is used, the more
delight it can carry. The most-used flows get only small touches; in
Family's send flow, the commas slide into place as you type. Polish has to
be even across the app, because one neglected screen ("the dirty
bathroom") lowers the whole. This matches the motion notes' "speed for
what's used all day", and the roadmap's Offer moment.

Family uses confetti and sound. Pinkslip's roadmap leaves both out on
purpose, and that still holds.

## Honkish (May 2025)

A love letter to Honk, the real-time messaging app Benji made before
Family. It had no send button and no history: you watched every keystroke
live. Relevant here:

- **The colour of a surface says how serious an action is.** A
  destructive tray turned red.
- **In-app notices showed a draining border** while they stayed up.
  Pinkslip's toast already has this (`Countdown` in `Toast.tsx`).
- **Some friction was deliberate.** Users signed their name before
  chatting with strangers, and it cut bad behaviour. It's the same idea as
  Pinkslip's Ask first before a send.
- **Sound and custom type** gave Honk its personality, with sounds
  composed to the timing of each interaction.
- His footnote: record videos of a product while it is still alive.
  Pinkslip's App Store preview and screenshots need that anyway.

## Morphing icons with Claude (Jan 2026)

Every icon is three SVG lines, so any icon can become any other. Unused
lines collapse to an invisible point. Icons that are the same shape at
different angles (arrows, chevrons, plus and cross) rotate instead of
morphing their points.

The lesson he draws: Claude built it fast but couldn't see that the arrows
should rotate. Watching the result and saying what felt wrong had to come
from him.

Here, it fits the sheet's close-to-back icon and the chevrons. Phosphor
draws each icon as a set of shapes, so a morph would use our own icons on
Phosphor's grid. That is allowed by the icon rule.

## Annotating for agents (Jan 2026) and Agentation (Jan 2026)

**Pointing beats describing.** A note pinned to the element it means, with
its selector, position and the moment it applies to, gives the agent
something to grep. Prose makes it guess. Agentation is the tool he released
for this. It's a dev-only React component with four detail levels:

- **Compact:** the selector and the note.
- **Standard:** adds position and any selected text.
- **Detailed:** adds the element's box and nearby context.
- **Forensic:** adds computed styles.

He built the whole Agentation site with Agentation.

For pinkslip.work, Agentation can be dropped in for development. The iOS
app has no equivalent. The owner reviews on the phone and writes notes
that say which screen and which part. An in-app note mode for admin builds
would do for the app what Agentation does for a page (directions D4).

## Liveline (Feb 2026)

A real-time line chart in one canvas. Every part of it eases toward its
new value by the same small step each frame (8%): the line, the axis, the
badge, the labels. That's why it feels like one thing breathing.

Its loading state is a breathing line that morphs into the data when the
data arrives. It is stress-tested on data that arrives at uneven intervals.

Pinkslip's live send bar fills by real steps (No time promises). Easing
between steps, all parts at one rate, keeps that rule and removes the
jumps. Tracker's stats could use the same loading-to-data morph.

## Drawesome (Jul 2026)

A drawing toolbar that changes shape instead of swapping panels. Each pen
behaves like the real one. It is opinionated, so the defaults are the
version you ship.

It's an example of the "morph, don't swap" rule from the motion notes,
applied to a whole toolbar. Its studio look renders pens as lit objects.
The owner found paper objects amateur on the Pro screens, so this is
noted, not proposed.

## Stageshow (Oct 2026)

Covered in [aiforui.md](aiforui.md) and [reading.md](reading.md): a skill
for faux product demos, filmed frame by frame and checked. It fits the
website's home page and an App Store preview video.

## What to read next from him

Two things Family Values points to:

- **Emil's recreation of Family's tray system** (emilkowal.ski,
  "family-tray-system"). It rendered empty without JavaScript, so it is
  still unread.
- **Rauno Freiberg's "Invisible Details of Interaction Design"**, which
  Benji credits for the frequency idea. Read; see [reading.md](reading.md).
