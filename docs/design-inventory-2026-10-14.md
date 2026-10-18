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

## Where the approved screens are (2026-10-15)

Every approved screen now lives on the Paper page **"Approved · build
these"**, one copy each, in sections: Today, Jobs, Job page and applying,
Search, companies and events, Outreach, Tracker and applications, You,
Resume and Answers, Email tracking, Errors, loading and small moments,
Dark mode. They were moved, not copied, so nothing drifts. Round pages keep
the takes that weren't picked; Search and companies, Errors, Loading,
Report, Dark mode and Outreach are now empty. Screens drawn before the Oct
15 kit changes (Mist page, outlined chips, no tab names, 1.75 icons) still
show the older look; the kit wins, and the audit below catches each one.

**Next, before any building (owner, 2026-10-15):** a full audit of every
approved screen against the kit, measured, not eyeballed: gaps and padding,
corner radii, button and row sizes, the grid, colors and contrast ratios,
icons and stroke weight, interaction patterns, and each screen's person and
intent. Findings go in one doc with the fix; fixes are drawn in Paper
before they're built. Then the backend.

## Built on 2026-10-16

The build after the audit, on the owner's phone as owner-channel updates
(nothing pushed). Live where the backend already supports it; the rest runs
on sample data from You → Kit → Redesign kit until its backend exists.

- **Live:** Today (the first tab, with the Needs-you badge), the audit's kit
  changes, Report a job, What's new, error and offline states, loading
  placeholders, the Resume and Answers editors, pinned page actions,
  Outreach (a person's page, Write, "Did you send it?", follow-ups on Today
  and Tracker, Outreach settings, People from your threads).
- **On samples:** Ask first (Today's card, the review, a job's preview), the
  live bar and queue, What Pinkslip sent, Auto-apply settings and paused,
  the Pro sheet from a moment, Events (a company's list and an event page).
- **Not built yet:** Answer for me (board 2, 2.3; it says Soon), the Live Activity and Dynamic Island (a native build), Following and the
  follow-only rules (backend). On Search, Companies you follow, Coming up
  and the result scopes (All, Jobs, Companies, Events) wait on following
  and events.
- **Built Oct 16:** the stub's APPLIED/SENT proof (6.1, 6.2, on samples
  until sends are recorded), the Search tab's bottom field as iOS 26
  draws it, the Apply button's every state with its split menu (board 1;
  the auto-apply states on samples), and the in-app browser's redraw with
  its fill bar (board 2), with 2.3's saved answers above the keyboard
  (Oct 18).

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
- **Pro moments** (Oct 15, Paper "Pro moments · Oct 15").
- **Events** (Oct 15, Paper "Events · Oct 15"): the company page's Events
  segment, the event page, Coming up once signed up. They ship as coming
  soon.
- **Outreach** (Oct 15, Paper "Outreach · Oct 15"): People, a person's
  page, writing through the iPhone's mail sheet, "Did you send it?", the
  thread, Today and Tracker, Outreach settings, Following, the
  follow-only rule in Alerts and Auto-apply, no one listed. Pinkslip's
  own composer is drawn for later (Pro's Send them for me).
- **Dark mode** (Oct 15, Paper "Dark mode · Oct 15"): the main screens,
  sheets and states. Paper objects' dark grain and edge change in tokens
  at build.
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

1. **Sign-in, revisited** (parked above; the owner will come back to it
   much later).

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
