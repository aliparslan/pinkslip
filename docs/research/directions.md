# Directions from the research

Every direction found in what the owner has shared so far, in one list:

- modernmotherfuckingwebsite
- animations.dev
- aiforui.dev and its reading list
- Benji Taylor's posts

Each row says where the idea came from, what it would change here, and
what it needs. The design and motion roadmap
([../design-roadmap-2026-11-07.md](../design-roadmap-2026-11-07.md)) is
the build plan, and approved rows move there. This file is where rows wait
for the owner.

Status: **roadmap** (already planned there), **proposed** (new, waiting for
the owner), **decided** (settled, kept so it isn't re-raised), **not for
us**.

## My picks, in order

1. **Before 1.4.0:** the app audit (A4) and roadmap section 1 (the motion
   that's still off).
2. **Right after launch:** the iOS kit check (D2), then splitting the
   design system into per-part docs (D3). Every future session builds
   better on top of these.
3. **Then the first update:** the zoom to the job page and the stamp for a
   send (roadmap), plus the stub falling into Tracker (B1).

## A. The app: flows and motion

| # | Direction | From | Needs | Status |
| --- | --- | --- | --- | --- |
| A1 | Fix the six motion items from the Nov 7 flow run | flow run | kit toggles | roadmap §1 |
| A2 | Sheet steps change height as well as content, so the step is obvious; the content cross-fades with an 8pt shift in the direction of travel | Family Values (trays), animations.dev | Paper, sheet lab | proposed (joins roadmap §1, item 4.10) |
| A3 | Closes take about 350ms, faster than opens (500ms) | animations.dev | sheet lab beside iOS | roadmap via motion notes 1 |
| A4 | A production audit before 1.4.0. It checks VoiceOver labels and order, Dynamic Type XXXL, dark mode, Increase Contrast, Reduce Motion, every screen's empty, loading and error states, offline, and the 17e's width, with worst-case content. It reports "Needs a device" and "Needs a human" lists, and writes no copy | aiforui (prep-for-prod), animations.dev | one session, a doc | proposed |
| A5 | Rows close the gap while a hidden row leaves; Undo brings it back in reverse | animations.dev | kit | roadmap §1 (2.36) |
| A6 | One entrance per container; stagger only on the first feed load | animations.dev | kit | roadmap §2 |
| A7 | Live send bar: every part eases between real steps at one rate, so nothing jumps | Liveline | kit | proposed |
| A8 | Tracker's stats: a calm loading line that morphs into the data | Liveline | Paper | proposed, low |
| A9 | Speed for daily actions: chips, tabs, segments and row presses instant or nearly | animations.dev, Rauno | kit | roadmap via motion notes 6 |
| A10 | One haptics rule (success, tick, warning, nothing on scroll) | roadmap | doc + sweep | roadmap §2 |

## B. Signature moments and the paper material

| # | Direction | From | Needs | Status |
| --- | --- | --- | --- | --- |
| B1 | The torn stub falls into the Tracker tab, which then ticks; the application lives there now. Today the stub falls and shrinks away | Family (pending spinner into its tab) | Paper, phone test | proposed |
| B2 | Labels morph instead of swapping: Apply for me → Sending → Sent, Get Pro → You're on Pro; counts roll ("3 of 10 sent") | Family (shared-letter morph), animations.dev | kit | roadmap §2 + motion notes 5 |
| B3 | A generator in the kit lab for the paper look. A seed plus dials for the rip edge, the punch holes, stamp ink spread and grain; Save writes JSON that the kit reads. This replaces prompting for one result | aiforui (Linear's ripped punch cards), Justin Jay Wang | kit lab | proposed |
| B4 | The sheet's close icon turns into back on later steps (rotation and morph on Phosphor's grid) | Family, Morphing icons | Paper | proposed |
| B5 | Zoom from row to job page (`Link.Trigger withAppleZoom`) | roadmap | kit | roadmap §2 |
| B6 | Delight follows rarity: the first application sent, the first reply, Offer. Never on swipes or Save | Family's delight curve, animations.dev | Paper | roadmap §2 (Offer) |
| B7 | Record the app now, for the App Store preview and as history | Honkish footnote | simulator | proposed |

## C. The website

| # | Direction | From | Needs | Status |
| --- | --- | --- | --- | --- |
| C1 | `JobPosting` that Google can fully read (place, pay, employment type, logo, sameAs) | modernmotherfuckingwebsite | web deploy | roadmap §4 |
| C2 | A card per shared job, and Pinkslip's own line in `og:description` | modernmotherfuckingwebsite, flow run | web deploy | roadmap §4 |
| C3 | `defaultPreload: "intent"` | modernmotherfuckingwebsite, animations.dev | web deploy | roadmap §4 |
| C4 | Agentation in the dev build, to point at things on pinkslip.work instead of describing them | Benji (Agentation) | dev dependency | proposed |
| C5 | Home page and App Store preview demos made from Pinkslip's own screens with Stageshow (a job swiped, an application sent) | Benji (Stageshow) | the skill, a brief | proposed |
| C6 | Lapse for the website's motion, if the owner installs the course packages | aiforui | install | proposed |

## D. How the work gets done

| # | Direction | From | Needs | Status |
| --- | --- | --- | --- | --- |
| D1 | **Project skills for Pinkslip's own taste.** Small, strict skills with the why and examples, committed to the repo so every session and agent loads them. The rules now live in about 35 feedback memories on one Mac and in a local-only CLAUDE.md. Candidates: `pinkslip-copy` (no "we", no time promises, less text, sell the impact, playful errors), `pinkslip-design-round` (Paper first, "Before drawing", the audit after), `pinkslip-motion` (match iOS, frame by frame, `uiMotion`). Memories keep facts; skills carry rules | aiforui (skills, Agents with Taste, borrow-a-brain) | owner review of each | proposed |
| D2 | **A check that keeps iOS screens on the kit**, the way `check-webapp-governance.ts` does for the web. It runs in `bun run check` and covers raw `Pressable`, `TextInput` and `Text` outside `src/ui`, numeric `fontSize` and `fontWeight`, numeric spacing, and hex colours. Each exception carries a `// intentional:` comment. Today, outside `src/ui`, there are 56 raw `<Pressable>`s, raw `TextInput` in 5 files, 13 font sizes, 4 weights, 42 paddings and margins, and hex in 4 files. Start with the current list as the baseline and fail only on new ones. Then shrink it | Polar (Orbit), Mitchell Hashimoto, aiforui (Defining a system) | script | proposed |
| D3 | **Split `docs/design-system.md` (1,392 lines) into per-part docs.** A short index holds the product's character, the reading order and the rules. Next to each kit part goes a doc with: when to use it and the alternative, which variant goes where, one right and one wrong example, and alt names ("toggle", "pill"). Phosphor icons get a list, so names aren't guessed | Figma, aiforui (design-system-docs), progressive disclosure | a session | proposed (in aiforui notes before) |
| D4 | **A note mode in admin builds of the app.** A two-finger long-press drops a pin. It captures the route, the kit part under the finger, the screen's data state and a screenshot, and copies markdown to paste into a session. Pointing beats describing; the owner reviews on the phone | Benji (Annotating, Agentation), Lapse | native code (JS only) | proposed |
| D5 | **A short glossary agents read first.** Tracker vs the `(library)` route; `features/redesign` as the app; slip, stub, stamp, send, Apply for me, Ask first, Pro. It stops names drifting | Matt Pocock (ubiquitous language), aiforui vocabulary | one doc | proposed |
| D6 | **One generation of screens.** The pre-redesign Feed, Library and old job page still ship behind `useRedesign()`. If 1.4.0 is redesign-only, remove them after launch so agents can't copy them; until then, mark them legacy in AGENTS.md | Astryx (agents copy examples) | owner decision | proposed |
| D7 | **A fresh critic for Paper rounds.** After drawing, a fresh-context review sees only the artboard screenshots, never the repo or the brief. It scores against a studio bar, and the round goes on until it passes. It costs one extra agent per pass, against the owner's "no subagents" usage rule | Anshu Chimala, "Fresh opinion means no repo" | owner decision | proposed |
| D8 | **The one-sentence screen test.** After D2 and D3, ask a fresh session for one real screen in a single sentence, and turn every miss into a rule | aiforui (Defining a system) | a session | proposed |
| D9 | **Dials in the labs that drive the real `uiMotion` values**, with "compare versions" and "copy settings". DialKit doesn't run on React Native, so the panel is built from kit parts | aiforui, DialKit, Grok Bot (Motion God) | kit lab | roadmap via motion notes 7 |
| D10 | **A retro after each chunk**, written into this folder or the system docs: what the agent got wrong, and which rule or check would have stopped it | Matt Pocock (`retro`), aiforui | habit | proposed |
| D11 | **Install the course's 28 skills at the user level** (never in the repo), then run A4 through `emil-prep-for-prod` as the test of whether the course is worth keeping | aiforui | the owner runs the install | owner decision |
| D12 | **Decisions as a questionnaire.** The open owner decisions (below) gathered into one form, answered when convenient | Matt Pocock (`to-questionnaire`) | one doc | proposed |

## E. Waiting on the owner

- **D6:** is 1.4.0 redesign-only?
- **D7:** a critic agent for Paper rounds, given the usage rule.
- **D11:** install the course skills, and keep or refund the course.
- **Tab switches.** Family slides in the tab's direction; iOS's own tab
  bars don't animate. Pinkslip matches iOS today. Keep that?
- From the polish pass:
  - Soon rows in 1.4.0;
  - What's new says 1.3;
  - pay cut at large text;
  - the thin first feed.

## Decided, kept so they aren't re-raised

- **White on the app's pink button.** The owner chose it on 2026-10-12
  (3.06:1). Increase Contrast swaps in a deeper pink that passes 4.5:1.
  The website's dark text on pink is a separate, deliberate choice.
- **No confetti, sounds, parallax or scroll-driven animation** (roadmap,
  "Left out on purpose"), even though Family and Honk use some of these.
- **Swipes commit on release**, as Rauno argues for anything consequential
  (`SwipeRow` already does).
- **The undo toast shows how long it stays.** Honk's countdown border is
  already `Countdown` in `Toast.tsx`.

## Not for us

- **Lapse and DialKit for the iOS app.** Both are web only.
- **Shipping 40 PRs a day.** Emil's own caution about the hype applies.
- **Drawesome's lit, object-like tools.** The owner found paper objects
  amateur on the Pro screens.
