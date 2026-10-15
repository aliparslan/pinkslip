# Proof pages and menus in sheets: research (2026-10-15)

The owner disliked What we sent v2: "the timeline looks like ass. Why is it
checkmarks and why are they black?". They also asked whether inputs in sheets
should be gray, whether things got grayer, and how other apps handle menus
inside pages and sheets, because "something still feels off".

## Did it get grayer?

Barely, and not inside sheets:

| Where | Before | Now |
| --- | --- | --- |
| A group or field in a white sheet | #EDEDEB (opaque) | #F2F2F2 (ink at 5.5%) |
| A button or the search well on the page | #EDEDEB on white | #EBEBEC on Mist |

So the value didn't change much. The structure is what feels off: on the page,
white cards sit on Mist, but in a sheet, gray groups sit on white. That's the
same sunken look we removed from the page, and it remains in every sheet.

## Proof of what was sent

**Timelines are for progress with steps still to come.**
- Status trackers with filled checks, for example
  [Bolt Food](https://mobbin.com/screens/9509b853-f44c-425e-81c0-c6e96efffe2c),
  [Grab Driver](https://mobbin.com/screens/094b300e-f89e-480f-a72a-762788d331f9)
  and [CVS](https://mobbin.com/screens/6ade5a53-e2a8-423e-b5d9-c135e5bf010c),
  all show what's left to happen. Ticking the finished steps contrasts them
  with the empty ones.
- Maersk's design system calls a timeline a record "the user is reading, not
  driving", and says not to show pending steps in an activity log.
- What we sent has nothing pending, so three ticks just say "done" three
  times. Ours were black, and black fill already means "on" in our system
  (chips).

**Calm logs use small dots and times, not ticks:**
- [7-Eleven](https://mobbin.com/screens/d74462bb-c9fc-47f6-b749-3a7ddf7fd9d3)
  uses small grey dots with the step and its time.
- [Shop](https://mobbin.com/screens/9fede023-cfcc-4a67-a3c4-693f668f0ccf)
  puts the time and place small above each step.
- [Shopee](https://mobbin.com/screens/5bd9141f-8c16-4f6b-b743-5ca9b64fe0ce)
  keeps times in a left column, with only the latest step in colour.

**Receipts lead with the state as a word, then plain rows:**
- [Ro](https://mobbin.com/screens/6f58e038-d679-44fc-8822-f60745bfb6a8):
  "Paid" as the title.
- [Careem](https://mobbin.com/screens/8a6663ca-f144-4f37-83a4-b2ae0cca8b8c):
  "Completed on 14 Sep 2025, 4:06 PM" in green text, with no icon.
- [Fresha](https://mobbin.com/screens/7c4ae253-e285-4b1d-9a85-7b535ee781d3):
  "Completed" with its time, then the fields.
- [Tock](https://mobbin.com/screens/584afc45-8fa4-4996-bb6d-ebd636fe3230):
  "Answers submitted" with its date, then the answers.
- [Cash App](https://mobbin.com/screens/5f175b2f-cd07-4a43-831d-d8cc97607a2c):
  a single thin check beside "Complete" in a list of thin line icons.

**Submitted answers show the question small, above the answer**, everywhere:
- [Glassdoor](https://mobbin.com/screens/30b07a63-8f69-42e4-be2e-a7f9a25a81f9)
- [Cash App](https://mobbin.com/screens/92c6f8aa-a4f1-48df-a5c4-96b9c06ec527)
- [Alan](https://mobbin.com/screens/258d97b5-183f-4451-b533-91b152b7361c)

**For us:**
- Say the state once, in words, with its time.
- Keep the proof as rows you can open.
- Drop the ticks, or keep at most one quiet mark. Never black.

## Menus inside sheets

**In light mode, most sheets put rows straight on the white sheet**, with thin
lines and small headings, and no boxes:
- [Transit](https://mobbin.com/screens/01f72efa-1b51-4c86-a5ae-388348e7b3b5)
- [Alan](https://mobbin.com/screens/db9a9973-a23d-40bb-90b0-ef73c3505686)
- [Tripadvisor](https://mobbin.com/screens/5f705479-e58b-41df-86a1-746c8ba04595)
- [talabat](https://mobbin.com/screens/cc4d0f56-5697-4670-bb17-fae0d30b817a)
- [Lloyds](https://mobbin.com/screens/9b40d32b-3d52-4ea7-9189-d0ce80d924c4)
- [Shopee](https://mobbin.com/screens/436256a8-82b0-4bbf-b75c-8dc2ec20461b)
- [ElevenReader](https://mobbin.com/screens/9e1e1b7d-0610-4fc7-9810-e89666e76e27)

**Boxed groups in a sheet come in two forms:**
- **The sheet gray, the groups white**, Apple's grouped style:
  - [WhatsApp](https://mobbin.com/screens/c7df3b97-12ee-425c-ba4d-26f949d70d1d)
    and [Outlook](https://mobbin.com/screens/9a9477ea-f1e9-4077-82f9-59b65c21ce07)
    use it for new events.
  - [ChatGPT](https://mobbin.com/screens/3b0c22cc-8b7a-41ce-91eb-4ae078416684)
    makes its text fields white on a gray sheet.
  - Apple's own sheets do the same in dark mode
    ([Apple Invites](https://mobbin.com/screens/d27f0859-2096-4ed2-a084-9d42c208ae1f)).
- **Gray groups on a white sheet,** what we do now, appears mostly in dark
  sheets, where lighter groups are higher:
  [Moonlitt](https://mobbin.com/screens/ac883a70-c3ff-45e1-a625-2e2a7bdd788b),
  [Once](https://mobbin.com/screens/3aa205e1-3b7f-4de0-a23a-78643847879c).
  [Locals](https://mobbin.com/screens/90e7f21e-94e7-40e4-bdfb-455eae6035bb)
  does it in light mode, and its groups read as wells.

## Inputs

There are three field styles:
- **Gray fill:**
  [MacroFactor](https://mobbin.com/screens/72f9a022-9c80-461a-96d7-0d5b23d381be),
  [Genie](https://mobbin.com/screens/22878822-8b60-42f3-a112-f2a6d5101469).
- **A 1pt outline:**
  [AllTrails](https://mobbin.com/screens/bb58146c-9244-4664-bdc1-50ae50929811),
  [Shopify](https://mobbin.com/screens/226060a1-cf70-4f52-a1c2-60eed6ded7c0),
  [Fi](https://mobbin.com/screens/109a7879-53ee-4e40-a7e9-a560d8cd3da0),
  [Stake](https://mobbin.com/screens/e7b4b941-34ba-4626-ade9-d74875e0f87c).
- **White on a gray sheet:**
  [ChatGPT](https://mobbin.com/screens/3b0c22cc-8b7a-41ce-91eb-4ae078416684).

What the evidence says:
- Google's Material team reports that outlined and filled fields both tested far
  better than underlines, but hasn't published the study (Material Components
  docs).
- UX Movement argues that solid gray fields can look disabled. It says
  outlined ones read as both empty and tappable, especially white fields on an
  off-white page.
- The Queensland design system uses outlined fields to stand out among other
  content, and filled ones to lighten long forms.
- Our chips are already outlined, so outlined fields would match them.

## The options drawn

Paper, Apply flow page: "Sheets · three ways" and "What we sent · three
takes". Each option is drawn on the same two sheets: a job's preview, which
has a field and a menu, and the queue.

**For sheets:**
- **A · Gray sheet, white groups.** Apple's grouped style, the same rule as
  our pages, so white always sits on gray. Fields are white.
- **B · White sheet, plain rows.** No boxes in a sheet: rows with thin lines
  under small headings, and fields with a 1pt outline like the chips. Gray
  stays for buttons.
- **C · Now.** A white sheet with gray groups and gray fields, for comparison.

**For What we sent:**
- **W1 · State first.** "Confirmed" with its time, then the proof as plain
  rows, then what was sent.
- **W2 · The stub on top.** The paper stub, stamped APPLIED, is the proof, as
  on the application page; plain rows follow.
- **W3 · A quiet log.** Small grey dots and times, with only the latest step
  in ink.

## Decided (owner, same day)

- **Sheets: A.** A sheet is Mist and its groups and fields are white, the
  same rule as the page. Built with the `sheet` and `sheet-group` tokens.
- **What we sent: W3**, the quiet log. W2 was set aside because What we
  sent is opened from the stub, so it would show the same stub again.

Sources:
- [Maersk design system: Timeline](https://designsystem.maersk.com/components/timeline/)
- [UX Movement: why you shouldn't use solid or underlined text fields](https://uxmovement.com/forms/why-you-shouldnt-use-solid-or-underlined-text-fields)
- [Material Components iOS text fields (Google's research note)](https://chromium.googlesource.com/external/github.com/material-components/material-components-ios/+/stable/components/TextFields/)
- [Queensland Government design system: forms](https://www.designsystem.qld.gov.au/components/forms/tabs/design)
- [UX4G: timeline component](https://ux4g.gov.in/components/timeline)
- [Apple HIG: Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
