# Design audit (2026-10-15)

The owner asked for every gap, corner radius, button size, layout, grid,
padding, margin, color, contrast ratio, icon, interaction pattern, person and
intent to be checked, with nothing assumed to be fine because it was approved
before. This is that audit. The owner has since agreed with it; what was
decided and fixed is below, and the rest of the file is the audit as it was
written.

## Decided (owner, 2026-10-15)

The owner agreed with the whole report and left the open calls to me, with
these answers of their own:

| | Decision | Where it's done |
| --- | --- | --- |
| Q1 | Five tabs, 56 apart: Today, Jobs, Tracker, Search, You. The Search tab finds jobs and companies (so companies need nothing in settings); Jobs' field reads "Search these jobs" and only narrows the feed | Every Approved tab bar; System tab bar part; doc |
| Q2 | Keep the pink. The bar for the pink button's white label is 3:1, as Robinhood's buttons are | Doc |
| Q3 | Tab icons stay without names for now | No change |
| Q4 | The ticket's paper stays as it is; revisit later. Options drawn on "Audit fixes · Oct 15" | Doc notes the exception |
| Q5 | Outreach moves to the green group in You; Plan shows one allowance, "2 left of 3"; See Pro is 36 | Approved page |
| Q6 | Auto-apply: two groups (the mode with its time and Pause; Which jobs), What it sends dropped, one footnote, Automatic shows only "Pro". Before and after on "Audit fixes · Oct 15" | Approved page (O12, A2) |
| Q7 | A sheet with its own header has the 36 close button; every other sheet has the grab bar | Doc |
| Q8 | 24 above a header after a list, 16 when first, 4 below; counts after the label everywhere | Approved page; doc |
| Q9 | Skills are tags, filled, a part of their own | Doc |
| Q10 | One Jordan Lee, jordan@lee.dev, New grad +1; Internships last | Approved page; System settings rows |
| Q11 | A7 stays; Answers B is retired to "Retired from Approved" on the fixes page, and A7 loses its detail lines | Approved page |
| Q12 | Selection on the left in a select mode, on the right in a review list | Doc |

**Icons.** The owner asked for a line proportional to the icon's size, not
1.75 everywhere: 7.3% of the icon (1.75 at 24), 8.3% when lit (2 at 24).
Every icon on the Approved page (about 1,100 paths) and the System page was
re-stroked to it, and every robot is the B2 bot mark now (four were still
Phosphor's Robot). `Icon.tsx` still draws 1.75 at any size: that's for the
build.

**The up-and-down caret** got a wider gap between its chevrons (owner).

**Fixed in Paper:** the "we" copy, section 2's out-of-date screens, every
rule break in section 3, the sample person, Paper's tokens (`good`, `scrim`,
`ink-3`, amber, stage and tile colors) and the placeholder caption.

**Tokens:** `ink-3` (light) 0.53 to 0.51, Assessment amber to 0.65 (chroma
0.145 to stay in sRGB). The "we" strings in code are rewritten.

**For the build** (not done; the code still differs):
- `Icon.tsx`: the proportional line; `Button.tsx`: 20 icons on 50 buttons;
- chevrons: 12 `ink-4` in rows, 11 `ink-3` after words (section 8);
- `ListItem`'s chevron space, section header spacing (Q8), the tab bar's
  five tabs, the Jobs field, `Badge.tsx`'s comment, the old `kit/Field.tsx`
  placeholders;
- the quarter-side radius in `CompanyLogo` and `IconTile`; 48 header logos;
- the Search tab: Paper draws iOS 26's search tab (the bar folds to a
  circle beside a bottom field); the code has the field at the top.

## How it was done

- **What was checked:** every phone screen on the Paper page "Approved ·
  build these". That's 143 screens and 13,797 layers, in 11 sections.
- **Measured, not eyeballed:** a script read Paper's own code export of
  every screen, so every font, gap, padding, radius, size, color and icon
  stroke below is the drawn value.
  - Contrast was computed for every piece of text against what is actually
    behind it, see-through layers included.
  - Contrast uses the WCAG 2 ratio, with APCA as a second opinion.
  - Apple's rule is the bar: 4.5:1 for text up to 17pt, 3:1 for 18pt and up
    or bold.
- **Compared against:** `packages/tokens/src/tokens.ts`, the kit in
  `apps/native/src/ui`, and `docs/design-system.md`.
- **Read as a person:** every screen was screenshotted and read for who is
  there and what they came to do.

## The short version

1. **About a third of the Approved page is out of date.** Those screens were
   drawn before later decisions and never redrawn. They show:
   - filled chips;
   - gray groups in sheets;
   - a pink Change stage;
   - "No reply" where the stage is now Ghosted;
   - 1.5pt tab icons;
   - the old Your search;
   - a 36 segmented control.

   The built code is usually ahead of them. Section 2 lists each one and the
   screen to copy from.
2. **The app's structure isn't settled in the drawings.** Approved screens
   show four different tab bars, and the Jobs tab has no current drawing of
   its own (Q1).
