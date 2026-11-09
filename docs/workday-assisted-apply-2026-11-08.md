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

| Kind | Where | How it's built | Form reader today |
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

## What works, and what isn't known

- A real click or the keyboard works a dropdown: focus, Space, arrows, Return.
- A script's `.click()` presses Add and opens the menus, but did nothing on a
  menu item, which needed a real click.
- **Not tested:** whether a script can pick a dropdown option with dispatched
  pointer events. The test was blocked by the tool's safety check. This is the
  main risk, because the assisted browser fills by injected script, which
  can't produce real clicks or keys. If it fails, dropdowns need a native tap
  or stay the person's to answer.
- Reader output on the real signed-in page wasn't run. The table is from the
  page's markup and the reader's code.

## Fixed first

The form reader read password boxes as ordinary text, and the assisted browser
sends what you type into a field it asked about to `/apply/learn`. Two rows
labelled Password and Confirm Password reached `application_answers` on Nov 4,
for one tester, and have been deleted. The reader now skips password boxes and
the robots field, and the server refuses secret labels when planning and
learning.

## Proposed order

1. Test picking a dropdown option by script. Everything below depends on it.
2. Fill again when the step changes. The loop's `watch` only starts a pass
   until a form has been shown (`!formShown`), so later pages get nothing.
3. Read dropdowns and menus as questions, opening each once for its options.
4. Give dates a real label from their section.
5. Open assisted apply at `<posting>/apply/applyManually`, so the person lands
   on sign-in. Passwords and the Terms box stay theirs.
