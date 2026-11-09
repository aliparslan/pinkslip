# Workday and assisted apply (Nov 8)

Workday is 2,058 open jobs at 42 companies (NVIDIA 797, Micron 251, Capital
One 160). This is what a real NVIDIA application does, walked in a browser on
the owner's account as far as page 4 of 5. Nothing was submitted. One company
only, so other companies' questions will differ.

## The route

- The posting has one Apply link, to `<posting>/apply`.
- `/apply` offers Autofill with Resume, Apply Manually, and Use My Last
  Application, each its own URL.
- All three reach a sign-in: Google, LinkedIn, email, or Create Account.
  Accounts are per company. Email sign-in has a real `type=password` box and a
  text field labelled "This input is for robots only".
- Signed in, it's five pages on one URL: My Information, My Experience,
  Application Questions, Voluntary Disclosures, Review. The page changes
  without a navigation. `progressBarActiveStep` names the current one and
  `pageFooterNextButton` is Save and Continue.

## What's on the pages

| Kind | Where | How it's built | Form reader before the build |
| --- | --- | --- | --- |
| Text | Name, phone, address, LinkedIn | `input` with `label[for]` | Reads it |
| Radios | Worked here before? | Native, shared `name` | Should read it, not run |
| Dropdown | Country, State, Phone Device Type, Degree, every Application Question, ethnicity, gender, veteran | `button[aria-haspopup=listbox]`; `aria-controls` names a `ul[role=listbox]` of `li[role=option]` that exists only while open | Can't see it |
| Menu | How Did You Hear (two levels), skills, phone code | `input[data-automation-id=searchBox]`, `menuItem` options, picks shown in `selectedItemList` | Sees a text box; typing won't answer it |
| Date | Work and school dates | `input[role=spinbutton]`, `dateSectionMonth-input`, `dateSectionYear-input` | Sees text boxes all labelled Month or Year |
| Repeating | Work Experience, Education, Websites | `add-button` adds a row with ids like `workExperience-40--jobTitle` | Sees rows only after Add |
| File | Resume | `select-files` over `input[type=file]` | Reads it |
| Terms | Page 4 | Required checkbox `termsAndConditions--acceptTermsAndAgreements` | Must never be ticked for the person |

On NVIDIA's page 2 nothing is required. Application Questions' dropdowns have
no `label[for]`, so their question text has to come from nearby. Options differ
by company: NVIDIA's How Did You Hear has Website then NVIDIA.COM.

## What works, and what doesn't

Tested on NVIDIA's real page 1, signed in, without saving.

- **Dropdowns work by script.** `.click()` on the button opens the list in
  about 50ms, with every option drawn (State has 61, counting Select One).
  `aria-controls` appears only while it's open. `.click()` on an option picks
  it. A dispatched Escape on `document.activeElement`, which is the list,
  closes it and changes nothing. Plain `[role=listbox]` also matches
  `selectedItemList`, so go through `aria-controls`.
- A script's `.click()` also presses Add, Save and Continue, and opens the
  menus.
- **Menus answer to pointer events, but aren't worth scripting.** Events on
  the outer `menuItem` do nothing. On its inner `promptLeafNode` they open a
  category (row type 2, with a side charm) and pick a final row (type 1).
  However, a menu sometimes draws only 2 of its 6 rows for over a second, text
  typed by script is discarded, and Escape doesn't close it. There's one per
  application, it's two taps, and its answers differ by company. So menus stay
  the person's: read with their label and saved answer, never typed into.
- **The reader, run on that page,** returned all 13 questions with clean
  labels and the right values. Opening dropdowns touched only the one
  unanswered list and left nothing open. Pages 2 to 5 are checked against
  fixtures built from their markup, not by running it there.

## Fixed first

The form reader read password boxes as ordinary text, and the assisted browser
sends what you type into a field it asked about to `/apply/learn`. Two rows
labelled Password and Confirm Password reached `application_answers` on Nov 4,
for one tester, and have been deleted. The reader now skips password boxes and
the robots field, and the server refuses secret labels when planning and
learning.

## Built, off by default

Kit, Applying, "Fill Workday page by page". Only people with assisted apply
could reach it, and it stays off until a real application has been through it
on a phone. With it on:

1. A Workday posting opens at `<posting>/apply/applyManually`, so the person
   lands on sign-in.
2. Each page fills as it appears. `progressBarActiveStep` is the only sign the
   page changed.
3. Each unanswered dropdown is opened once for its options, then filled by
   script.
4. Dates read as "Work experience: start date month". They aren't filled or
   kept as answers.

Always on, switch or not: the Terms box is never ticked, and Workday is never
submitted for the person. Save and Continue is theirs too.

## First try on a phone (Nov 9)

The owner's first try, at NVIDIA, didn't work. Replayed in the iOS web view:

- NVIDIA opens on Sign in with Google, LinkedIn or email, and the app's bar
  said "Open the application form to fill it", which is wrong there.
- After tapping Google, the loop read Google's sign-in page and typed an email
  into it. Pages on Google, LinkedIn, Apple and Microsoft sign-in hosts are now
  left alone, and Workday's own sign-in and sign-up pages read as nothing to
  fill. The bar says "Sign in to start filling".
- Adobe's header has a language picker built like a question dropdown. Only
  ids reading `section--field` count as questions now.
- Sign-up has its own "I agree" box (`createAccountCheckbox`), never ticked.
- eBay's careers site is named `apply`, which read as already being on the
  application.

**Adobe needs no account.** `/apply/applyManually` opens straight on the form.
Run in the iOS web view on its live page with sample answers, without pressing
Next: 9 of 16 filled, State picked from its dropdown, 2 left for the person.
Salesforce goes to Create Account. Micron and KLA hadn't drawn anything after
4.5 seconds in a desktop browser.

## Not proven yet

- A real page change, since Save and Continue has never been pressed for a
  test.
- Filling on the owner's phone with real answers.
- Question labels on Application Questions, which assume the same `aria-label`
  as page 1's dropdowns, with a fallback to nearby text.
- Whether Workday's confirmation page registers as applied.
- Whether Google sign-in works in the app's web view. It shows its page, but
  nobody has finished one. Email sign-in should.
