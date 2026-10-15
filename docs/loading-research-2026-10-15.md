# Loading: research (2026-10-15)

The owner asked whether a soft pulse on placeholders is what NN/g
recommends. It isn't, quite.

- **NN/g ([Skeleton screens 101](https://www.nngroup.com/articles/skeleton-screens/)):**
  - Placeholder layouts suit full-screen loads under about 10 seconds; a
    spinner suits one part of a page; over 10 seconds, a progress bar
    with an estimate; uploads and conversions get a progress bar, not
    placeholders.
  - Under 1 second, show nothing: a flash of placeholders is annoying.
  - Static grey boxes are the most common. Pulsing or shimmering ones can
    be "distracting, annoying, or even create accessibility problems"; it
    doesn't recommend either.
  - A placeholder of only the frame (header, footer, background) is never
    worth it.
- **A small study** ([summarized on UX Collective](https://uxdesign.cc/what-you-should-know-about-skeleton-screens-a820c45a571a)):
  a slow left-to-right sweep felt shorter than a pulse, and slow motion
  felt shorter than fast. Its authors say the sample was too small to
  rely on.
- **Viget (136 people, via search summaries):** placeholders felt slower
  than a spinner in an unfamiliar layout; they work when people already
  know the screen's shape.

**For us:** placeholders in the real row and page shapes, which people
already know; a soft, slow pulse (owner's call, taste rather than proof),
still under Reduce Motion; nothing for the first second; words and a bar
for long jobs.
