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

## The fix (Kit: "The menu lands on its chip", off by default)

At rest the menu holds a real copy of the chip and the drawn chip is hidden, so
iOS hides the only chip on screen and brings it back out of the glass. While
the chip is growing or shrinking, the drawn chip shows and the copy waits.

Two things that didn't work, for whoever touches this next:

- Resizing the menu's host. It keeps a stale width and clips the copy to a
  square block for 450 to 620ms. A new width now gets a new host (`key`).
- Timing the handover later. The clip is not a delay the host recovers from on
  its own schedule.

Both layers change in one render rather than through a shared value, so the
copy can't show a frame of the new look early.

| After the fix | Result on the simulator |
| --- | --- |
| Close, unselected | The chip is gone while open; "Level" resolves in the glass by about 230ms |
| Close, selected | The black pill rises out of the glass, full size by about 400ms |
| Pick an option | Stays a pill; no block, no flash at the handover |
| Clear | Fill fades, chip shrinks, the others slide over |

## Known limits

- A short Location list (a menu that stays open for multi-select) keeps the old
  close. Replacing its host would close the menu mid-pick. Long Location lists
  use the drawer and have no glass.
- Opening a chip within 360ms of changing it still closes the old way once.