3. **White on the pink button is 3.06:1.** Apple asks 4.5:1 for 17pt
   Medium labels. On screen the buttons read washed out, close to
   disabled (Q2).
4. **422 of 898 icons are drawn thinner than the 1.75pt rule,** some at
   0.75pt. The code draws every icon at 1.75pt, so the code is right and
   Paper is wrong.
5. **Copy still says "we" in places:**
   - in Paper: the screen title "What we sent", "We'll send", "What we
     found";
   - in shipped code: six strings.
6. **A few color rules are broken in current drawings:**
   - green checks where green means Offer only;
   - a faded pink button;
   - placeholders and a disabled label in `ink-4`, which is never text;
   - a destructive red that isn't the token.
7. **Small things have drifted:**
   - section headers are spaced four ways;
   - counts sit two ways;
   - sheet titles are 28/32 instead of 28/34;
   - badges come in three sizes;
   - small buttons come in four heights.
8. **design-system.md contradicts itself in eight places** (section 13).

### What holds up

- The 16 margins and the 68 text line hold on every list checked.
- Text sizes stay on the scale everywhere except imitations of iOS's own
  screens (the mail sheet, alerts, the keyboard, the web form).
- The four inks are used as intended, except the `ink-4` slips below.
- Only one piece of our own text is bold (700); the rest are iOS imitations.
- Light and dark tokens in Paper match `tokens.ts`, except `good` and a
  hair of `scrim`.
- The newest rounds hold together:
  - errors;
  - Outreach;
  - dark mode for Outreach;
  - Alerts;
  - Outreach settings.

## 1. Questions for you

Each one changes what gets drawn. My pick comes first in each.

**Q1. Which tabs ship, and where does search live?** Approved screens
disagree:

| Where | Tabs |
| --- | --- |
| Today, You (O8), errors | Today, Jobs, Tracker, Search, You (five, 52 apart) |
| Tracker (TR2c) | Today, Jobs, Tracker, You (no Search) |
| Jobs · searching | Jobs, Tracker, You, with the old names, and a separate search circle |
| Search screens | the bar collapses to a Jobs circle beside a bottom search field |
| The code today | Jobs, Tracker, Search, You (four, 56 apart) |

On top of the Search tab, Jobs keeps its own field, "Search jobs and
companies". That makes two search boxes, both searching companies.

- *Recommend:* five tabs when Today ships (Today, Jobs, Tracker, Search,
  You) at 56 apart. Jobs' field becomes a filter of your feed only
  ("Filter these jobs"), or goes, leaving the filter button and chips.
- Then draw one current Jobs screen for the Approved page, from P1's
  rows and chips.

**Q2. The pink button's label.** White on #EE5FAC measures 3.06:1, below
Apple's 4.5:1 for a 17pt Medium label. In the drawings the label reads
faint. No pink that still looks like this pink reaches 4.5:1 with white:
it takes the deep text pink, #C82E88 (5.0:1). Options:

| | Button | Label | Ratio | Feel |
| --- | --- | --- | --- | --- |
| a | #EE5FAC (now) | white | 3.06 | soft, close to disabled |
| b | #D54896 | white | 4.04 | firmer, still candy |
| c | #C82E88 (the text pink) | white | 5.00 | magenta, one pink for fill and text |
| d | #EE5FAC (now) | ink | about 6 | bold, editorial; the web already uses dark text on pink |

- *Recommend:* draw a, c and d as real buttons on the job page and
  Today, and pick on the phone.
- My lean is c: one pink, passes, and Increase Contrast already uses it.

**Q3. Tab icons without names.** Search, the briefcase and the person
read anywhere. The sun (Today) and the path (Tracker) don't explain
themselves, and the names went on Oct 15.

- *Recommend:* keep no names, but ask three people who've never seen the
  app what each icon opens.
- If the sun or path misses, try a clearer glyph on Phosphor's grid
  (CalendarCheck or House for Today; ListChecks or Stack for Tracker)
  before bringing names back.

