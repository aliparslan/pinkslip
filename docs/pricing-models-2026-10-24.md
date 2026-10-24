# Pricing: the models and a recommendation (2026-10-24)

The owner: "can we talk about step 9 first? about how we want to approach
pricing in general, which model looks best". What's already decided (backend
inventory, Plans and billing, 2026-10-16): Free and Pro; jobs, alerts,
Tracker and applying yourself stay free; Pro unlocks more auto-apply sends
than Free's 3 a week, "Send as jobs post", tailoring when it returns and
later Pinkslip's outreach composer; Apple in-app purchase on iPhone and
Stripe on the web set the same Pro; prices once there are a few weeks of
real usage. Simplify is left out on purpose.

## What shapes it

- **A job search ends, and that's the goal.** The US median time
  unemployed was 11 to 13 weeks in early 2026; the mean was about 26
  (BLS). Someone who gets hired cancels, and should. Annual plans don't
  fit; what people buy is a stretch of weeks or months.
- **People searching are short on money.** Many are between jobs or just
  out of school, so the price has to feel small next to the stress it
  takes away.
- **What costs Pinkslip money is usage**, not seats: auto-apply runs
  (server browser time), AI (tailoring, classifying jobs, answers) and
  email. A plan should cap those, not the calm parts.
- **The market has settled on 7, 30 and 90 days.** Teal+: $13 a week, $29
  for 30 days, $79 for 90. Huntr Pro: $40 a month, $90 for 3 months.
  Careerflow: $8.99 a week, $23.99 a month. Auto-apply tools run higher:
  JobCopilot about $0.93 a day ($28 a month), AIApply $29 to $99 a month.
- **How app subscriptions behave** (RevenueCat 2026): weekly plans renew
  least (about 2% are still going after a year), which matters less for a
  search that ends. Hard paywalls convert about 5 times better than
  freemium by day 35, but after a year the two retain about the same.
  Longer free trials convert better than 3-day ones (42.5% against 25.5%),
  and most 3-day trial cancellations happen on day 0.
- **Fees:** Apple takes 15% (Small Business Program); Stripe on the web
  takes 2.9% + 30¢, and the US App Store now allows a link out to pay on
  the web.

## The models

| | What it is | Good | Bad |
| --- | --- | --- | --- |
| **A. Free + Pro subscription** (7, 30 and 90 days, renewing) | What Plan C draws today: weekly $9.99, monthly $24.99, 3 months $59.99 | The norm; simple; revenue keeps coming while someone searches | A renewal nobody wanted is the opposite of calm; weekly plans read as a trap to some |
| **B. Free + passes that don't renew** (30 or 90 days of Pro) | Buy a month or a season; it ends unless you buy again (Apple's non-renewing subscription) | Honest, matches a search that ends, no "remember to cancel" | Less revenue: everyone has to choose to come back; Apple and Stripe both support it, but there's no automatic renewal |
| **C. Free + credits** | Packs of auto-apply sends (say 50) and tailoring | Matches what costs money exactly; no subscription | Counting credits is stressful, the opposite of the brand; people hoard them |
| **D. Free + Pro, ending when you're hired** | A: monthly and 3 months; when you mark an offer accepted, Pinkslip offers to end Pro then and there (and says so up front) | Renews while you search, stops when you've won; a promise competitors don't make | Slightly less revenue from people who'd have forgotten to cancel, which is the point |
| E. Pay when you're hired | A fee on getting the job | Fully aligned | Can't be verified, and Apple doesn't allow it in the app |
| F. Ads, or a lifetime deal | | | Ads break the calm; a lifetime deal can't pay for ongoing auto-apply runs |

## Recommendation: D

- **Free stays generous and is the trial:** everything that keeps a search
  organized, plus 3 auto-apply sends a week (decided), and a small weekly
  amount of tailoring when it returns. No separate free trial at first;
  three real sends show what Pro does.
- **Pro: monthly and 3 months**, renewing, no weekly plan. A 30-day plan
  reads as "for this search", a weekly one as a meter running. Prices to
  settle after a few weeks of usage (decided); the market says about $20
  to $25 a month and $50 to $60 for 3 months.
- **"Got the job? Pro ends here."** When an application moves to Offer
  accepted, Pinkslip offers to end Pro on the spot, and the Plan page says
  it would ahead of time. On iPhone, "ending" means opening Apple's
  subscription page; on the web Pinkslip can cancel it itself.
- **The same price on iPhone and the web**, so nobody feels tricked; the
  web's lower fee is margin.
- **Limits show where they bite** (decided): "2 left this week" on Ask
  first's review, never warnings elsewhere.

What step 9 builds either way: each person's plan on the server, weekly
allowances metered per kind, the Plan endpoint the Plan page reads, limits
enforced where they bite, and an admin switch to give someone Pro (the
owner, testers). Payments come at the App Store release.

## For the owner to decide

1. The model (D recommended).
2. Weekly plan or not.
3. What Free gets each week besides 3 auto-apply sends: tailoring, and how
   many.
4. Whether "Pro ends when you're hired" is a promise on the Plan page or a
   quiet offer at the moment.

## Sources

- Job search length: [BLS, duration of unemployment](https://www.bls.gov/web/empsit/cpseea12.htm); [BLS, March 2026](https://www.bls.gov/opub/ted/2026/short-term-unemployed-accounted-for-29-8-percent-of-total-unemployed-in-march-2026.htm)
- Trackers: [Teal vs Huntr (Teal)](https://www.tealhq.com/post/teal-vs-huntr); [Huntr vs Teal vs Careerflow (Careerflow)](https://www.careerflow.ai/blog/huntr-vs-teal-vs-careerflow)
- Auto-apply tools: [AIApply review (Jobity)](https://jobity.io/blog/aiapply-review); [auto-apply tools ranked (JobAgent)](https://www.jobagent.sh/blog/best-ai-auto-apply-tools-2026); [AI job application tools (Blaze)](https://blaze.today/blog/ai-job-application-tools/). Third-party figures, often from competitors; check each vendor before quoting.
- Subscriptions: [RevenueCat, State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps); [free trial length](https://www.revenuecat.com/blog/growth/free-trial-length); [TechCrunch on AI app retention](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows)
