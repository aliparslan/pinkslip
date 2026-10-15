# What makes onboarding work (research, 2026-10-14)

The owner asked for real research into the strategy and psychology of
onboarding, beyond how screens look. Round 2 felt close but disconnected.
This is what I read, what it says, and what it means for Pinkslip.

Most sources are practitioners: growth consultants, onboarding vendors and
teardown writers. The one controlled experiment is Headspace's, run with
Irrational Labs. Treat vendor numbers as direction, not proof.

## Where my thinking was off

I was designing screens; good onboarding designs a sequence of feelings.
Round 2 asked "what should the welcome look like?" The research asks:

- what does the person feel in the first three seconds;
- what small yes do they give next;
- when do they see it working for them;
- what's the last thing they remember?

Each screen is a beat in that story, and the questions are part of the hook,
not a toll before it.

## What the research says

### 1. Sell the better you, not the features

Samuel Hulick (UserOnboard, *The Elements of User Onboarding*) uses a Mario
metaphor:

- Don't sell the fire flower, which is the feature.
- Sell Mario throwing fireballs, which is the user, upgraded.
- Show daily life with the product, not its parts.

This is what the owner asked for after round 1.

Rahul Vohra (Superhuman) designs for named emotions:

- **Remove:** what people arrive with. For job hunting that's anxious,
  overwhelmed, ignored, behind.
- **Aim for:** relief, hope and pride at the first success.

### 2. Open with an emotional anchor, then ask small, then prove, then ask big

The apps people point to share an order:

1. **An emotional moment in the first three seconds.** Headspace opens with
   a breathing animation before any copy. Duolingo opens with Duo.
2. **Micro-commitments:** small, easy choices that build investment.
3. **Proof of value:** the real thing working (a lesson, a meditation)
   before any permission or payment.
4. **The big asks last:** account, notifications, paywall.

Opal opens with a loss ("years of your life on your phone") and turns it
into a gain ("10 years back"). Naming the pain first makes the relief land.

### 3. Asking questions is itself the hook

This is the Headspace experiment, run with Irrational Labs: five arms, a
randomized test.

- A short quiz before the same default course raised course starts by about
  7.6 points, even though the answers changed nothing.
- In their words: "People want to know that this app is for me."
- Letting people pick several goals instead of one raised trial conversion
  about 10%.
- Lose It! found more questions raised trial starts by double digits.

**The catch:** the promise has to be credible. Questions with no visible use
get noticed, and poor matching is worse than none.

### 4. Answers must visibly do something

- From 1,460 flows: the best show what the answers unlocked, such as a plan
  or a date.
- One guide: write down what each answer changes on the next screen. If it
  changes nothing, don't ask it.
- Noom, Fitbod and Rise turn answers into a visible result before the ask.

### 5. Perceived length matters, not length

- Average flows run about 25 screens, and Duolingo has 60+ before sign-up.
  They don't feel long because every screen gives something back.
- Length hurts only when a screen is a toll.
- Vary the formats. Give one question per screen, in one sentence.

### 6. Make the work visible (labor illusion)

- A short "building your …" moment that shows real work makes the result
  feel more valuable and more personal (Deepstash, Noom).
- It has to be honest. Ours is: we really do filter thousands of postings
  down to theirs.

### 7. You value what you built (IKEA and endowed progress)

- People value what they shaped. Effort that reaches a finished thing makes
  them value it more (Norton, Mochon and Ariely, 2012).
- A visible head start motivates finishing. The classic example is the
  coffee card that comes with two free stamps.

### 8. People remember the peak and the end

- Kahneman's peak-end rule: an experience is judged by its best moment and
  its last one.
- So end on the payoff, never on a form or a permission prompt.
- Celebrate at the right milestone. Built for Mars warns that celebrating
  the wrong one, like Chase's confetti, backfires.

### 9. Value before sign-up, and permissions in context

- Duolingo moved sign-up behind the first lesson; one teardown reports a
  20% rise in daily active users.
- Ask for notifications with a priming screen at the moment they're
  clearly useful, not up front.
- NN/g: deck-of-cards feature tours don't help and get skipped, and
  feature promotion at first launch is ignored.

### 10. Toys and play

Vohra: games are toys plus goals. A toy is something fun to touch for its
own sake, and the delight comes from interaction, not decoration. Arc's
onboarding is remembered as "perfect" for this reason. It teaches by
letting you do the thing in a beautiful setting.

## What it means for Pinkslip

**The pain is real, and it's ours to name.** "Job hunting is a second job"
is the emotional anchor, and the owner liked it. It names what people feel:

- a dozen boards;
- applying a month late;
- the spreadsheet;
- 47 applied, 2 heard back;
- remembering who to follow up with.

**The relief is the product.** "Let's make it a small one" is the fire flower
turned into fireballs: one place, early, organized, nudged.

**Level, role and where aren't a toll.** By Headspace's result, asking makes
people feel the app is for them, as long as each answer visibly does
something.

