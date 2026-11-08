# aiforui.dev, against Pinkslip

Emil Kowalski's course on steering agents for interface work, bought by the
owner and shared on 2026-11-07: 20 lessons, 28 skills, the Lapse animation
inspector, a 244-term vocabulary and a reading list ("the Vault"). Second
pass, lesson by lesson, with what each one means for this repo. The first
pass was too thin. Directions from here are collected in
[directions.md](directions.md); the Vault's reading is in
[reading.md](reading.md), its people in [people.md](people.md).

The pasted lessons carry personal install tokens for the course's npm
registry (they encode the owner's email). They never go in this public repo,
and nothing here has been installed from them.

## Is it worth keeping?

Little of it repeats animations.dev. Two lessons are near-copies
(Prototyping interfaces, and Developing taste), and the vocabulary's motion
terms overlap. The rest is new.

The lessons themselves are short, about two hours of reading. Most of the
course's value is in the skills it sells, and the lessons are their manual.
Emil's public repo (`emilkowalski/skills`) has 17 skills; 14 are installed
here already. The course has 28, all named `emil-*`. The lessons name 25 of
them, and three (animations, mobile-native, prototype) are fuller versions
of public ones. They fall into three groups:

- **Web-first.** `surfaces`, `forms-and-inputs`, `marketing-pages`,
  `performance`, `mobile-native`, `touch-and-accessibility`, plus the
  `ask-lapse` helper for Lapse. Useful for pinkslip.work; little use for the
  Reanimated app.
- **Platform-neutral.** `design-foundations`, `typography`, `color`,
  `component-design`, `design-system-docs`, `ui-polish`, `ui-review` and
  `prep-for-prod` (the iOS app fits about half of its lanes).
- **Process.** `product-thinking`, `borrow-a-brain`, `build-a-tool`,
  `get-creative`, `prototype`, `writing-skills`, the `ask-emil` router, and
  the two vocabulary lookups.

The verdict depends on whether the owner will run those skills. Without
them, most of the lessons describe how this project already works. With
them, the process skills and `prep-for-prod` are the parts no free source
covers. The owner should install them at the user level
(`~/.claude/skills`), never in the repo. Then run one real task through them
before deciding on a refund: the prep-for-prod audit is the obvious one.

## Lesson by lesson

**Mental models; Friction as a feature.** Add friction only where your
opinion matters: when writing the brief, not when summarising feedback. The
tool is being questioned before building (`emil-product-thinking`, or Matt
Pocock's grill-me). This already happens here as "Options before plan".
Matt's `to-questionnaire` goes one step further: it turns a decision only
the owner can make into a markdown form they answer when they have time.
That fits the owner-decision backlog in [directions.md](directions.md).

**What are skills; How to write good skills.** A skill is a folder: a short
`SKILL.md` that acts as a table of contents, with depth in files that load
only when needed (progressive disclosure). The lesson's rules:

- Write down the why, so the agent can extend a rule to cases it doesn't
  name.
- Be strict: "under 300ms", never "reasonably short".
- Every line must change behaviour.
- One skill per aspect.
- Let agents write skills from your notes.

For this repo: the owner's taste lives in about 35 feedback memories on one
Mac and in a CLAUDE.md that only local sessions read. Those are rules
written for one agent's recall, not skills any agent can load. See
directions D1.

**How to build with aiforui skills.** Run the skills in order:

1. Prototype, if undecided.
2. Foundations.
3. One "material" skill.
4. Polish.
5. Review, with a verdict and ranked findings.
6. Prep for prod over the whole app before shipping.

Use one or two skills per run, and look at the screen between runs. Two
details are worth copying:

- **prep-for-prod never writes copy.** An empty state with no words is
  flagged for a person.
- **Its report ends with "Needs a device" and "Needs a human" lists.** That
  is the shape the 1.4.0 audit should take (directions A4).

**Prototyping interfaces** (shared with animations.dev). Build three to five
real variants behind a switcher, and keep the chosen one in the URL. Bind
the details to dials. Test with the worst content. Paper still sets layout
here (Paper first); a prototype in the kit settles how something feels.
DialKit works with React, Solid, Svelte, Vue and plain JS, but not React
Native, so the app's labs need their own panel built from kit parts.

**Get good at telling AI what you want.** Name the concept: tabular nums,
nested radius, tracking, origin-aware. Vague words make the agent guess. A
screenshot or a reference link often says more than words.

**Developing taste** (shared). Put good and bad side by side. Record
animations and step through them frame by frame. Write down why you like
something, because a written reason is halfway to a rule. Recording and
stepping through motion is already the rule here (Match iOS motion).

**Knowing where to learn from.** Trust proof of work: things people use or
pay for, not follower counts. Learn from people who don't post by using
what they made (Apple's own apps, in this project's case). Then follow who
your chosen people follow. See [people.md](people.md).

**Getting into someone's brain.** Build a skill out of everything a person
or company has published. Emil's `apple-design` skill, made from WWDC
transcripts, is one; it is installed here. Two candidates for this project:

- **A Benji Taylor skill**, from his posts. He shows how Family moves, and
  it is the iOS app both courses point to.
- **A skill from the owner's own decisions**, the memories turned into rules
  (D1).

**Using AI at work.** Delegate what is complex to build but known to work
(charts, a command menu). Keep layout and type by hand when hand is faster.
For papercuts: spot one, write it up with a screenshot or video, hand it to
an agent. The flow-run docs already do this; the missing piece is how the
owner points at things from the phone (directions D4).

**Defining a system.** Three layers:

- **Semantic tokens.** Name each token for what it is for, not what it looks
  like.
- **Components with a closed set of choices.** Types reject made-up
  variants, and there are no escape hatches.
- **Docs per component.** Say when to use it, which variant goes where, and
  give one right and one wrong example.

The lesson's test: ask for one real screen in a single sentence, and treat
every mistake as a gap in the system, not in the screen. It points at
Figma's design-system guidelines for AI and Polar's Orbit (both summarised
in [reading.md](reading.md)).

How this repo measures up:

- **Tokens:** good. `tokens.ts` is semantic, with one generated source.
- **Website kit:** has a real contract. `check-webapp-governance.ts` keeps
  Base UI inside the kit and bans string `className`, inline style and
  Tailwind; stylelint bans raw values.
- **iOS app:** has none. Outside `src/ui`, feature code has:
  - 56 raw `<Pressable>`s;
  - raw `TextInput` in 5 files;
  - 13 numeric `fontSize`s and 4 numeric `fontWeight`s;
  - 42 numeric paddings and margins;
  - hex colours in 4 files.

  Some of these are fine (admin, the labs), but nothing tells the two
  apart. See directions D2.
- **`docs/design-system.md`:** 1,392 lines that load whole; directions D3.

**Interaction lab (the curation loop).** Ask for 20 to 50 visuals at once,
keep the few you like, and ask for more like those. Once the style holds,
have the agent write it up as a skill, listing what was thrown out. Two
places it fits here: the website's home page visuals, and the App Store
screenshot frames.

**Lapse** (three lessons). A web-only animation inspector: slow time, record
a take, scrub frames of the live DOM, pin notes to an element at a moment,
and copy the state of a frame as markdown for an agent. Its point is that an
agent fixes motion better from numbers than from a screenshot (in the
lesson's example, the curve was the bug, not the length). It works for
pinkslip.work only. The iOS equivalent is simulator recordings stepped
frame by frame, plus logging the shared values at a frame.

**Tools as means to an end.** When re-prompting stalls, build a tool that
makes the thing, with dials and a Save that writes JSON. Linear's cover is
the example that matters: ripped punch cards, made with a generator for the
rip, not by prompting. Pinkslip's own material is paper: the ticket's rip,
`PunchCard.tsx`, the stamps, the grain. Directions B3.

**AI for creative work.** Start from a rough idea. Have the agent research
the visual language behind it, then turn those rules into a generator to
click through. The research step is costly (the lesson's ran to about half
a million tokens), so keep it for something important. The paper-and-stamp
look is that kind of thing: printing, perforation, rubber-stamp ink.

**Reviewing your work.** Build small inspectors for the reviews you repeat:
Emil's are a nested-radius checker and a focus-order drawer. Don't let
tool-building take over the actual work.

## The vocabulary

244 terms in 22 categories, each with a demo. Use the term in prompts and
review notes, not "feels off". Two checks on this repo:

- **Contrast.** My first notes called the app's white-on-pink button
  (3.06:1) an open question. It isn't. The owner chose it on 2026-10-12,
  it is recorded in `tokens.ts`, and Increase Contrast swaps in a deeper
  pink that passes 4.5:1. The website's dark text on pink is a separate,
  deliberate choice.
- **Ubiquitous language** (Matt Pocock's term, the same idea as the
  vocabulary). Product words drift. The `(library)` route renders
  `TrackerScreen`, and `features/redesign/` is now simply the app. A short
  glossary agents read first would stop that drift (directions D5).
