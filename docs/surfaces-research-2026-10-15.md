# Surfaces in light mode: research and one rule (2026-10-15)

The owner noticed the app uses a lot of gray: gray cards on a white page for
nearly every group, plus gray buttons. They asked for research on Mobbin and
one fix for the design system, good in light mode as well as dark. Paper:
"Gray · now, and what I'd do" and "Surfaces · one rule (from Mobbin)" on the
Apply flow page.

## What Mobbin shows (iOS, light mode)

**Profile and account tabs are plain white rows.** Each has an avatar or name
on top, then rows with thin lines, grouped by space or a small heading:
- [Klarna](https://mobbin.com/screens/178c1206-35d0-4465-9179-a8682ba6eecf)
- [Hers](https://mobbin.com/screens/461054a9-9d4d-4566-bd2d-9b165f29fde0)
- [Viator](https://mobbin.com/screens/d81d9c53-bdc8-4ac9-b875-fd5628233468)
- [Whatnot](https://mobbin.com/screens/4540019d-ffeb-468c-ab6e-6e4dfa5709c8)
- [Splitwise](https://mobbin.com/screens/df8ee205-c7f1-4f2b-861b-7fb0c04e6e16)
- [Finimize](https://mobbin.com/screens/60efec7f-30fa-43ab-a3db-26d2cb6a9d9b)

**White cards on a gray page** show up on dedicated settings screens, usually
pushed or in a sheet, not on a main tab:
- [GitHub](https://mobbin.com/screens/22579698-97aa-4cec-892a-d677a4bf61e8)
- [Todoist](https://mobbin.com/screens/5017783b-5798-494d-b56e-0b665cd919e3)
- [Structured](https://mobbin.com/screens/4be8fb61-ee6b-42d1-aeff-91d2a57da4db)
- [Wispr Flow](https://mobbin.com/screens/4051a3c0-bc35-4b1d-8da6-13ebb3fa4781)
- [Speak](https://mobbin.com/screens/7dfe4655-95f5-44e9-b830-8e6d85ea9e53)
- [Telegram](https://mobbin.com/screens/823ca492-b21a-4ac1-adc8-df36d7a77151)
  is the exception: its Settings tab is gray.

**Gray cards on a white page,** our current pattern, appeared once
([NGL](https://mobbin.com/screens/2ead27ba-ec0e-4818-b14f-037748c06cef)). It
isn't how strong apps draw lists.

**Receipts and "what you submitted" pages are plain and white, and lead with
the status:**
- Receipts:
  [Fresha](https://mobbin.com/screens/8145524c-ac97-4a9a-9ba6-430ff6e0a021),
  [On](https://mobbin.com/screens/e3b8cd54-6440-4689-9d33-8514ee78c65a),
  [lululemon](https://mobbin.com/screens/474723de-2c9c-4015-a85d-4c594714ae2e),
  [Shipt](https://mobbin.com/screens/7d3f5702-0096-433e-8ecd-a37f6812daf7).
- Progress as a short vertical timeline with checks and times:
  [Bumble](https://mobbin.com/screens/09426d05-9e3c-4a74-b206-da7d04e07ba4),
  [Alan](https://mobbin.com/screens/751decaa-80b3-4dfd-bb78-4f39c3718578),
  [Too Good To Go](https://mobbin.com/screens/acfd8d83-7da5-4fee-97ba-93f70147bde6),
  [Klarna](https://mobbin.com/screens/289c0463-1d24-49a9-89a7-904038ca5cf6).
- Submitted answers in one pattern, the question small above the answer:
  [Alan](https://mobbin.com/screens/711585d9-f95a-43e4-93d1-6dfcbbf3ba85),
  [Glassdoor](https://mobbin.com/screens/8d6572aa-85dd-47cb-b928-e88ef023e20b),
  [Fiverr](https://mobbin.com/screens/361c8c18-7c3d-4f09-816c-13a54cf9fb18).
- A sent file as a file row with an icon:
  [LinkedIn](https://mobbin.com/screens/504c7582-941a-431c-9f65-f2eb1bda251d).

## Why ours looked off

- One gray was doing three jobs: groups, buttons and fields. A group looked
  like a button, and a screen read as stacked gray blocks.
- "What we sent" mixed row types in one card: a settings row, a two-line
  question and answer, then another settings row.
- We were already breaking our own rule, "one boxed thing per screen"
  (`design-grounding.md`), and the owner raised too much gray on Oct 13.

## The proposed rule

1. **Every page is white.** One background for the whole app, You included.
2. **Lists are plain rows with thin lines,** under a small heading. Settings
   too.
3. **Gray means you can press or type:**
   - buttons, fields and chips;
   - round buttons;
   - the selected tab's oval.
4. **One box per screen at most:** the thing to act on now, like a question
   to answer.
5. **Paper objects** (the ticket, the stub) are their own surface, one per
   screen.
6. **Dark mode keeps the same structure.**

The other way, a gray settings page with white cards, is drawn beside it. It
makes You the only gray tab, which is what the owner questioned, so it isn't
the pick.

## What changes if the owner agrees

- **Kit:**
  - `ListGroup surface="fill"` becomes plain rows.
  - Sheets' menu rows drop their gray card. This replaces the Oct 12 rule
    "rows in a flat gray card".
  - The You tiles stay, on white.
- **Boards to update:** Ask first (3.2, 3.3), the queue (4.2, 5.3), What we
  sent (6.3 becomes v2), and You.
- **Docs:** `design-system.md` ("Surfaces, depth and shape", "Lists on a
  white page") and the System page Parts.

## The owner's counter: a gray page with white cards (same day)

The owner leaned towards Apple's Settings look everywhere, citing "higher
things are lighter".
- That rule holds. Apple's grouped style (white cards on a light gray page)
  and its dark mode (lighter cards on black) both follow it.
- Our gray cards on white broke it: they read as sunken.
- Both systems are now drawn on the same five screens (Jobs, Today, Apply to
  9, What we sent, You), on Paper "Two systems · white page or gray page":
  - **A:** a white page with plain rows.
  - **B:** a gray page with white cards. Here the search field, chips and
    round buttons turn white, or they vanish into the page.
- The owner picks.

## C: one light warm gray page (owner's idea, same day)

The owner disliked B's white job rows on a darker page and asked about a
lighter gray as the one background, rows included, and whether that breaks
contrast standards. This research was done on the web, not Mobbin.

**Contrast standards don't forbid it.**
- WCAG 1.4.11 asks for 3:1 only on what identifies a control or a graphic
  you need. It says it "does not require that controls have a visual
  boundary".
- A page or card color has no minimum. Text still needs 4.5:1 (1.4.3).

**Measured on our tokens (contrast against the page):**

| Token | White | 0.982 warm (C) | 0.962 (today's gray) |
| --- | --- | --- | --- |
| `ink` | 18.8 | 18.0 | 16.9 |
| `ink-2` | 9.2 | 8.8 | 8.3 |
| `ink-3` | 5.3 | 5.1 | 4.7 |
| `accent` (pink text) | 5.0 | 4.8 | **4.48 (just fails)** |
| `separator` | 1.33 | 1.27 | 1.19 |
| `fill` (controls) | 1.17 | 1.12 | 1.05 |

- A lighter page helps the pink text.
- Controls need a see-through fill (`ink` at about 5.5%), which is how
  Apple's system fills work. That keeps them visible on the page and on
  white sheets alike.

**What the systems do:**
- Apple has both:
  - `systemBackground` (white) with `secondarySystemBackground` (gray)
    "layered on top";
  - `systemGroupedBackground` (#F2F2F7) with white "content layered on
    top".
- In light mode, depth comes mostly from shadow, and tone groups things.
  "Lighter is higher" is strictest in dark mode (Apple, Material,
  Atlassian).
- Material 3 separated tone from elevation. Its light-theme surface
  containers sit a few tone steps apart.
- Refactoring UI-style guidance: lighter than the page reads as raised, and
  darker reads as a well. That's why our gray cards looked sunken.

**Off-white:** designers commonly prefer it to #FFFFFF for glare. One W3C
contributor noted that the eye adapts to the brightest thing in view, so
an all-off-white screen soon reads as white. Keep some true white in view
(the tab bar, sheets, the one box) so the page still reads as warm paper.

**C, drawn on the board:**
- The page is `oklch(0.982 0.004 80)`, and rows sit on it.
- Controls use the see-through fill.
- White is only for what floats: the tab bar, sheets, toasts, and the one
  box per screen with a soft shadow.

## Decided: Mist, white cards, outlined chips (same day)

The owner rejected C's warmth ("don't go pink warm"), preferred B's
settings, and asked to see the choices on the phone. An owner-only lab in
You switched the light page between Snow #FBFBFB, Mist #F8F8F9, Cloud
#F5F5F6, Apple gray #F2F2F7 and Paper #FAF9F5 over the air. The owner then
picked:

- **The page is Mist, #F8F8F9**, neutral with a trace of cool. Rows and
  feeds sit on it; nothing is drawn behind a job row.
- **Settings cards and sheets are white,** B's settings, one step lighter
  than the page.
- **Controls use a see-through fill** (ink at 5.5%), so a button reads the
  same on the page, a card and a sheet. Search stays the one darker well.
- **Chips that are off are outlined:** clear inside with a 1pt ring
  (`outline`, ink at 16%; 30% with Increase Contrast). Filled gray chips
  would sit on a gray page as one more gray block.
- **The ticket and stub keep their own `paper`** (#F3F2F0) so they stay
  objects rather than white cards.
- On Mist, `ink-3` measures 5.06:1 and pink text 4.79:1, so both pass.

Built in `tokens.ts`, `Chip.tsx` and `Ticket.tsx`; the lab is removed.
`design-system.md` records the rule.

Sources:
- [W3C Understanding 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast)
- [Apple UIKit UI element colors](https://developer.apple.com/documentation/uikit/ui-element-colors)
- [Flutter CupertinoColors (iOS values)](https://api.flutter.dev/flutter/cupertino/CupertinoColors-class.html)
- [Material 3: tone-based surfaces](https://m3.material.io/blog/tone-based-surface-color-m3)
- [Atlassian elevation](https://atlassian.design/foundations/elevation)
- [W3C css-color-6 thread on off-white adaptation](https://lists.w3.org/Archives/Public/public-css-archive/2023Nov/0123.html)