**The aha is their own feed:** fresh, relevant jobs, some posted an hour ago.
That's the peak, and it's where onboarding should end. The account,
notifications and Pro come later, in context:

- **The account:** the first time they save or apply.
- **Notifications:** after their first save ("Want to know when the next
  one like this is posted?").
- **Pro:** at auto-apply or outreach.

**Cut:** the notification lock screen (owner: no), the feature carousel, and
any up-front permission.

## The flow this suggests (round 3)

The story goes from chaos to calm, and the person does the tidying.

1. **The hook, one screen, animated.**
   - The mess lands card by card: the spreadsheet, 14 tabs, a sticky note,
     an auto-reply, "Posted 30+ days ago", "47 applied · 2 heard back".
   - Each card lands with a soft haptic. "Job hunting is a second job."
     settles under the pile.
   - The button is the punchline: **Let's make it a small one.**
   - Tapping it sweeps the pile together; it folds into the pink slip with
     one firm haptic. The person makes it small, so it's their act: a toy,
     and the peak of the first ten seconds.
   - This condenses round 2's two screens into one.
2. **Three questions, one per step**, on a sheet under the slip.
   - Level, role, where, each multi-select, using the real options in
     `shared/search-profile.ts`.
   - Each answer is written onto the slip's lines as you tap. That's the
     IKEA effect: by the third answer the slip is visibly yours.
3. **Making it small, about two seconds, honest work.**
   - The chores from the hook strike through one by one while we really
     build their feed: a dozen boards, a month late, the spreadsheet,
     following up.
4. **Their feed, the peak and the end.**
   - The slip drops into the Jobs tab and their rows stagger in, the
     freshest first.
   - Onboarding ends there, with nothing to fill in.

**Owner's response (2026-10-14):**
- The hook works ("I love the first part").
- From the logo slip onward it fell apart: the stamps were cramped on the small mark.
- Drawn next, on Paper "Onboarding · round 3 · Oct 14", board "After the tap · two ways":
  - **A · Lights on.** The tap throws the mess off and opens the app; the questions sit in a sheet while your feed fills in behind it.
  - **B · The slip as a form.** A full-size pink slip with Level, Role and Where fields. Each answer is stamped in, then you pull the stub to tear it off into Jobs.

**Optional, for the owner to weigh:** a fourth, emotional question, "Where
do you look now?" (LinkedIn, company sites, job boards, GitHub lists,
referrals).

- Its answer mirrors the pain back: "That's four places. Now it's one."
  That's Opal's personal truth bomb, and it's the owner's own story.
- It also tells us where people come from, as Noom's "How did you hear
  about us?" does.
- It isn't a must-ask, so it's flagged rather than drawn in.

## Sources

- [Headspace's behavioral-science onboarding experiment (Purchasely and Irrational Labs)](https://www.purchasely.com/blog/headspace-behavioral-science-onboarding-experiment)
- [The Longest Onboarding Ever: Noom (Jacob Rushfinn)](https://www.retention.blog/p/the-longest-onboarding-ever)
- [Why your onboarding experience might be too short (RevenueCat)](https://www.revenuecat.com/blog/growth/why-your-onboarding-experience-might-be-too-short)
- [I studied 1,460 onboarding flows (Daniliants)](https://daniliants.com/insights/i-studied-1460-onboarding-flows-heres-what-i-found/)
- [Mobile-app onboarding: components and techniques (NN/g)](https://www.nngroup.com/articles/mobile-app-onboarding/)
- [Samuel Hulick on the elements of user onboarding (Heavybit)](https://www.heavybit.com/library/article/samuel-hulick-elements-of-user-onboarding)
- [Game design, not gamification (Rahul Vohra, Superhuman)](https://blog.superhuman.com/game-design-not-gamification/)
- [First-screen emotional hooks (PaywallPro)](https://dev.to/paywallpro/onboarding-first-screen-trends-emotional-hooks-are-back-because-they-never-left-74d)
- [How to design onboarding experiences (The Decision Lab)](https://thedecisionlab.com/insights/innovation/how-to-design-onboarding-experiences)
- [Using psychology to improve user onboarding (UX Psychology)](https://uxpsychology.substack.com/p/using-psychology-to-improve-user)
- [Peak-end rule and onboarding (Atticus Li)](https://www.atticusli.com/blog/posts/peak-end-rule-user-onboarding/)
- [Mastering onboarding (Built for Mars)](https://builtformars.com/collections/mastering-onboarding)
- [Opal onboarding screens (ScreensDesign)](https://screensdesign.com/showcase/opal-screen-time-control) and [Lazyweb](https://lazyweb.com/canvas/flows/opal/onboarding)
- [Arc browser onboarding (SaaS UI)](https://www.saasui.design/pattern/onboarding/arc-browser)
- [Mobile onboarding patterns (Appcues)](https://www.appcues.com/blog/mobile-onboarding)
