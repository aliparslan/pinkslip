# Reading list: what was read, and what it means here

Everything aiforui.dev recommends (the lessons' links and "the Vault"),
plus what those pages point to. Status:

- **read** means the whole text was read.
- **partly** means a paywall or a JavaScript-only page cut it short.
- **secondhand** means only summaries were reachable.
- **unread** means not yet read.

Notes are in my own words. Directions are in [directions.md](directions.md).

## Design systems agents can't misuse

**Polar, "Building an LLM safe design system" (Orbit, Jun 2026). Read.**
Writing rules in docs and CLAUDE.md only makes them likely to be followed;
across thousands of generations the misses add up. Polar's answer has
four parts:

- **Lint rules in CI are the contract.** A green PR is safe to merge. If a
  rule is missing, that is a gap in the rules, not the author's fault.
- **Tokens are named for decisions, not values.** `background-card`, not
  `gray-100`.
- **Props accept only tokens.** A single `Box` takes typed token props.
- **Bare HTML is banned.** The raw `<div>` is gone, because an untyped
  container next to the typed one is the way around it. `as=` keeps the
  semantic elements.

Each colour carries both its light and dark values, so there's no dark-mode
pass to forget. Polar audits its lint-disable lines and treats a growing
list as a bug in the system.

Here: the website already works this way (`check-webapp-governance.ts`,
stylelint). The iOS app has no such check (directions D2).

**Figma, "Write design system guidelines" (for AI code generation). Read.**
Write guidelines the way you'd onboard a new engineer:

- Many short files, routed from an overview, not a few long ones.
- The overview opens with the product's character: density, surfaces,
  how much colour, corners, elevation.
- A reading order: what to read before any code, and what only when
  needed.
- A component catalogue with an "alt names" column, so "toggle" or
  "dropdown" leads to the right component.
- Imperative rules: "never below 12px", not "use small text sparingly".
- Never guess an icon name; check that it exists.

Here: `design-system.md` is one 1,392-line file (directions D3).

**Astryx, "AI is a copycat so we gave it good examples to copy" (Meta, Jul
2026). Read.** The agent ignored good docs because it copied the bad
templates nearby. Astryx's fixes:

- **A grading rubric for examples.**
- **Examples at three sizes:** page, block and component.
- **One command that finds the closest example from a plain-English
  request.** It uses a synonym map, so "analytics" finds the dashboard,
  and it ranks templates by the components inside them. Every answer ends
  with the house rules.

Here: the pre-redesign screens still ship behind `useRedesign()` (Feed,
Library, the old job page) next to the redesign. They're two generations
of patterns for an agent to copy from (directions D6).

**Emil Kowalski, "Agents with Taste". Read.** Package each taste decision
into a strict skill, with the why, so the agent walks the same decision
tree every time.

## Making AI design well

**Anshu Chimala, "How to turn your AI into a world-class designer"
(Lenny's Newsletter, Sep 2026). Partly; paywall after the second stage.**
Anshu led AI-product R&D design at Apple for 12 years. Models make the
safest choice at every token, which is design by committee. His
techniques:

- **Seed strings.** Have the agent make a random string with a shell
  command and derive the design direction from it. Real variety has to
  come from outside the model.
- **Ambitious, specific briefs** taken from your own references.
- **Shortlist with your reactions.** Ask for many short ideas, react to
  your favourites, and only then ask for the build prompt.
- **A critic in a fresh context.** It sees only a screenshot, never the
  code. It judges against "how would a top studio do this aesthetic", and
  scores out of 10; iterate until it gives a 9. In his example the critic
  was under 10% of the tokens.

Here: the critic is the "Fresh opinion means no repo" rule, made into a
loop. It's an option for the audit after a Paper round (directions D7).

**Justin Jay Wang, "Designing with code" (Aug 2026). Read.** Define an
idea by rules and you can generate variants and tune parameters. You
design systems, not single assets. His walkthrough of a Cursor blog
graphic (gears) shows the rhythm:

1. Set up the canvas the way past graphics were made.
2. Set the language of the shapes.
3. Compose the still.
4. Animate it.
5. Optimise the file.

The idea and the sketch still come first, from a person. Here: Paper is
the sketch; the generator is for the paper material (directions B3).

**John Bai, "Designing Grok Bot with Grok Bot" (xAI, Aug 2026). Read.**
Four always-on design agents, each with one job:

- **Figma Bro:** repetitive production work in Figma.
- **Motion God:** motion prototypes.
- **Experiments:** ideas to make tangible before deciding what they are.
- **Devbot:** engineering questions.

The useful part is Motion God's playground. It was built around the real
production animation spec, with live controls, and took short comparative
notes ("hold the look longer"). It didn't recreate the asset. Here: dials
in the kit's labs should drive the real `uiMotion` values (motion notes
item 7).

**Rauno Freiberg, "Invisible Details of Interaction Design" (Jul 2023).
Read.**

- Gestures borrow from the real world: pages turn, pinches zoom from a
  point.
- **Light actions can fire mid-swipe; destructive ones only on release.**
  Pinkslip's `SwipeRow` already commits on release.
- **A gesture should respond the moment it starts**, with the animation
  past a threshold.
- **Keep things spatially consistent**, so an app opens from where it was.
- **The more often something happens, the less it should animate.** His
  bookmarks app got faster once motion left its core actions.

**Paco Coursey interview (ui.land). Read.** Build your own apps, and copy
work you admire until you can make your own. In his words, a delightful
experience is just a faster path to the user's goal.

## Agents, skills and how to work

**Andrej Karpathy, "LLM Wiki" (gist, Apr 2026). Read.** Instead of
re-reading sources on every question, the agent keeps a wiki of linked
markdown. It has three layers:

- **Raw sources**, which are never edited.
- **The wiki**, which the agent writes.
- **A schema** saying how the wiki works.

There are three operations. Ingest folds a new source into the existing
pages. Query files a good answer back as a page. Lint finds
contradictions, stale claims and orphans. `index.md` is the catalogue,
read first; `log.md` is an append-only history. This folder is built that
way (see [README.md](README.md)).

**Matt Pocock, `mattpocock/skills`. Read the README.** About 25 small
skills for engineers. Useful here:

- **`retro`:** after a session, suggests changes to the agent's
  environment (checks, steering files, tools). That's "fix the system",
  automated.
- **`writing-for-agents`:** how to write skills and AGENTS.md.
- **`grill-with-docs`:** an interview that also writes a `GLOSSARY.md`
  (directions D5).
- **`to-questionnaire`:** a decision only one person can make, as a form
  they answer later.
- **`research`:** cited findings as a markdown file in the repo.
- **`handoff`:** compacts a session for the next agent.

**Emil Kowalski, `emilkowalski/skills`. Listed.** 17 skills, 14 installed
here. Not installed: `animation-performance`, `choreograph` and
`remove-animations`. The last two bear on the motion notes (one entrance
per container; less motion on daily actions).

**Lauren Tan (poteto), pstack. Secondhand.** A Cursor plugin of skills
for rigorous work:

- A `poteto-mode` router that picks a playbook and demands evidence
  before it reports success.
- An adversarial multi-model review.
- `unslop`, which rewrites text in plain language.

Cursor-specific; the ideas carry over.

**Anthropic, "Writing effective tools for agents". Skimmed the
structure.** Prototype a tool, write evaluation tasks, and let the agent
improve the tool from transcripts. Choose fewer tools, namespace them,
return meaningful context, keep responses lean, and treat the tool
description as a prompt. Here: Pinkslip's backend has no agent tools; it
calls Workers AI models for event import, resume import and tailoring. It
applies to the checks and scripts agents run in this repo: their output
should say what's wrong and where, in a few lines.

**Anthropic, "Claude Code best practices". Fetched, not re-read.** It is
long. It covers what this repo already does: a CLAUDE.md, exploring before
planning, visual iteration with screenshots, and one session writing while
another reviews.

**Mitchell Hashimoto, "My AI Adoption Journey" (Feb 2026). Secondhand.**
Six stages, from dropping chatbots to always having an agent running. His
term "harness engineering" means building tools and checks that agents call,
so they stop repeating a mistake. It's the same idea as Polar's CI contract.

**Lee Robinson, "How always-on agents work" (Stanford CS146S). Secondhand;
it's a lecture video.** Covers the harness, context engineering, memory,
sandboxes, and a thin client over a thick server. Background, not action.

**Maggie Appleton, "Planning with Agents". Not found.** Only a German
summary turned up: plans as boundary objects, shared artifacts that mean
different things to the person and the agent, which today's chat logs
handle badly. Worth finding on her site.

**"How I design with AI" (Matt, an engineer who isn't a designer). Not
found.** The Vault gives no link, and searches didn't turn it up.

## Taste

**Paul Graham, "Taste for Makers". Known.** Good design is simple,
timeless, solves the right problem, and is suggestive. Taste can be wrong,
and so can be trained.

**Anu Atluru, "Taste Is Eating Silicon Valley" (Sep 2024). Read the
first half.** When software is cheap, taste (design, brand, experience)
is what sets a product apart, and it carries distribution too.

**"Judgment Is the Decisive Skill"**, and **Matt Pocock's talk on writing
skills**: videos, not watched.

## Tools

**DialKit (Josh Puckett). Read the README.** Live controls bound to
values: sliders, colours, springs, easing, an XY pad, a timeline, and
compare versions. It runs on React, Solid, Svelte, Vue and plain JS, not
React Native. Here: it can be used on the website, but the iOS labs need
their own panel. Copy its "compare versions" and "copy settings".

**index.how (Glenn). Unread.** The page needs JavaScript. It's a design
education site.

**Dithering Studio.** A tool page; no notes needed.

**Lapse.** Web only; see [aiforui.md](aiforui.md).

**Agentation (Benji Taylor).** See [benji-taylor.md](benji-taylor.md).
