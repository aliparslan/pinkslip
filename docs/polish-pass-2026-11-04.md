# Polish pass, 1.4 app (2026-11-04)

The app as a new guest sees it, on the iPhone 17e simulator (390 wide, the
smallest current iPhone), against production, light and dark, default and
XXXL text. Screens that need data were checked on the kit's samples.

**Fixed the same day, items 1–8** (owner: "ok go"), checked on the 17e
against the same screens. Search's hint now ends on two words ("your
feed."), which the line breaking leaves; a long last word like
"Intelligence" in a job title stays on its own, as UIKit does. Items 9–13
are untouched.

## Worth fixing

1. **One-word last lines.** Titles and centred lines end on a lone word:
   "Where are you in your / career?", "Where do you want to / work?", "Jobs
   you save or apply to show up / here.", "…not just / your feed."
   React Native's Text uses no line-break strategy on iOS; UIKit's labels use
   Apple's standard one, which avoids these. Fix: `lineBreakStrategyIOS:
   "standard"` in the kit's `Text` (and the few raw `RNText` headlines), one
   place, every screen.
2. **Straight apostrophes.** "shouldn't", "they're", "I'm", "What's new"
   use `'`. SF draws it as a tick; Apple's own copy uses `’`. Fix: curl
   apostrophes in the strings the app writes (not data from jobs).
3. **Apple's job descriptions run their bullets together.** Minimum
   Qualifications reads "…writing software Experience working on…":
   the list items lost their breaks somewhere between Apple Jobs and the
   page. Needs a look at how Apple's postings are turned into the
   description (worker) before it's a fix.
4. **Text shows through the job page's floating buttons.** Scrolled
   description text sits clearly behind Back, Share and More, with little
   fade under the status bar. A stronger top edge (the kit's
   `TopEdgeBlur`, as You uses) would settle it.
5. **"About the role", then "Summary".** Two headings in a row at nearly
   the same size; the posting's own headings compete with Pinkslip's. Its
   headings could step down to Subhead Medium `ink-2`, or "About the role"
   could go when the posting starts with a heading.
6. **The stats button on an empty Tracker.** Stats of nothing; it could
   show once something is saved or applied.
7. **Empty states jump between tabs.** Today's and Tracker's "Nothing yet"
   sit about 30 apart, so switching tabs moves the picture. Same place on
   both.
8. **The hook's collage crowds the headline on small phones.** On the 17e
   the "47 applied · 2 replies" card nearly touches "Job hunting shouldn't
   be another job." It could sit higher, or the collage could scale to the
   space above the headline.

## For the owner to decide

9. **"Soon" rows in the first App Store build.** You shows Outreach, Plan and
   Auto-apply as Soon. They're kept on purpose, but App Review can reject
   placeholder features (guideline 2.1, app completeness). Options: keep
   them, or hide the three for the 1.4.0 build and bring them back as each
   ships.
10. **What's new says 1.3** in what will be 1.4.0 (the latest update note's
    version). The App Store session may already have this.
11. **Large text cuts the pay first.** At the largest sizes a row's third
    line ends "San Diego, CA · $123…", while "New grad" repeats on every
    row of a new-grad search. Dropping the level when the search has only
    that level would keep the pay.
12. **Rows that look the same.** Two Apple postings ("Cellular Power
    Optimization Software Eng…", San Diego) differ only after the cut
    and in pay. Nothing to fix in the row; noted.
13. **A thin first feed.** New grad, SWE, anywhere in the US showed 18
    jobs (4 this week). That's the first thing a new person sees.

## Fine as is

- Dark mode on Jobs, the job page, Tracker and You.
- XXXL text on Jobs: rows grow and nothing overlaps.
- The onboarding questions, the sheet over Jobs, and the feed loading in
  behind it.
- Tracker with data: stage headers, the email card, rows and dates.
