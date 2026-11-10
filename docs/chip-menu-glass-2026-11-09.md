# The glass closing back into a dropdown chip (Nov 9)

Owner, on update 01a1c24a: the chips are good, but the glass going back into the
chip looks really weird.

Measured on the iOS 27 simulator, frame by frame, on Debug builds. Not yet seen
on a phone.

## What was wrong

iOS grows a menu out of the view it's attached to, hides that view while the
menu is open, and closes the glass back into it. Since 3a27e8a our menu was
attached to a clear layer over the chip, and the chip you see was drawn
separately. So iOS hid the clear layer and left the visible chip on screen.

| When (from the start of the close) | What the frames show |
| --- | --- |
| 0 to 95ms | The menu shrinks and fades as it travels up |
| 115 to 153ms | A sliver of glass lands on the chip and warps the word "Level" |
| 167 to 210ms | A small speck stays by the "L", then goes |

## How Apple closes a menu

| Control | While open | Closing |
| --- | --- | --- |
| Safari's "…" button | The button is gone | The glass shrinks to its spot over about 200ms, the dots appear inside it, and it becomes the button by about 340ms |
| Our You → Appearance (visible word as the trigger) | "Automatic" is gone | The glass fades as the word resolves out of a blur, sharp by about 200ms |

Both end the same way: the thing that opened the menu comes back out of the
glass. Neither shows the source and the glass at the same time.

## Other apps (Mobbin, 16 results from two searches)

Still screens, some possibly older than Liquid Glass, so they show what opens
and not how it closes. None showed a menu anchored under a chip, which is a
limit of two searches, not proof nobody does it.

| App | Chip | What opens |
| --- | --- | --- |
| [Neo Financial](https://mobbin.com/screens/b6d67b5f-3fb6-4986-83c5-2fe330bbc912?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp) | "Type" with a caret | Bottom sheet, pick one, Apply |
| [talabat](https://mobbin.com/screens/7ee3a6f5-272f-4687-894b-9109fefca119?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp) | "Sort by" with a caret | Bottom sheet, pick one, Apply |
| [Apple Music](https://mobbin.com/screens/05210eb9-6971-4bfa-a5dc-94e7e2fc629b?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp) | "Genres" | Floating sheet with Clear |
| [Tripadvisor](https://mobbin.com/screens/c64a2e5e-7743-459e-b7f4-a9dcc1240742?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp) | Amenities chip | Floating sheet with Reset, Apply |
| [Slack](https://mobbin.com/screens/e8207b25-5501-4ff9-88ea-6d73c93d5ec5?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp) | Filters with carets | Open state not seen |
| [Public](https://mobbin.com/screens/418a7a3a-db69-43a0-9735-2e20841ec39e?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp) | Filters with carets, Clear row | Open state not seen |

Developers also report glitches when a custom button closes a glass menu:
[a black flash](https://developer.apple.com/forums/thread/826863),
[a rectangle that snaps](https://developer.apple.com/forums/thread/799491),
[a glitchy dismiss on 26.1](https://developer.apple.com/forums/thread/808720),
[the button vanishing briefly](https://developer.apple.com/forums/thread/803761).
No official Apple fix turned up, so a phone may show something the simulator
doesn't.

## First fix, dropped

A real copy of the chip inside the menu, with the drawn chip standing in while
it moved, fixed the smear but failed the owner's test on the phone: fill all
three chips in dark mode, then Clear. It stacked a drawn layer, a copy, a timer
and a replaced host on one tap.

| On Clear, dark mode | What the frames showed |
| --- | --- |
| About 70ms | Three blank white pills: the words flipped to white before the fill left |
| 100 to 175ms | Pills fading through gray with the words gone |
| 70ms to over 1s | The whole list dimmed, then came back |

## Starting over

Everything on that row was React Native imitating what iOS does. Now:

- **The row is native.** `FilterChips` is one SwiftUI row, so the width, the
  push, the fill and the words move in one transaction, and the glass closes
  into a label that really is its own.
- **A chip that says something new is a new chip.** iOS clips a menu's label to
  its old size for about a second after the menu closes, whoever draws the
  label. That was the square block, and it's why resizing never worked. The
  same applies to the sort on the section header, which twitched sideways.
- **A list only dims for a wait you'd notice.** New rows that are ready replace
  the old ones. Dimming starts after 250ms.

Removed: the drawn chip, the copy, the width measuring, the timers, and the Kit
switches "A picked chip grows" and "The menu lands on its chip".

| After starting over | Result on the simulator, dark mode |
| --- | --- |
| Clear | One beat of about 150ms, no blank pills, words always readable |
| Pick an option | The glass closes into the chip, which cross-fades to its new look; no square block |
| The list | No dim on a change; section titles no longer twitch |

## Known limits

- Seen only on Debug simulator builds so far.
- A short Location list (a menu that stays open for multi-select) keeps one chip
  across changes, since replacing it would close the menu. It can show the
  square block for about a second after closing. Long lists use the drawer.
- The caret is iOS's chevron, not Phosphor's: a Phosphor one can't be drawn in a
  native label without a new build.
