# Email detection, measured (2026-10-18)

Step 5 of [backend-inventory-2026-10-16.md](backend-inventory-2026-10-16.md)
asks for a test set of real-shaped emails that measures detection before
anyone relies on it (Decisions: Email tracking #1). This is that set and
what it found.

## The set

`tests/fixtures/job-emails.ts`, checked by `tests/email-detection.test.ts`
(`MEASURE=1 bun test tests/email-detection.test.ts` prints the counts). 39
emails, written the way each service's mail reads. None are copied from
anyone's inbox.

| Kind | Emails | Services |
| --- | --- | --- |
| Receipts | 9 | Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS, Jobvite, Taleo, and a receipt that mentions a possible interview |
| Rejections | 6 | Greenhouse, Lever, Ashby, Workday, SmartRecruiters ("position has been filled"), a recruiter's own note |
| Interviews | 10 | GoodTime, Calendly, Greenhouse (with and without a calendar file), ModernLoop, Karat, a Google Calendar invite, two recruiters' notes, "pick one of these times" |
| Assessments | 4 | HackerRank, CodeSignal, HireVue, a take-home |
| Offers | 2 | An offer email, a DocuSign offer letter |
| No step | 8 | LinkedIn and Indeed job alerts, an ATS newsletter, a "we're hiring" email, a bare "status updated", an unfinished application, a cold recruiter note, an info-session invite |

Each one says whether the header check should open it, the step it reports,
and the interview time or deadline it states, for someone in New York.

## Before (the rules as they were)

- **Opening:** 39 of 39 right (job alerts and info sessions stay unread).
- **Steps:** 32 of the first 36 right. Every receipt, assessment, offer and
  no-step email was right. The misses:
  - A recruiter's "decided to go in a different direction" (read as nothing).
  - SmartRecruiters' "the position you applied for has been filled" (read as
    a receipt, from its "thank you for your interest").
  - A recruiter's "I'd love to set up a 30-minute call" (read as a receipt,
    from "Thanks for applying!").
  - A Google Calendar invitation titled "Datadog Technical Interview" (read
    as nothing).
- **Dates** (new in this step): Calendly's time-first "2:00pm - 2:30pm
  (Pacific Time), Wednesday, October 21, 2026" and CodeSignal's "You have 7
  days" were missed.

## After

Each miss got the narrowest rule that covers it: "go in a different
direction" and "has been filled" as rejections, an optional length ("a
30-minute call") in "set up a call", an attached calendar invite whose title
names an interview, time-first dates, "you have N days", and a date's time
read from the next line. Then three new emails were added that the fixes
weren't written for: a Greenhouse confirmation with no calendar file, a
"pick one of these times" email (should set no date) and a reply whose quoted
history carries other dates.

- **Steps:** 39 of 39.
- **Dates:** every stated date read, no date where none is stated or where
  several are offered, quoted history ignored.

## What it doesn't prove

- The set is written, not collected: it can only catch what someone thought
  to write. Real mail is the test that counts. As of today the owner's
  inbox has had four job emails, all read as receipts (Greenhouse, Lever and
  two others); three started tracking applications. Whether each was really
  a receipt is for the owner to confirm in Job emails.
- Emails the rules still can't place go to the AI fallback (Jev, within the
  monthly AI budget). Its answers are marked `detected_by = 'ai'` on each
  email, so they can be checked against the rules later.
- Forward some real rejections, interview invites and assessments, then
  rerun the measurement with any that were misread added to the set.
