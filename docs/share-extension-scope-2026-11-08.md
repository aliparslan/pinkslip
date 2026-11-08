# "Track in Pinkslip": scope to settle (Nov 8)

Roadmap §3: a share extension, so a job found anywhere (Safari, LinkedIn,
a company's site, a friend's message) goes into Tracker without copying
links around. Nothing is drawn yet; this is what it's for and what it would
take, for you to settle first.

## What it does

1. You tap Share on a job page in Safari or LinkedIn and pick Pinkslip.
2. A small sheet slides up over that app (not Pinkslip opening):
   - **A job Pinkslip already has** (a Greenhouse, Ashby or Lever posting in
     the catalog, or a pinkslip.work link): its logo, title and company, as
     in Pinkslip.
   - **A job Pinkslip doesn't have** (LinkedIn, a company's own site): the
     company and title, filled in from the page's title, both editable.
3. Two buttons: **Save** and **I applied**. The second records it as applied
   today. (This answers the question I asked earlier: both, instead of
   picking one.)
4. A check, "In Tracker", and the sheet goes. Nothing else to do.

Signed out, the sheet says "Sign in to Pinkslip first" with a button that
opens the app.

## What it takes

- **A new native target** (a share extension) in the committed iOS project,
  with an App Group so it can use the app's sign-in. Its sheet is SwiftUI in
  the app's own style: the system font, the kit's colours and the job row.
  It can't ship as an update; it reaches your phone with the next build,
  which happens when you push `main`.
- **One new API route** (additive): look up a link and return the job if the
  catalog has it. A Worker deploy, with your go-ahead.
- Recording uses the routes that exist: track a job by id, or add one by
  hand from company, title and link.

## Your calls

1. **Both buttons** (Save and I applied), or one?
2. **Jobs Pinkslip doesn't have:** add them by hand with the fields filled
   in, or only take links Pinkslip already knows?
3. **Where it goes:** straight into Tracker (proposed), or open Pinkslip on
   the job afterwards?

Once these are settled, the sheet gets drawn in Paper for your OK, then
built and tested in the simulator.
