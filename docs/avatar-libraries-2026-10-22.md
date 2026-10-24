# Default avatars: library survey (2026-10-22)

The owner wants default avatars to give the app a little character. This is
the survey; nothing is decided. The gallery (private artifact) shows 86 sets
from 10 libraries, each drawn for the same eight people, in the library's
colors and in Pinkslip's, at the app's sizes (40 People row, 56 You):
https://claude.ai/artifact/QFKL35gn6CTYLYan2G8qSo

Today the app shows initials: Founders on `fill` for People (40), and on `bg`
on You (56).

## Libraries

| Library | Sets | Code license | Art license | iOS path |
| --- | --- | --- | --- | --- |
| DiceBear 10.7 (`@dicebear/core` + `@dicebear/styles`) | 61 | MIT | Per style: 42 CC0, 14 CC BY 4.0 (credit the artist), 4 Pablo Stanley "free for personal and commercial use", 1 MIT | SVG string → `SvgXml` (react-native-svg is already in `apps/native`) |
| Boring Avatars 2.0.4 | 6 | MIT | MIT | Community fork `@mealection/react-native-boring-avatars`; no Marble (needs SVG filters) |
| Facehash 0.1.0 | 1 (+ flat) | MIT | MIT | Web only (HTML + CSS 3D); Flutter and Svelte ports, no RN |
| cast-avatar 1.9.0 | 10 | MIT | MIT | SVG string → `SvgXml` |
| Bean Heads 0.3.3 (`@bigheads/core`) | 1 | MIT | MIT | React SVG components; community RN port |
| react-nice-avatar 1.5.0 | 1 | MIT | MIT | Web only |
| Avvvatars 0.4.2 | 2 | MIT | MIT | Web only (goober CSS-in-JS) |
| Multiavatar 1.0.7 | 1 | Own license | Own license, restricts how the art is used | SVG string |
| Jdenticon 3.3.0 | 1 | MIT | MIT | SVG string |
| minidenticons 4.2.1 | 1 | MIT | MIT | SVG string |

Looked at, not rendered: react-notion-avatar (published with a whole app's
dependencies; DiceBear's Notionists covers the look) and hosted services
(Gravatar, RoboHash, Vercel's gradient avatars), which would send names or
emails to a third party.

## What matters

- **DiceBear's licenses are per style**, read from each definition's `meta`.
  CC BY sets (Adventurer, Big Ears, Big Smile, Croodles, Dylan, Fun Emoji,
  Glyphs, Micah, Miniavs, Personas, Toon Head) need an on-screen credit.
- **iOS readiness:** a plain SVG string draws through `SvgXml`. These DiceBear
  sets use blend modes or filters and need a check on a phone: Big Smile,
  Bottts, Disco, Fun Emoji, Glass, Icons, Initial Face, Initials, Loops,
  Marbles, Micah, Notionists (not Neutral), Personas, Rings, Shape Grid,
  Stripes, Triangles.
- **The same face on web and iOS** needs one engine on both. DiceBear's
  implementations share one PRNG, so a seed (say, the user ID) gives the same
  avatar everywhere.
- **Our own set is possible.** A DiceBear 10 style is a JSON definition of
  parts and colors. A set drawn in Paper (the mascot's ink-outline language,
  for example) could run through the same engine, with no credit to give.
- **The Pinkslip take** swaps backgrounds for soft tints of the tile colors
  and clothes or shapes for pink, blue, green and amber; skin and hair keep
  the library's tones.

## Claude's first read

Judged against the mascot notes (one flat shape, tiny face, ink outline,
expressive brows) and the calm of the bar pages. A first read, for the owner
to overrule:

1. DiceBear Notionists Neutral: ink line faces with expressive brows. CC0.
2. DiceBear Lorelei Neutral: the same idea, finer lines. CC0.
3. DiceBear Line Face: two dots and a line. CC0.
4. DiceBear Thumbs: one flat lumpy shape with a tiny face. CC0.
5. DiceBear Gaze: lumpy bodies, just eyes. CC0.
6. Facehash, flat: dot or cross eyes on flat color. Web only.
7. DiceBear Initial Face: keeps today's initials, adds a face. Blend mode.
8. DiceBear Croodles Neutral: hand-drawn doodles. CC BY.
9. DiceBear Open Peeps: hand-drawn ink people. CC0.
10. Boring Avatars Beam: the familiar face on two colors.

## Next

The owner stars favorites in the gallery. Then, per Paper first, the
shortlist goes into Paper on the You and People screens, light and dark,
before any code.
