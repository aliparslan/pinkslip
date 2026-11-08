# animations.dev, against Pinkslip (2026-11-07)

The owner shared Emil Kowalski's animations.dev course (Nov 7). These are
the lessons that change something here, in my words, checked against the
iOS app's motion tokens (`packages/tokens/src/tokens.ts` `uiMotion`,
`apps/native/src/ui/motion.ts`) and the website's kit CSS. The course's
skills (animate, animate-expo, emil-design-eng, improve-animations,
find-animation-opportunities, break-ui) are already installed here.

## Already right

- **Sheets** use Vaul's iOS curve (0.32, 0.72, 0, 1); springs are Apple's
  response and damping, critically damped by default; drags rubber-band
  and project a flick's resting point; presses scale to 0.97.
- **The two signature moments exist**: the stub tears off when you apply
  (`motion.stub`), and a new step's stamp lands on your stub while you
  watch (`motion.stamp`, `Ticket.tsx`).
- **Website kit**: no `transition: all`, no `ease-in`, popovers, menus and
  tooltips scale from their trigger (`var(--transform-origin)`), later
  tooltips open instantly (`data-instant`), hovers only with a mouse
  (`hover: hover`), reduced motion handled, press states on rows.
- **Comparing against iOS frame by frame** is already the rule (Match iOS
  motion), as the course recommends.

## Worth changing

1. **Exits shorter than entries.** A sheet opens and closes in the same
   500ms (`uiMotion.sheet`). Once you've decided to dismiss, the sheet
   should get out of the way: try a close around 350ms, in the sheet lab
   beside iOS's own.
2. **Steps inside a sheet: a short cross-fade, not a full slide** (flow run
   4.10). For a small container whose steps look alike, a cross-fade with
   an 8pt shift in the direction of travel reads calmer than sliding the
   whole step across. Back moves the other way from Next.
3. **Gaps close while the row leaves.** When a job is hidden, the rows
   below should move up at the same time as it goes, not after; Undo
   brings it back the reverse way (flow run 2.36).
4. **One entrance per container.** Content arrives with its container; no
   second wave of staggered children after a sheet or page has arrived.
   Where a stagger is wanted (the first feed load, roadmap 2), vary it by
   importance instead of equal steps.
5. **Morph, don't swap.** When a control changes meaning, it changes in
   place: Get Pro's button into "You're on Pro", Apply into the live send.
   On the website a 2px blur during a label cross-fade hides the seam;
   on iOS, opacity and scale.
6. **Speed for what's used all day.** Anything touched dozens of times a
   day (filter chips, tabs, segment, row presses) is instant or nearly; a
   rare moment (a sent application, an offer, the first run) can take its
   time.
7. **Dials in the labs.** The kit's motion, swipe and sheet labs get
   sliders for duration, curve, response and damping, so values are tuned
   on the phone instead of by message, and a good setting can be copied
   back.
8. **Review with fresh eyes and the worst content.** A motion change sits a
   day before it ships, and is tried on long names, two-line titles and
   long lists (`break-ui`).

## Website only

- `will-change: transform` on anything that shifts by a pixel at the
  start or end of a transform.
- The roadmap's preloading (`defaultPreload: "intent"`) is the course's
  "perceived speed" lesson for page changes.

Not adopted: bounce in product UI (none unless a drag carried momentum),
marketing-length intros, and Framer Motion (the website's motion is CSS in
the kit; the app's is Reanimated).
