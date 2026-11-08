# aiforui.dev, against Pinkslip (2026-11-07)

The owner bought Emil Kowalski's aiforui.dev (early access: 20 lessons,
28 skills, the Lapse animation inspector, a 244-term vocabulary) and
shared its lessons, its Vault and Benji Taylor's Stageshow post. These are
my notes in my own words, with what applies here. Companion:
`motion-course-notes-2026-11-07.md` (animations.dev).

The pasted lessons carry personal install tokens for the course's npm
registry. They stay out of this public repo, and nothing here installs
them.

## Overlap with animations.dev

Small. Two lessons are near-copies: Prototyping interfaces (animations.dev
carries it word for word as a borrowed lesson) and Developing taste
(animations.dev's Taste, retold for AI, same quotes). The vocabulary's
motion categories overlap the animations course's content. Everything else
is new: skills (what, how to write, how to run), steering an agent with
the right words, picking who to learn from, brain skills, defining a
system, the curation loop, Lapse, building tools to build things, and
reviewing tools.

What's new for this project is narrower than what's new in the course.
Much of the process is already how Pinkslip works (tokens with semantic
names, the kit as the only building blocks, design-system.md, labs with
toggles, frame-by-frame motion review, fixing rules instead of screens).
The parts with real value here: the skills, the vocabulary, and a few
lessons below. Lapse is a web DOM tool, so it helps the website but not
the iOS app's Reanimated motion.

## What changes here

1. **Split design-system.md by part.** It's 1,392 lines that load whole.
   The course's progressive disclosure points at a short index plus one
   file per kit part, kept next to the part (`apps/native/src/ui/*.md`),
   read only when that part is touched.
2. **Prototype interactions in the kit, not only in Paper.** For anything
   that moves or responds to touch, build three to five variants behind a
   switcher in the kit, with dials for the values, and pick on the phone.
   Paper still sets layout and look (Paper first); the kit prototype
   settles feel. The swipe and motion labs already work this way.
3. **Fix the system when an agent gets it wrong.** Already practised
   (design-system.md, memories, kit rules); the course's test is worth
   adding: ask for a new screen in one sentence and treat every mistake
   as a missing rule.
4. **Name the thing.** Prompts and review notes use the vocabulary's terms
   (tabular nums, widow, nested radius, origin-aware, enter/exit
   asymmetry) rather than "feels off".
5. **Build a tool when re-prompting stalls.** The paper-object and stamp
   work could use generators with dials (a ripped-edge or stamp-texture
   tool) rather than prompting for one result.
6. **Run a production audit before 1.4.0.** The course's prep-for-prod
   checklist (accessibility, states, theming, mobile, forms) is worth one
   pass over the app with the skills already installed, reported to a doc.

## The vocabulary, pointing at real issues

- **Contrast ratio.** The app's primary button is white on `accent-fill`
  (#ee5fac): 3.06:1, under the 4.5:1 normal text needs. The website kit's
  rule (AGENTS.md, "Web kit") forbids white on the pink fill and uses dark
  `accent-ink` instead, which is 6.16:1. The two apps disagree; the owner
  decides which way.
- **Widow.** Fixed Nov 4 by `lineBreakStrategyIOS` in the kit's Text.
- **Nested radius** (inner = outer − inset). Worth a check across cards
  inside sheets and the ticket.
- **Enter vs exit asymmetry**, **front-loading**, **numeric formatting**,
  **truncation strategy**: covered by the polish pass and the motion notes.

## Benji Taylor and Stageshow

Benji designs Family, the iOS wallet both courses hold up as the fluid
interface to learn from, and wrote Family Values. Stageshow is his skill
for faux product UI: looping hero demos, feature cards and phone demos,
filmed frame by frame and checked before they ship. For Pinkslip it fits
the website's home page and an App Store preview video: Pinkslip's own
screens as clean, cropped, looping demos (a job swiped, an application
sent). More of his writing is worth reading, Family Values first.

## People

From aiforui.dev:
- **Emil Kowalski**: the author; design engineer at Linear, before Vercel;
  made Sonner and Vaul.
- **Matt Pocock**: grill-me skill, a skills repo, a talk on writing skills.
- **Benji Taylor**: Family; Stageshow; Family Values.
- **Lee Robinson** (@leerob): a Stanford lecture on always-on agents.
- **poteto**: pstack, skills for rigorous engineering in Cursor.
- **Justin Jay Wang**: Designing with Code; his studio Play.
- **Josh Puckett**: DialKit (sliders bound to values).
- **Matt (@msllrs)**: started Lapse.
- **Hector Simpson** (@dizzyup): Superlogical's icon studio.
- **Glenn** (@glennui): index.how.
- **Paul** (@pdotcv): the Linear data report's punch cards.
- On X, recommended without detail: @anshuc, @MSchwaibold, @kunchenguid.
- Emil's own list of people to learn from: Mitchell Hashimoto, Steph Ango,
  Raphael Schaad, Rasmus Andersson, Maggie Appleton, Andy Matuschak,
  Justin Jay Wang, Ryo Lu, Ben Leonard, Jason Ginsberg.
- Quoted: Paul Graham, Steve Jobs, Jony Ive, Anu Atluru, Ira Glass, Paco
  Coursey, Karri Saarinen, Strauss Zelnick.

From animations.dev: Henry Heffernan (Vercel), Lochie Axon (Family),
Dennis Brotzky (Fey), Mariana Castilho (poolside), Josh Comeau, Josh
Wootonn, Sam Selikoff, Jhey, Maxime Heckel, Nanda Syahrasyad, Matt Perry
(Motion).

## Resources, in reading order for this project

1. **Family Values** (benji.org): fluid iOS interfaces, the closest thing
   to what the app should feel like.
2. **Agents with Taste** (emilkowal.ski): putting taste into skills; the
   same job design-system.md does.
3. **Designing with Code** (Justin Jay Wang): agents closing the gap
   between design and build; bears on Paper first.
4. **Polar's Orbit** (an LLM-safe design system) and **Figma's guidelines
   for design systems used by AI**: how to make the kit hard to misuse.
5. **Stageshow** (benjitaylor/skills): for the website and the App Store
   video.
6. **Writing effective tools for agents** and **Claude Code best
   practices** (Anthropic).
7. **How I design with AI** (Matt), **How to turn your AI into a
   designer**, **Designing Grok Bot with Grok Bot**, **Planning with
   Agents**, **How always-on agents work** (Lee Robinson).
8. **LLM Wiki**: a personal knowledge base built with LLMs; compare with
   the docs-and-memory setup here.
9. Skills to read: emilkowalski/skills, anthropic/skills,
   mattpocock/skills, pstack.
10. Background: Taste for Makers (Paul Graham), Taste Is Eating Silicon
    Valley (Anu Atluru), Judgment Is the Decisive Skill, Astryx's "AI is a
    copycat", index.how, Dithering Studio, DialKit.
