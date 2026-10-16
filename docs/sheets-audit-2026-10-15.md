# Sheets or pages: audit (2026-10-15)

The owner asked for a pass over every sheet after the event moved to a
page. The rule (design-system.md, "Sheet or page"): a sheet is a quick
choice or form that drops you back where you were; anything you read, come
back to, or share is a page.

Sources: every `SheetModal`, `Sheet` and modal screen in `apps/native/src`,
and the sheets in the approved Paper rounds.

## Move to a page

1. **Email tracking setup** (`email/SetupSheet.tsx`, opened from the
   Tracker nudge and the Email tracking page). Six steps: where companies
   email you, what Gmail should send, "Now on your computer", waiting for
   Gmail's code, the code, making the filter. It's a guided setup you leave
   to go to your computer and come back to, with copy fields and waiting
   states. That's a page flow pushed from Email tracking (each step a page,
   Back at the top), not a sheet that can be swiped away halfway.
2. **One job's "what we'll send"** (Apply flow 3.3, opened from a row on
   the Ask first review). The review is a page and its rows are jobs; a row
   opens a page everywhere else. It holds the resume, the answers and what
   the form asks, which you read and fix, so it's a page pushed from the
   review.
3. **Stats, once it's real** (Tracker's chart button). Coming soon today,
   so the sheet that says so is fine. The real thing is something you read
   and come back to: a page.
4. **Your search, my lean** (`EditSearch.tsx`, from Jobs' filter button
   and You). It's the one saved search behind Jobs, alerts and auto-apply:
   settings you come back to, and in You every other row opens a page
   (Alerts, Auto-apply). Its steps (stage, roles, where) already work like
   pushed pages inside the sheet. As a page it would save as you go, like
   Alerts, and "Save your changes?" goes away. The quick chips on Jobs keep
   the one-tap tweaks. It's built and was decided as a sheet on Oct 12, so
   this one is the owner's call.

## Keep as a sheet

Each is a quick choice or form, and you land back where you were:

- **Change stage** and its date (application page).
- **Did you apply?** and **Apply at …** (the prep before opening a form).
- **Locations** (a job's list of places): a quick look.
- **Report a job**, and **Request a company** (Help).
- **Which application?** (attaching a job email).
- **The Pro plans** (Plan and every Pro moment).
- **Sign-in** (all of it), **Turn on alerts**, **What's new**, **Pause**.
- **A salary or written answer** (Answers; simple answers are menus).
- **The question that needs you** (Apply flow 5.2), answered over the queue.
- **The queue** (Apply flow 4.2, from the live bar): checked often while a
  batch runs, and you go straight back to what you were doing, like
  Music's Now Playing.

## Old screens that pages already replace

Nothing to decide; the redesign's builds remove these:

- `resume/Resume.tsx` edits entries in sheets; the approved editors (R2a,
  R4, R5) are pages.
- `feed/FilterSheet.tsx`, replaced by Your search.
- `companies/Companies.tsx` (report and request sheets on the old
  Companies list).
- `apply/OutreachSheet.tsx`, redrawn in the Outreach round. Writing an
  email is a task, so the composer is a full-height sheet like Mail's;
  a person and a thread are pages.
- `auth/email/verify` (a form sheet) and `welcome` (a full-screen modal),
  until sign-in and onboarding are revisited.
- Admin's Sources sheet: admin stays in the old kit.
