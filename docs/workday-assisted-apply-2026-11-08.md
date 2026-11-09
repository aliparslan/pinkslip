# Workday and assisted apply (Nov 8)

Workday is 2,058 open jobs at 42 companies (NVIDIA 797, Micron 251, Capital
One 160). This is what a real NVIDIA posting does, walked in a browser with no
account made and nothing submitted, and what assisted apply needs next.

## Seen on the real page

- The posting has one Apply link, to `<posting>/apply`.
- `/apply` offers Autofill with Resume, Apply Manually, and Use My Last
  Application, each its own URL.
- All three reach a sign-in, which Workday counts as step 1 of 7. It offers
  Google, LinkedIn or email, and Create Account. Accounts are per company.
- Email sign-in has `Email Address`, a real `type=password` box, and a text
  field labelled "This input is for robots only".
- Workday marks its parts with `data-automation-id`.

## Fixed first

The form reader read password boxes as ordinary text, and the assisted browser
sends what you type into a field it asked about to `/apply/learn`. Two rows
labelled Password and Confirm Password reached `application_answers` on Nov 4,
for one tester. The reader now skips password boxes and the robots field, and
the server refuses secret labels in both planning and learning.

## What's still in the way

- **Only the first page fills.** The loop's `watch` runs a pass only until a
  form has been shown (`!formShown`), so steps 3 to 7 of a wizard get nothing.
- **Past sign-in is unseen.** Nothing after step 1 can be read without an
  account, and Claude doesn't create accounts or enter passwords. It needs the
  owner signed in, on the phone or in the browser pane.
- **Probably: dropdowns.** Workday's are, from memory and unverified here,
  buttons that open a listbox. The reader only sees inputs, selects and
  textareas, so required dropdowns would be skipped without a word.

## Proposed order

1. Open assisted apply at `<posting>/apply/autofillWithResume`, so the person
   lands on sign-in and Workday reads the resume itself.
2. With the owner signed in, read steps 2 to 7 of one real application,
   without pressing Submit.
3. Fill each page as it appears, then add Workday's dropdowns.
