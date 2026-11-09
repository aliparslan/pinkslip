# Icon audit (Nov 8)

You asked for every icon in the codebase to be checked and fixed once and for
all, after the alert buttons turned out to be using Apple's icons.

**The rule:** one idea, one icon, on iOS and the web, all Phosphor, from the
table in `shared/icons.ts`. The rule was already written down. Nothing
enforced it, so it drifted.

## What was wrong

### iOS

| Where | Was | Now | Reaches phones by |
| --- | --- | --- | --- |
| Alert buttons (Save, Queue, Hide) | Apple's icons | Pinkslip's, then Apple's again in 1.3.12, with the robot back on Queue as a loose image (see Left alone) | New build |
| You → Swipe actions, the pickers | Apple's icons, including the paperplane for Queue | Pinkslip's, bot for Queue | Update |
| Old screens: alerts, onboarding | `BellRinging` | `Bell` | Update |
| Admin's locked page | `LockSimple` | `Lock` | Update |
| Old swipe row, "Didn't apply" | `ArrowCounterClockwise` | `ArrowUUpLeft` | Update |
| Job row and job page menus, in code | Apple's names, converted or unused | Pinkslip's names directly | No visible change |

Already right, and now checked automatically: the tab bar, every list and
page icon, and the 19 images behind iOS's own menus. Each of those images was
compared with Phosphor's own drawing and matched, except the bot, which is
drawn for Pinkslip on purpose.

### Website

The website imported icons by hand, so the same idea had a different icon
from iOS.

| Idea | Was | Now |
| --- | --- | --- |
| Share | `ShareNetwork`, `ShareFat` | `Export` |
| More | `DotsThreeVertical` | `DotsThree` |
| Mark as read | `EnvelopeOpen` | `EnvelopeSimpleOpen` |
| Turn on alerts | `BellRinging` | `Bell` |
| Undo, restore, reset | `ArrowCounterClockwise` | `ArrowUUpLeft` |
| Offline | `WifiSlash` | `CloudSlash` |
| Pay | `Money` | `CurrencyCircleDollar` |
| Appearance | `PaintBrush` | `CircleHalf` |

## Added to the table

These were real ideas with no entry, so they went in rather than being
changed: `Info`, `Warning` (a caution, next to the error circle),
`PencilSimple` (edit), `Trash` (delete), `UploadSimple`, `Eye` (peek at a
job), `Compass` (page not found), and `BookmarksSimple` (the website's Library
tab).

## How it stays fixed

- `scripts/check-icons.ts` runs in `bun run check`. It fails on a Phosphor
  icon that isn't in the table, on Apple's icons anywhere on iOS including
  alert buttons, on a menu image that isn't its Phosphor drawing, and on an
  alert button naming an image the app doesn't ship. Tried against three
  planted mistakes: it caught all three.
- The kit's plain `Menu` can no longer take an icon at all, so a menu with
  icons has to be `GlyphMenu`, which only accepts Pinkslip's.

## Left alone on purpose

- Alert buttons, since 1.3.12: Pinkslip's catalog images showed in the simulator
  but came up blank on a real phone, so Save and Hide use Apple's symbols, which
  iOS draws itself. That line is marked `intentional` in `AlertActions.swift`.
  Queue tries the robot as a loose PNG in the app (`alert-bot@2x.png`, `@3x`)
  because iOS 27 simulators show it in every format, so only a build on a real
  phone can tell whether this one works.
- Kit pages, which compare icon sets side by side.
- `GlyphMenu`'s fallback for builds older than 1.3.9, which don't have the
  newest image. It's marked in the code.
- "Apply for you?" alerts have words and no icons, as drawn.

## For you to decide

**Library and Tracker.** The website's Library tab uses stacked bookmarks and
iOS's Tracker tab uses the path. They're the same part of the product with
different names and icons. I kept both, since changing either is a naming
call too.
