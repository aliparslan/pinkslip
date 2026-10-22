# A way to support Pinkslip (2026-10-22)

The owner: "can we set up a donate button or something on the you section,
for people that might want to help maintain the app? what is the best way
to do this, where it's easy for the user and i can use a vendor that doesnt
skim too much off the top? what are the best designs for how this is done".

Not legal or tax advice.

## Call it support, not a donation

- Apple's guidelines treat "donations" as charitable fundraising. Only
  approved nonprofits may collect them in the app; everyone else collects
  "outside of the app" (3.2.2(iv)). A for-profit app asking for donations
  invites that reading in review.
- Apple does allow apps to let people "tip" the developer (3.1.1), and on
  the US storefront it allows buttons and links to outside purchases with no
  entitlement (3.1.1(a), since the Epic v. Apple ruling in 2025).
- So: **"Support Pinkslip"** or a **tip jar**, money to a one-person
  business, nothing unlocked by it. Donations to a business aren't tax
  deductible, which the word "donate" would also suggest.

## Where the money can go

| Way | What the person does | What you keep from $5 | Notes |
| --- | --- | --- | --- |
| **Stripe Payment Link, opened from the app** | Taps Support, an in-app Safari sheet opens Stripe Checkout, Apple Pay, done | About $4.56 (2.9% + 30¢) | US storefront only, by Apple's 3.1.1(a). Apple takes 0% today; it has asked the court for 5% for small developers, not decided. Pay-what-you-want and monthly both work. The Stripe account is needed anyway for Pro on the web (billing, step 9). Only JavaScript, so it ships as an update |
| **Ko-fi page, opened from the app** | The same, on Ko-fi's page (card, PayPal, Apple Pay) | About $4.56 (0% Ko-fi fee on one-off tips, processing on top) | 5% on monthly support on the free plan. Ko-fi's branding and page, not yours |
| **Buy Me a Coffee** | The same, on BMC's page | About $4.28 (5% + processing + 0.5% payout) | The priciest of the three for the same thing |
| **Apple in-app purchase tip jar** | Taps an amount; Face ID; done, without leaving the app | $4.25 (15% in the Small Business Program) | Works in every country and needs no other account. Needs StoreKit (or RevenueCat) in a native build, so a TestFlight build rather than an update. Tips are fixed price points, not pay-what-you-want |
| GitHub Sponsors | — | — | 0% for personal accounts, but it's for open-source contributors; Pinkslip isn't open source |
| Patreon, Open Collective | — | — | 8–12% (Patreon) or a fiscal host's cut (Open Collective, often 10%); built for creators and nonprofits |

The fixed 30¢ weighs most on small tips: from $3, Stripe leaves about $2.61
and Apple's 15% about $2.55; from $10, Stripe leaves about $9.41 and Apple
about $8.50.

## What good tip jars look like

From RevenueCat's tip jar guide and a design write-up on tip jar screens,
plus how indie iOS apps place it:

- **A row in You, near the end** ("Support Pinkslip", a heart), never in
  the daily screens. People find it when they're feeling good about the
  app; nothing interrupts them.
- **A short, personal note**, in the owner's voice (one person, so "I", not
  "we"): who builds it and what the money pays for (servers, the job data,
  Apple's fees). One or two sentences.
- **Two or three amounts and your own**, nothing pre-picked: a small, a
  medium, a generous one. An indie game found people chose higher tips more
  often when given a few options instead of one "coffee".
- **One-time first; monthly as a choice**, not the default.
- **A thank-you** once it goes through, and no change to the app. Nothing
  is unlocked, so nobody feels the free version is lesser.
- **No guilt:** no pop-ups, no countdowns, no "you've used Pinkslip 30
  times", no nagging. A later, gentle moment is fine (after an offer, one
  quiet line on that card), and only once.
- Apple's TipKit is for teaching features, not asking for money; don't use
  it for this.

Published numbers on how many people tip are scarce; the honest
expectation from developers' accounts is a small share of active users, so
this covers some costs rather than being a business model. Pro (step 9)
stays the plan for that.

## Recommendation

**A Stripe Payment Link with pay-what-you-want, opened in the in-app
browser from a "Support Pinkslip" row in You**, shown on the US storefront
(where Pinkslip's users are; the row hides elsewhere until an in-app
purchase tip exists). It keeps about 91% of a $5 tip, uses Apple Pay, needs
no build, and the Stripe account carries over to Pro on the web.

The page in the app: the note, $3 · $5 · $10 · Other (each a Payment Link,
or one link with "customer chooses the amount"), one-time with monthly as a
choice, then Stripe's sheet, then a thank-you.

**Decided (owner, Oct 22): take A** in Paper "Support Pinkslip · Oct 22
(approved: A)". The row ends You with a filled pink heart on the pink tile.
It opens a sheet like Plan's See Pro: "Pinkslip is a one-man team! A tip
helps with server and compute costs 😊", One time or Monthly, $3 · $5 · $10
· Other amount as radios, and "Support with $5 ↗". No line about Stripe.
Back from Stripe, a toast with a filled pink heart: "Thank you for your
support!". Take B (a page with a note and a costs-covered bar) wasn't
picked.

To do before building: a Stripe account (business details, payouts), the
Payment Link(s), and a sentence in the privacy notice about Stripe.

## Sources

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (3.1.1, 3.1.1(a), 3.2.2)
- US external links: [RevenueCat on the Epic v. Apple ruling](https://www.revenuecat.com/blog/growth/apple-anti-steering-ruling-monetization-strategy); [Apple's guideline update (summary)](https://appletreats.substack.com/p/apple-updates-app-review-guidelines); [what US external payments cost in 2026](https://tiun.io/blog/ios-external-payments-us-cost-2026)
- [Stripe pricing](https://stripe.com/pricing) (2.9% + 30¢; Payment Links included)
- Ko-fi: [does Ko-fi take a fee?](https://help.ko-fi.com/hc/en-us/articles/360002506494-Does-Ko-fi-take-a-fee); [pricing](https://ko-fi.com/pricing)
- Buy Me a Coffee: [how charges are calculated](https://help.buymeacoffee.com/en/articles/8105744-how-to-calculate-charges-on-your-payment); [terms](https://buymeacoffee.com/terms)
- [GitHub Sponsors](https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors)
- Tip jar design: [RevenueCat: building a tip jar](https://www.revenuecat.com/blog/engineering/building-a-tip-jar-feature-with-revenuecat); [tip jar UI on mobile](https://vp0.com/blogs/buy-me-a-coffee-tip-jar-ui-mobile); [Apple TipKit](https://developer.apple.com/documentation/tipkit)
- [Ole Begemann on tip jars and Pedometer++](https://oleb.net/blog/2016/03/fake-ads-as-a-business-model/)
