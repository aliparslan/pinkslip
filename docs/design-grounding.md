# Design grounding (2026-10-13)

The owner felt the redesign had lost its way. The first pages felt right,
beautiful and intuitive; later work struggled with intent, interface and
experience. Read this, then open the Paper pages below at full size, before
any design work.

## The job

From the [brief](redesign-brief.md):
- **Who:** interns, new grads and people up to five years in. They're
  anxious, short on time and tired of spreadsheets.
- **When:** a few minutes at a time, between classes or in bed.
- **What the app must do:** answer "is anything happening?" at a glance,
  and make the next step obvious.

## The bar

These Paper pages are what "right" looks like:

- **"Take A · Quiet":** Jobs, Job page, Job page just applied, Tracker, You.
- **"Batch 1 · Core app":**
  - 1 · Onboarding: welcome
  - 13 · Tracker, empty
- **"Batch 2 · Tracking":** 15 · Application page.
- **"Batch 3 · Auto-apply":** 28 · Today tab.
- **"Batch 4 · Outreach":** 31 · Tracker, Outreach.
- **"Paper objects":** Ticket and torn stub.

Some details have changed since: the job row is now three lines, the tabs
are new, and sheets are our own. These pages set the feel to match, not the
spec.

## What made them work

1. **Each screen answers one question, and the answer comes first:**
   - Jobs: what's new.
   - The job page: the ticket's facts.
   - Tracker: what needs me.
   - Today: did anything happen. The first draft answered with four big
     numbers; the owner dropped that block on 2026-10-13. The rows answer
     it now.
2. **One line carries each row, in Untitled Medium 17,** measured in
   Paper. It's the job title, the person, or the thing to do; the other
   lines stay quiet. Founders is kept for titles, date tiles and logo
   initials.
3. **The thing to do is the headline, as a verb:** "Answer 2 questions to
   finish", "Pick an interview time", "Follow up with Maya Chen".
4. **Restraint:**
   - One boxed thing per screen: the batch card, the Today numbers, or an
     application's "Next" card.
   - One paper object per screen.
   - Pink only for "do this" or "needs you".
5. **Numbers you read at a glance,** as Flighty does.
6. **Calm:** white space, short meta lines, 24–32 between sections.
7. **A sequence:**
   - Greyscale structure first.
   - Then two visual takes that really differ, and the owner picks one.
   - Then a consistency pass.
   - The calls I made are listed for the owner to veto.

## Where it drifted (Oct 12–13)

1. **Code before Paper.** The sheet steps took five rounds in the real
   component before a playable lab settled them.
2. **Adding instead of choosing.** Each new need (Saved, Assessment, the
   auto-apply queue, outreach) became another section, so Tracker turned
   into a long list of sections that all look the same.
3. **Tracker rows lost their headline.** They took the Jobs row (three
   regular lines), so every row weighs the same. The three-line row was
   decided for Jobs; whether Tracker keeps it is the owner's call, so raise
   it rather than change it.
4. **Working from summaries instead of the pages.** The Today drafted on
   Oct 13 ignored the original Today and its numbers.
5. **Reshuffling instead of drawing.** The by-phase drafts were the
   finished Tracker cloned and rearranged. They were deleted.
6. **Everything at once:** code, tokens, docs, phone builds and design in
   the same turn.

## How to work

1. **Before drawing,** write the moment in five lines or fewer and get a
   yes: who, when, what they need first, what they do next.
2. **Open the bar pages** at full size, not their descriptions.
3. **Draw one direction from scratch.** If there are options, make two or
   three that really differ.
4. **List the calls** made along the way, for veto.
5. **Design rounds touch Paper only.** Code, tokens and docs come after the
   pick.
6. **For anything about feel** (motion, gestures), build something
   playable first.
7. **Fewer words,** on screens and in messages.
8. **Draw from the kit, not the bar pages.** The bar pages are from Oct 11;
   the system was decided on Oct 12 and lives in `tokens.ts` and
   `apps/native/src/ui`. Clone the row, section header, chips, card and tab
   bar from the Paper "System" page. Go through "Before drawing" in
   [design-system.md](design-system.md), and audit every artboard against
   it after drawing. On Oct 13 the Tracker and Today drafts used the old
   60-line row with a 32 logo and a 17 headline, and the owner caught it.
