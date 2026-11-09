# Progress on the live bar (Nov 8)

The owner found the opaque lilac fill too bold against the glass bar. Before
it, a see-through purple looked muddy. These notes are why both failed and
what to do instead.

## What Apple says

- [Color](https://developer.apple.com/design/human-interface-guidelines/color):
  Liquid Glass has no color of its own and takes it from the content behind
  it. Color on it should be used sparingly, for things that benefit from
  emphasis, such as status indicators or primary actions.
- [Materials](https://developer.apple.com/design/human-interface-guidelines/materials):
  the point of the material is to let content show through while the controls
  stay legible.

## What that means here

A wide fill can't work either way:

- **Opaque** covers the glass, so half the bar stops being glass. That's the
  boldness.
- **See-through** mixes with whatever is scrolling behind it. Job titles ghost
  through the purple, and the color changes with the row underneath. That's
  the mud. Tested over rows and over saturated tiles.

Color has to stay small and sit on top of the glass.

## Precedents

Thin progress inside a floating capsule is an established pattern:
[v0](https://mobbin.com/screens/c3595046-4b68-47fc-ae68-11bca78cd13b)'s
floating toolbar, [MacroFactor](https://mobbin.com/screens/ecacc2c2-df97-43a2-ad59-a457aa4d605b)'s
counter pill, and a ring in the Dynamic Island in
[Tide Guide](https://mobbin.com/screens/c7957855-e90b-48d7-8858-2dc93907da18).

## Options tried on real glass

| | Option | Result |
| --- | --- | --- |
| | Opaque lilac (today) | Reads as a solid slab on the glass |
| 1 | See-through purple | Rows ghost through it; muddy |
| 2 | The tab bar's clear oval | Stays glass, but loses the purple |
| 3 | Thin line under the words | Glass stays glass; purple stays in the bot and the line |
| 4 | Ring round the bot | Most compact; the amount is harder to read |

Recommended: 3, with the fill easing forward as the current one does. Waits on
the owner's pick.
