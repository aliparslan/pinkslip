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
