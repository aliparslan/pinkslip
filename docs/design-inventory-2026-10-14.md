# Design inventory before the build (2026-10-14)

The owner's order is:

1. Finish every design.
2. Build them.
3. Finish the backend.
4. Wire it up.
5. Check performance.
6. Do a full walkthrough.
7. Release.

This lists what still needs a design in the current kit before step 2. It's
drawn from:

- every route in `apps/native/src/app`;
- the product plan (`docs/redesign-2026-10.md` §6);
- the decision log (`docs/redesign-wireframes.md`).

"Kit" means drawn in the Oct 12–14 rounds from `tokens.ts` and `src/ui`. The
Oct 10–11 batches (Batch 1–7 on Paper) came before the kit and don't count
as designs: the kit is the spec.

## Designed and built

- **Jobs:**
  - rows, quick chips, the swipe actions (S4);
  - the Edit search sheet and "Save your changes?".
- **Job page:** the ticket, the pinned Save and Apply, and "Did you apply?".
- **The company page:** Jobs, with People and Events marked coming.
- **Search.**
- **Tracker** (TR2c) and **the application page** (stub C).
- **You:**
  - You itself, Account, Alerts, Help, Hidden companies, Tailoring
    (coming), Plan (C);
  - email tracking and Job emails.
- **The kit pieces:** the tab bar (L2 and shrinking), the toast (T1), sheets,
  settings rows.

## Designed, not built yet

- **Resume editors:** R1a to R7.
- **Answers:** A4, A5, A7.
- **Pinned page actions.**
- **Help's pinned Send button.**
- **Today** (1b): Needs you, What changed, Coming up. It waits on the
  backend activity feed.
- **Applying for you:** the A4b live bar and the queue sheet (C2).
- **Tracker's Stats sheet:** coming-soon only.

## Not designed in the kit yet

Listed in the order I'd draw them. The first five block a release; the
rest could follow it.

1. **Onboarding and sign-in.**
   - Welcome, guest browsing, and the invite code.
   - Sign in with Apple or an email link, plus the link-check screen.
   - The first search, and the resume step (skippable).
   - Today, `welcome.tsx` and `auth/email/verify.tsx` are the old screens.
   - Decided earlier: accounts need an invite, guests can browse, the
     resume step is skippable, and it's for interns, new grads and early
     career.
2. **The Apply flow, end to end.**
   - **The Apply button's states on the job page:** Apply for me, Queued,
     Applying, Needs you, Applied, View in Tracker (plan §6).
   - **The in-app browser and its fill bar.** It was decided on Oct 12 but
     drawn before the kit, and `ApplicationBrowser.tsx` is still the old
     kit.
   - **Select mode on Jobs** ("Apply to 8"), and the review sheet before a
     batch starts.
   - **The Live Activity** while a batch runs.
3. **Auto-apply settings.**
   - The mode (Off, Ask first, Automatic) and the rules: match strength,
     companies, daily cap, freshness.
   - The "Ask first" daily list.
   - "Applied by Pinkslip", with a snapshot of what was sent, on the
     application page.
   - Today the You row says Soon.
4. **Outreach.**
   - The People segment on a company page, and a person's row.
   - The composer, with template chips and highlighted filled-in words.
   - The follow-up plan, and the thread view. `OutreachSheet.tsx` is the
     old kit.
   - The daily quota setting (Pro).
5. **The old-kit sheets left on redesigned screens.**
   - Report listing (`ReportSheet.tsx`).
   - The email recruiter sheet (part of 4).
6. **Pro moments.** What a Free person sees when they reach a Pro feature
   (auto-apply, outreach, the daily quota). The billing sheet is done.
7. **Events.** The row (date block, host logo, time, virtual or in person),
   the company page's Events segment, and Register, Add to Calendar and
   Remind me.
8. **What's new and guides.** A one-time sheet after big releases, a What's
   new page in You, and guides shown in context.
9. **Admin.** Seven owner-only screens in the old kit (sources, runs, jobs
   queue, recruiters, inbox, health, home).
10. **Passes over everything:**
    - dark mode;
    - empty, error and offline states;
    - loading.

**Error screens and states get their own round** (owner, 2026-10-15),
right after sign-in rather than as a last pass: whole-screen errors
(offline, the server down, a job that's gone, a broken link), errors on a
field, an action that failed (the toast), and anything that asks before
retrying. Sign-in's own errors are drawn with sign-in.

Sign-in was drawn on Oct 15 (Paper "Sign in · Oct 15") and parked: the
owner will revisit it.

## Decided (owner, 2026-10-14)

- **The web app** waits until after the iOS release.
- **Recruiter contacts** come from the owner's own curated list and
  automated process (backend code from Oct 13), so Outreach can be drawn
  now.
- **Auto-apply ships as Ask first.** Every screen is drawn anyway, ready for
  when the backend is.
- **Events are in this release as "coming soon"**, but they're drawn in
  full.
- **The weekly report** stays tabled.
- **Next round:** onboarding and sign-in, talked through before drawing.

## Staying as it is

- **Tailoring:** a placeholder until the owner resumes it.
- **The old `preferences` route:** only the old You opens it; the redesign
  uses the Edit search sheet.
- **The kit gallery pages:** for developing only.