**Q4. The ticket is darker than the page.**
- The rule says "higher is lighter". Paper (#F3F2F0) is darker than Mist
  (#F8F8F9), 1.05:1, and only the shadow lifts it.
- In the drawings the ticket reads as a warm gray card more than paper.
- *Recommend:* draw the job page with a warm white paper (#FEFCF7,
  lighter than the page) beside today's, and pick on the phone.
- If today's stays, write the exception into the rule.

**Q5. Outreach is free, but its row is still Pro.**
- In You (O8), Outreach sits in the pink Pro group.
- Plan (C) still shows "4 left · emails sent for you" on Free, but Send
  them for me is now Pro-only, with no free allowance.
- *Recommend:*
  - move Outreach to the green group (what you apply with);
  - make Plan's second allowance read Pro-only, or drop it, leaving one
    allowance ("applied for you").

**Q6. Auto-apply settings break the rules written for settings pages.**
- Rules: two groups at most, no detail lines under titles.
- Auto-apply (O12) has:
  - four groups;
  - two detail lines ("Pick from a list each morning.", "Coming soon.");
  - an upsell line;
  - three footnotes.
- Automatic says both "Coming soon" and "Pro".
- *Recommend:*
  - Group one: the mode and its time, with Pause as a row.
  - Group two: Which jobs.
  - Drop What it sends: Resume and Answers are already rows in You.
  - One footnote.
  - Automatic shows only "Pro" (or only "Soon"), not both.

**Q7. When a sheet has a grab bar and when it has a close button.**
- The rule says a grab bar, never a close button. But these have the 36
  close button and no grab bar:
  - Did you apply?
  - Did you send it?
  - Apply at
  - the queue
  - a question
- *Recommend writing the rule:*
  - a sheet with its own header (a logo, a person, a question that came
    back to you) has the close button;
  - every other sheet has the grab bar.

**Q8. Section headers: spacing and counts.**
- Spacing above a header, as drawn:
  - 16 on Jobs and the company page;
  - 24 on Today;
  - 20 on Search;
  - 12 or 28 on the application page.
- The code uses 16. design-system.md says both "16 above" and "24–32
  between sections".
- Counts sit right after the label on Today and Tracker. They sit at the
  far right on Jobs, Search and the company page.
- *Recommend:*
  - 24 above a header that follows a list, 16 when it's the first thing
    under the title or chips, 4 below;
  - counts after the label everywhere, as the rule says.

**Q9. Skills are filled gray pills.** Chips that filter are outlined now.
- Skills are tags, not filters, so they could stay filled.
- *Recommend:* name it as its own part, "tag", filled `fill`, so filled
  never means "a chip that's off".

**Q10. The sample person reads as a student.** The audience isn't
students, but You shows:
- jordan@utexas.edu;
- "Interns, New grad";
- UT Austin;
- graduation May 2026.

There are also two Jordans: Jordan Lee (You, Contact) and Jordan Rivera
(the form, What we sent). Internships is the first career stage on offer.
- *Recommend:*
  - one sample person everywhere, a recent grad with a personal address;
  - Internships last in the career stages, or out.

These screens become the App Store screenshots.

**Q11. Two Answers pages are approved.** "Answers (B, what's missing
first)" in You and "A7 · Answers with menus" in Resume and Answers
disagree:
- B has chevrons and detail lines;
- A7 has menus, date pills and "From your applications".
- *Recommend:* A7 is newer and closer to the kit. Retire B, and drop
  A7's detail lines under the settings rule.

**Q12. Where the selection circle sits.**
- Apply to 9 puts the checks on the right.
- Jobs' select mode (3.4) puts them on the left, as Mail does.
- *Recommend:* left in a select mode on a list, right in a review list
  you're trimming. Write it down, since both are approved.

## 2. Out of date on the Approved page

These screens were drawn before a later decision. Each gets redrawn by
copying the screen in the right-hand column. Built code mostly matches the
newer decision already.

| Screens | What's out of date | Copy from |
| --- | --- | --- |
| Jobs · searching | Three tabs with names, a separate search circle, filled chips, counts at the far right | P1 (errors) for the list, once Q1 is decided |
| Your search, a step, Save your changes? | Gray groups on a white sheet; filled chips behind; Pay from's "Soon" without the chevron's space; title 28/32 | The built sheet (Sheets A); M4 for groups |
| Your search · dark | A pure black page (#020203), not the dark page | D2 |
| Change stage (C·1) | Gray groups; all endings share one mark; "No reply" | "Change stage · color only…", which itself needs white groups |
| When's the interview? (C·2) | Gray groups; pink Change stage behind it | Sheets A groups; the gray Change stage |
| Application · your stub, just applied, you reached out, C·3, C·4 | Pink Change stage (decided gray on Oct 14; the code is gray) | Apply flow 6.1 |
| Application · you reached out | The person row is "Maya Chen, Recruiter" on one Regular line | O1's person row: the name in Medium, the role under it |
| Tracker (TR2c) and Stats | Filled chips; Assessment and Interviewing marks gray, not amber and blue; "No reply"; four tabs with no Search | TR2c with the Oct 14 stage marks, the Q1 tab bar, and O7, which copied TR2c |
| A nudge in Tracker (1B), Which application? (5A) | Same Tracker behind them | The redrawn Tracker |
| Company page · Jobs | A 36 segmented control (rule: 40); a gray "+ Follow" (decided outline); a 56 logo where its other tabs have 48; no tab bar | E1 and O1's header |
| Search · before typing, results | Filled chips; Follow gray and 34 tall (decided outline, 36); the old 40×48 date tile on white; "See all 12" and "Clear" in `ink-3` (tappable words are `ink` Medium) | Chips and date tile from the System page; Follow from E1 |
| Plan · See Pro sheet | Gray groups | M4 (the same sheet, current) |
| Plan (C) | "4 left · emails sent for you" contradicts Outreach (Q5); 40 tall "See Pro"; segmented bars where progress is one bar | After Q5 |
| Use this resume? (R7), A4, email setup sheets (2B-1, 2B-2, 2B-3, 3A, 3B) | Gray groups and gray copy fields (copy fields are white now) | Sheets A; CopyField on the System page |
| Email setup sheets | The old You (no tiles) behind them | O8 |
| Auto-apply · Paused (A2) | No "Companies" or "How many" rows; a different Automatic row from O12 | O12, after Q6 |
| You (D1, dark) | No Following; Outreach says "Soon" | O8, then turned dark |
| Answers (B) | See Q11 | A7 |
| Today T1–T4, T1r, T3r; E1; E3; errors W1, W2, P1–P4, L1, N1; Apply boards 3–5 | Tab icons at 1.5pt (lit 1.5, should be 2) | The System page's tab bar |
| Apply flow board 4.1 and others | Tab bar slots 52 wide (code: 56) | After Q1 |

## 3. Rules broken in current drawings

These aren't age; they break a rule that already existed when drawn.

| # | Where | What | Fix |
| --- | --- | --- | --- |
| R1 | Apply flow 3.3 | "Done" is pink at 40% opacity. Pink is never faded to show disabled | Gray fill, `ink-3` label |
| R2 | Apply flow 1.7, 4.2, 4.3, 5.3 | Green checks on "Applied Oct 14", "Confirmed", "9 sent". Green is Offer only, never checks | `ink-2` check; a done toast's check is pink |
| R3 | Apply flow 3.3 | Section header "We'll send" | "Pinkslip sends" or "Sending" |
| R4 | Apply flow 6, the stub | "What we sent" is a screen title and the stub's link | "What Pinkslip sent", or "Sent for you" |
| R5 | Use this resume? (R7) | "What we found in Jordan_Lee.pdf" | "Pinkslip found …" or "From Jordan_Lee.pdf:" |
| R6 | Report (R1) | Disabled Send label in `ink-4` | `ink-3`, as Help's Send |
| R7 | Help, Report, D2 | Placeholders ("Subject", "Which details?") in `ink-4`. The code uses `ink-3` | `ink-3` |
| R8 | Account, Resume, Role, School, F2 | Destructive rows in #D93A2B, not `bad` (#B32228). #D93A2B passes on white (4.57) but fails on Mist (4.31) | `var(--color-bad)` |
| R9 | Answers A5 | "Forget this answer" in `ink`. Destructive text is `bad` | `bad` |
| R10 | Apply at … sheet | Its group has the card shadow, grain and radius 16. A sheet holds plain menus: no lift, no grain, radius 20 | Copy the plain sheet group |
| R11 | Did you apply? | Buttons 10 apart. The rule and the code say 8 ("Did you send it?" is 8) | 8 |
| R12 | Replace address alert (4B-2) | The title is drawn at 700 | It's iOS's own alert, drawn by the system; draw it in the system font at Semibold |
| R13 | Account | Email and "Signed in with" values have no chevron space, so they don't line up with Name's | The chevron's 12 space |
| R14 | Account | Three groups | Log out and Delete account share one card (two groups) |
| R15 | Answers (B, A7), Auto-apply (O12, A2) | Detail lines under settings row titles | Reword (Q6, Q11) |
| R16 | Today T1 | The second stacked logo's ring: the see-through `fill` on the white card, white on the Mist page in What changed. The rule says the page's colour | The card's white in the card, Mist on the page |
| R17 | Today T1, T2, T1r | Stacked logos at radius 8 where 28 logos are 7 elsewhere; letters mix Founders Semibold and Untitled Regular | 7; one letter style |
| R18 | Today T1 | "Applied to 6 overnight" shows "11:48 PM" while rows beside it say "9h" | "10h" |
| R19 | Search results, Hidden companies | Small capsules 34 tall ("Follow", "Show"). Small buttons are 36 | 36 |
| R20 | Plan (C), Alerts off (K2) | Pink capsules 40 tall ("See Pro", "Open Settings") | 36 small, or 50 full width |
| R21 | Your search, Jobs · searching | Badges 17 and 18 tall with an 11pt number. Badge is 20, Footnote Medium | 20 |
| R22 | Jobs (S4) | Swipe labels 11/13. The code uses Footnote (13/18) | Footnote |
| R23 | Your search · a step | Choice details in the system font | Untitled Footnote |
| R24 | Every sheet title | 28/32. Title 1 is 28/34, and the code's sheet title uses it | 28/34 |
| R25 | Chips everywhere | Labels 15/18. Subhead is 15/20 (no visible change in a 32 chip) | 15/20 |
| R26 | Filter (3B), Email tracking | The filter text is 13/19 | 13/18 |
| R27 | Answers (B, A7) | "Asked often, not answered" is a pink header. Pink headers are for Needs you, which lives on Today | `ink-2` header; the count says it |
| R28 | Today T3 vs Search | Two date tiles: square 40 on `fill` with 11/12 and 20/20 on Today; 40×48 on white with 13/16 and 22/24 on Search | The square one |
| R29 | You (O8) | The profile avatar sits on Mist (`bg`); people avatars sit on `fill` | `fill` |

## 4. Color and contrast

### The palette, measured

Light mode. Each cell is the WCAG ratio, then APCA Lc. A ✗ means the pair
fails 4.5:1 and the text is small.

| Text \ behind it | Mist page | White card | Paper | Gray fill on Mist | Pink tint (assisted fill) |
| --- | --- | --- | --- | --- | --- |
| `ink` #111114 | 17.73 · 101 | 18.82 · 105 | 16.85 · 98 | 15.84 · 94 | 15.28 · 91 |
| `ink-2` #47474B | 8.69 · 87 | 9.22 · 91 | 8.26 · 84 | 7.76 · 80 | 7.49 · 77 |
| `ink-3` #6B6B6F | 4.98 · 72 | 5.29 · 76 | 4.73 · 69 | **4.45 ✗** · 65 | **4.29 ✗** · 62 |
| `accent` #C82E88 | 4.71 · 69 | 5.00 · 73 | **4.48 ✗** · 66 | **4.21 ✗** · 62 | **4.06 ✗** · 59 |
| `bad` #B32228 | 6.21 · 77 | 6.59 · 81 | 5.90 · 73 | 5.55 · 69 | 5.35 · 67 |
| `good` (Paper's #2E8B57) | **4.00 ✗** · 65 | **4.25 ✗** · 69 | | | |
| `good` (code's #007132) | 5.79 | | | | |

Dark mode: every text ink passes everywhere. `ink-3` is lowest at 4.88
on the pink tint. `ink-4` measures 3.21 on the page and 2.92 on a card,
which is fine for strokes.

White on the fill pink #EE5FAC: **3.06:1** (APCA 62), in both modes.

Things that aren't text (they need 3:1 only if they're the only cue):

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `ink-4` chevrons and empty radios on white | 2.00 | Like iOS's own (its gray is about the same). Fine; Increase Contrast raises it to 2.88 |
| The off chip's ring (`outline`) on Mist | 1.41 | Fine: the chip's word is the cue |
| A separator on Mist | 1.23 | Fine; Apple's is about 1.3 |
| A white card on Mist | 1.06 | Half of Apple Settings' 1.12. It held up on your phone; check once at low brightness, outdoors |
| Paper on Mist | 1.05, darker | See Q4 |
| Amber stage mark on white | **2.99** | Just under 3:1 |
| Blue stage mark on white | 4.28 | Fine |

### Where text fails on the screens (217 hits)

| Text | Count | Where | Fix |
| --- | --- | --- | --- |
| White on pink, 17 Medium | about 90 | Every pink button | Q2 |
| White on pink, 13 and 11 Medium | 12 | Badges (Tracker tab, filter) | Q2; badges are tiny, so they're the worst case |
| `ink-3` on gray fill | 88 | Search placeholders, the date tile's month, choice details on gray groups | Raise `ink-3` (below); the gray groups go anyway (section 2) |
| `accent` on fill | 2 | "1 to answer" on a gray group, today's date in the calendar | White group (section 2); the date stays pink on a pink-tinted circle |
| `ink-4` as text | 9 | Placeholders and a disabled label | R6, R7 |
| iOS colors in the mail sheet and web form | 13 | O3 and the in-app browser | Not ours; no fix |

### Paper and code disagree

| Token | Code (`tokens.ts`) | Paper | Fix |
| --- | --- | --- | --- |
| `good` | #007132 | #2E8B57 (fails as text) | Paper takes the code's |
| `scrim` | #111114 at 32% | #141418 at 32% | Paper takes the code's |
| `accent-soft` | #FFE0ED | #FFDFED | Same to the eye; match anyway |
| Stage colors, tile colors | tokens | None in Paper; drawn as literals | Add them to Paper, light and dark |
| Glass | none in code | `--color-glass`, but the tab bar uses #FFFFFFDB, toasts #FFFFFFC7, Tracker's header pill #FFFFFF9E | One `--color-glass` everywhere in Paper |
| Shadows | two (`shadow-card`, `shadow-pill`) | seven warm alphas (8% to 20%) drawn as literals | Use the two |

### Proposed token changes (after you approve)

1. **`ink-3` (light) from L 0.53 to 0.51** (#6B6B6F to #656669):
   - every caption passes everywhere: 4.84 on fill, 4.67 on the pink tint,
     5.15 on paper;
   - `ink-2` and `ink-3` stay apart (1.60× instead of 1.74×).
2. **Assessment amber (light) from L 0.68 to 0.65** (#D6810C to #CC7800):
   3.35:1 on white, so the mark clears 3:1.
3. **The pink**, per Q2.

## 5. Type

Every text layer's face, size, line height and weight:

| Style | Uses | Screens | |
| --- | --- | --- | --- |
| Subhead 15/20 Regular | 804 | 69 | ✓ |
| Body 17/22 Regular | 598 | 79 | ✓ |
| Body 17/22 Medium | 431 | 85 | ✓ |
| Footnote 13/18 Regular | 323 | 82 | ✓ |
| Subhead 15/20 Medium | 254 | 60 | ✓ |
| Footnote 13/18 Medium | 176 | 60 | ✓ |
| Long text 17/24 | 150 | 22 | ✓ |
| Title 2 22/28 | 51 | 41 | ✓ |
| Large title 34/41 | 50 | 38 | ✓ |
| Title 1 28/34 | 66 | about 50 | ✓ (20 of them without the −0.01em tracking: Apply flow boards) |
| Title 1 drawn 28/32 | 18 | 18 | ✗ R24 |
| Chips 15/18 | 103 | 30 | ✗ R25 |
| Date tile 11/12 + 20/20, stamps 13/16 + 11/14 | 82 | 20 | ✓ (exempt, as written) |
| Swipe labels and badges 11/13 | 7 | 4 | ✗ R21, R22 |
| Avatar initials: Founders 15 (40), 18/22 (48), 22/26 (56) | 17 | 10 | ✓ but unwritten. Write it: initials are about 0.38 of the circle |
| Error slip stamp 18/22 + 12/16 | 10 | 5 | ✓ (as written for slips) |
| Body 17/22 Bold 700 | 1 | 1 | ✗ R12 |

- **Weights:** 400, 500 and 600 only, apart from R12.
- **Hierarchy:** comes from ink and weight, as the rule says.
- **Pages pushed from a tab:** the title is Title 1 (28), not the large
  title. Account, Plan and Resume all do it, but the system doesn't say so.
  Write it down.

## 6. Spacing, grid and layout

- **The grid holds:**
  - the 16 side margin on every screen;
  - row text and separators on the 68 line in every list with logos;
  - cards 16 in with 16 inside;
  - sheets 8 from the edges with 20 inside.
- **Off the 4pt scale:** 62 values, in 1,191 uses.

| Value | Uses | What it is | Verdict |
| --- | --- | --- | --- |
| gap 6 | 340 | A count after its label | ✓ written rule |
| gap 2 | 176 | Two lines stacked tight (a label over its value) | ✓; add to the rule as a micro-step |
| gap 13 | 76 | The space between the bottom bar and the home indicator | ✓ device chrome, not layout |
| gap 10 | 73 | Icon to label in iOS menus and toasts; Did you apply?'s buttons; Plan's punch rows; Skills groups; bullets | Menus are iOS's own ✓; toast, bullets, Skills, Plan go to 8 or 12; Did you apply? is R11 |
| padding 10 | 108 | The in-app browser's form fields (web content) and the copy field (centers a 36 button in 56) | ✓ (web content, and centering) |
| padding 14 | 46 | Old chips (14 each side; the rule is 16); old search field | Section 2 |
| padding 5 | 35 | The tab bar's inset (46 slots in a 56 bar) | ✓ derived |
| padding 64 to 150 | 38 | Scroll room above the tab bar | ✓ |
| padding 26, 28, 30, 52, 54 | 57 | The stub's torn top (26), pages under a 54 status bar | ✓ derived; 28 above "About the role" on application pages is ✗, make it 24 |
| margin −2, −12 | 28 | Pulling a chevron to its label; Plan's punch rows overlapping | ✓ optical |
| gap 14 | 17 | The logo-to-title gap in "Apply at"; Your search's bottom stack | ✗ make it 12 |
| gap 3 | 4 | Swipe circle to label | ✗ 4 (the code also uses 3) |

**The first job is a long way down.** On Jobs, the title, search, chips and
header take about 260pt before the first job, nearly a third of the screen. Q1's
answer frees 52 of that.

## 7. Sizes and corner radii

**Buttons and capsules:**

| Height | Kind | Verdict |
| --- | --- | --- |
| 50 | Full-width pink, gray | ✓ |
| 44 | Round icon buttons (83) | ✓ |
| 44 | Pink capsules in the browser's fill bar ("Go to Submit", "I applied") | ✓ its own toolbar; write it down |
| 40 | Segmented (current) | ✓ |
| 40 | Pink capsules on Plan and K2 | ✗ R20 |
| 36 | Segmented on the company's Jobs tab | ✗ section 2 |
| 36 | Sheet close buttons | ✓ drawn. They need a 44 hit area in code |
| 34 | "Follow", "Show" | ✗ R19 |
| 32 | Chips | ✓ |
| 20 | Badges | ✓ (17 and 18 are R21) |

**Corner radii found:**

| Radius | Where |
| --- | --- |
| 999 | Capsules |
| 12 | Cards |
| 40 | Sheets |
| 20 | Groups in sheets |
| 16 | The ticket |
| 10 | 40 logos and date tiles |
| 7 | 28 tiles |
| 14 | iOS menus, 56 logos |
| 6 | Stamps and web fields |
| 8 | Date pickers, the slip stamp |
| 5, 3, 4 | Keyboard keys, skeleton bars, grab bars |
| 34 | The iOS alert |

- **Squares round at a quarter of their side, everywhere:** 28 at 7, 40 at
  10, 48 at 12, 56 at 14. That's a good rule and it isn't written; the
  radius list says "8 for logos". Write it, and put it in the kit
  (`CompanyLogo` and `IconTile` can compute it).
- **Logos and avatars come in 40, 48 and 56.** 40 is for rows. 48 is for a
  page's header (job, event, person). 56 is for the company page (only
  its Jobs tab; Events and People use 48) and You's profile. Pick 48 for
  every header.

## 8. Icons

Every icon's drawn stroke, computed in points:

| Stroke | Icons | Verdict |
| --- | --- | --- |
| 1.75 or 2.0 (lit) | 242 | ✓ |
| 1.55 to 1.95 | 186 | Near; redraw when touched |
| Under 1.55 | 422 | ✗ |
| Heavier than 2 | 7 | ✗ (Apply board 3's tab bar at 2.2 and 2.3) |
| Filled marks | 41 | ✓ |

The thin ones:
- **Row chevrons:** 159 at 1.22pt.
- **Tab icons:** 115 at 1.5pt.
- **Checks inside the pink 24 circles:** 15 at 0.81pt.
- **Chevrons and small glyphs:** 26 at 0.75pt.
- **Other icons:** 1.0 to 1.25pt in buttons, the fill bar and the live
  bar.

**The code is right.** `Icon.tsx` draws every icon at 1.75pt at any size
and 2pt when lit. So the fix is in Paper:
1. Make the System page's chevron, check and tab parts exactly 1.75 and
   2.0.
2. Re-stroke every screen from them.

**In the code, chevrons come in four sizes and two colors:**

| Where | Size | Color |
| --- | --- | --- |
| Settings rows | 12 | `ink-4` |
| Other list rows | 14 | `ink-3` |
| The ticket | 13 | `ink-3` |
| Section headers | 11 | `ink-3` |
| Choices | 12 | `ink-4` |

The rule says 12 to 14 and `ink-4`. *Recommend:* 12 `ink-4` in rows, and
11 `ink-3` only where a chevron follows words ("Applied 142 ›").

**Sizes otherwise follow the rule:** 24 tabs, 20 icon buttons, 18 tiles,
16 in 36 buttons. Button icons are 18 in the code. The doc says 16 in one
place and 20 in another (section 13).

## 9. Copy

**"We" and "us":**

| Where | Text |
| --- | --- |
| Paper | "What we sent" (title and link), "We'll send", "What we found in …" |
| `features/job-detail/JobDetail.tsx:100` | "We couldn't pull the full job description yet." |
| `features/redesign/email/SetupSheet.tsx:74, 86, 88, 90` | "We'll check.", "What should Gmail send us?", "We open only job mail…", "A Gmail filter we write for you." |
| `features/onboarding/Onboarding.tsx:142` | "We'll send an alert when…" |
| `features/companies/Companies.tsx:65` | "We'll look into adding it." (old screen) |

**Other copy drift:**

- **Stage names:** "No reply" still appears in TR2c, C·1, 1B, 5A and O7.
  The stage is Ghosted.
- **Times:** three ways.
  - Jobs shows age: 2h, 1d, 1w.
  - Tracker shows hours, then dates.
  - Today mixes hours with a clock time (R18).
  - *Recommend:* within a day, "9h"; after that, "Oct 12"; future events
    keep their clock time.
- **Sample people:** two Jordans (Q10).
- **The same thing named two ways:** "Ghosted" and "No reply". "Pause" is
  a row in O12 but a "Paused until" card in A2.

## 10. Interaction patterns

| Pattern | What's drawn | Verdict |
| --- | --- | --- |
| Back | A 44 round button, top left, on every pushed page | ✓ |
| A page's own actions | Share and more in one 44 capsule, top right | ✓ |
| Pinned actions | Job page, event, application, person, Help, editors | ✓ The line above shows only when content scrolls under, as the rule says |
| Sheets | Grab bar or close button | Q7 |
| Sheet steps | Round Back left of Done | ✓ |
| Destructive | Red rows (wrong red, R8); an ink "Forget" (R9); the iOS alert for Replace | Fix R8, R9 |
| Disabled | Gray with `ink-3` (Help) ✓; `ink-4` (Report) ✗; faded pink (3.3) ✗ | R1, R6 |
| Tappable words | `ink` Medium ("Not right?", "What we sent ›") ✓; `ink-3` ("See all 12", "Clear") ✗ | Section 2 |
| Selection | Checks right in a review, left in a select mode | Q12 |
| Swipe actions | Pink Save, blue Read, green Applied, graphite Hide | Fine (revealed only by a swipe). Green here isn't Offer, though, and blue is the Interviewing mark. Write that swipe colors borrow the tile meanings |
| Success | Toast with a pink check ✓; green checks in the Apply flow ✗ | R2 |
| Hit areas | 36 close buttons, 34 "Show" capsules, the copy mark in a row, "Clear", "See all" | Each needs a 44 target in code (`hitSlop`) |

## 11. People and intent

The audience is new grads, early career and mid-career. Three people to
read the screens as:

- **Maya, new grad.** Applies widely, opens the app several times a day,
  worries about missing something. Wants fresh jobs, quick applying, and
  proof it went through.
- **Dev, two years in a job.** Looks quietly, a few times a week, mostly
  from alerts. Wants only strong matches, and to spend little effort.
- **Sam, switching after four years.** Picky. Writes to people and follows
  a few applications closely. Wants the right person and no forgotten
  follow-ups.

| Area | Who, and why they're here | The one job | Pink action | Verdict |
| --- | --- | --- | --- | --- |
| Today | Maya, each morning | What needs me, what changed, what's next | Review and send (Ask first) | Strong. Fix R16 to R18. The release version (T1r, T3r) is right to lead with "12 new jobs today" |
| Jobs | Maya and Dev, scanning | New matches; save or hide fast | None | No current drawing (Q1). A long way to the first job (section 6) |
| Job page | Anyone deciding | Is it worth it? Then apply | Apply | Strong. "Fits your search" earns trust. Q2 and Q4 change its look |
| Apply flow | Maya, applying in volume | Send it, trust it went | Apply, Answer, Send to … | Strong. The proof screen is the right answer to "auto-apply lies". Fix the copy (R3, R4) and R1, R2 |
| Search | Sam, looking for a place | Find a company, person or event | None | Fine. Stale parts (section 2) |
| Company page | Sam, researching | Is this a place for me? Who works there? | Follow (outline) | Three tabs with two different headers; copy E1's |
| Outreach | Sam | The right person; send; don't forget the follow-up | Write to … | Strong and consistent |
| Tracker | Everyone, weekly | Where everything stands | None | Fine. Stale marks and copy |
| Application | Checking one | Where it stands; log a change | None (gray Change stage) | Five approved drawings still pink |
| You and settings | Rare visits | Change one thing fast | None | Auto-apply is the outlier (Q6); Answers is drawn twice (Q11); Plan contradicts Outreach (Q5) |
| Resume and Answers | Maya, once, at setup | Get it right once | Use this resume, Save | Fine. R5 |
| Email tracking | Anyone, once, at a computer | Finish setup without getting lost | I added it | Fine. Sheet or page is parked by you |
| Errors and loading | Rare | What happened, what to do | Only when it's a way somewhere else | The most consistent round |
| Dark | The same people at night | Same jobs | Same | D1's You is stale; Your search dark is pure black |

**Across the app:**

- **Pink restraint mostly holds.** Today is the pinkest screen: a pink
  button, a pink header, three pink dots and the lit tab. Every one of
  them means "needs you", as the rule says.
- **One question, only if it bothers you on the phone:** whether three
  dots plus the header is one signal too many. Either one alone would
  carry Needs you.

## 12. Code drift found on the way

For the build list. Nothing was changed.

- **`ListItem`:** no chevron space when there's no chevron (known).
- **Section header spacing:** `List.tsx` uses 16 above. It follows Q8.
- **Chevrons:** four sizes and two colors (section 8).
- **Off the 4pt scale:**
  - the ticket's stamps (`columnGap` 10, padding 10/6, gap 1);
  - `SwipeRow` (gap 3);
  - `Toast` (gap 10);
  - `CopyField` (10, which centers the button, fine).
- **`Badge.tsx`'s comment** still says "pastel pink with dark text".
- **The old kit's `kit/Field.tsx`** uses `ink-4` placeholders. The
  redesign's fields use `ink-3`.
- **"We" strings** (section 9).
- **The tab bar** has four tabs and no Today (Q1).
- **The company page** shows "Follow · Soon" in gray. When Follow ships,
  it's the outline button.

## 13. Contradictions in design-system.md

1. **The unread dot:** "a 7pt pink dot" (Status) and "one 8pt pink dot"
   (rows). The code uses 8.
2. **Section headers:** "16 above, 4 below" and "24–32 between sections"
   (Q8).
3. **Button icons:** "16 on button labels" (Icons) and "Button icons are
   20" (changelog). The code uses 18 on large buttons and 16 on small ones.
4. **The tabs:** "Jobs, Tracker, Search and You", but Today is drawn as a
   tab (Q1).
5. **Sheets:** "a grab bar instead of a close button", but the "Did you …?"
   rule gives a close button (Q7).
6. **Logos:** "8 for logos" in the radius list, but logos are 10 at 40
   (quarter rule, section 7).
7. **Chevrons:** "12–14 for chevrons and checks", but the list's check is
   17 in the code.
8. **Placeholders:** "Placeholders use the fill grey" (D2's caption), but
   placeholders are `ink-3` (the color table and the code).

## Fix order

1. **You answer Q1 to Q12.** A number and a word each is enough.
2. **Draw three comparisons, judged on the phone:**
   - the pink button (Q2);
   - the paper (Q4);
   - the tab icons (Q3).
3. **Fix Paper by copying, not redrawing:**
   - the out-of-date screens (section 2);
   - the rule breaks (section 3);
   - the System page's chevron, check and tab parts, then re-stroke every
     screen from them;
   - Paper's tokens: `good`, `scrim`, one glass, stage and tile tokens,
     two shadows.
4. **Then, in one change:**
   - the doc's contradictions (section 13);
   - `tokens.ts` (`ink-3`, amber, and the pink if it changes);
   - the System page.
5. **Add section 12 to the build list.** Then build, then the backend,
   then release.
