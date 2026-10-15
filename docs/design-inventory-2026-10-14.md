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
- **Pinned page actions,** and Help's pinned Send button.
- **Today** (Oct 15, on the kit: T1–T4, at release T1r and T3r). It waits
  on the backend activity feed.
- **The Apply flow, boards 1–6** (Oct 14–15): the Apply button's states,
  the in-app browser and fill bar, Ask first (the Today card, the review
  page, one job's preview), while it runs (the live bar, the queue, the
  Live Activity and Dynamic Island), Needs you, and What we sent (W3).
  Select on Jobs (3.4) ships later.
- **Errors** (Oct 15, Paper "Errors · Oct 15"): every error screen and
  state, rules in design-system.md.
- **Auto-apply settings** (Oct 15, A, Paper "Auto-apply settings · Oct
  15").
- **Report a job** (Oct 15, Paper "Report · Oct 15").
- **Loading** (Oct 15, Paper "Loading · Oct 15").
- **What's new** (Oct 15, Paper "What's new · Oct 15").
- **Tracker's Stats sheet:** coming-soon only.

Built since the last count: Mist and Sheets A, the tab bar without names,
chips that keep their width, the 2pt sheet Back.

## Parked by the owner

- **Sign-in** (Oct 15, Paper "Sign in · Oct 15", with errors E1–E9): it
  needs work and the owner will come back to it.
- **Onboarding page two** (Oct 14, P2-C): "good enough for now". Its lines
  ("We find every job", "Let us take it from here") break the Oct 15 rule
  of no "we" or "us", so they need rewording when it's revisited.

## Not designed in the kit yet (updated 2026-10-15)

The first two block a release; the rest could follow it.

1. **Outreach:** the People segment on a company page and a person's row;
   the composer with template chips and highlighted filled-in words; the
   follow-up plan and the thread; the daily quota (Pro).
   `OutreachSheet.tsx` is the old kit. Also Follow on a company page, and
   whether Alerts and auto-apply can stick to followed companies.
2. **Sign-in, revisited** (parked above).
3. **Pro moments:** what a Free person sees at a Pro feature (auto-apply,
   outreach, the quota). The billing sheet is done.
4. **Events,** drawn in full though they ship as coming soon: the row, the
   company page's Events segment, Register, Add to Calendar, Remind me.
5. **Dark mode pass.** Empty states, errors and loading are done.

Admin stays in the old kit.

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
