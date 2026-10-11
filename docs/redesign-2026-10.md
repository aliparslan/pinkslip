# Redesign groundwork: assessment and direction (2026-10-10)

The owner asked for a ground-up assessment of the iOS app and web, with the
roadmap in mind: three levels of auto-apply, recruiter outreach, email-driven
tracking, events, writing, and pricing. Nothing is above scrutiny. This is the
start of the redesign, so it ends in options and decisions, not a plan.

**Method:**
- Screenshots of every main screen of the 1.3.1 Release build on the iPhone 17
  simulator (iOS 26.4), in light and dark mode.
- pinkslip.work at phone width.
- The token scale in `packages/tokens/src/tokens.ts`.
- A few reference patterns from Mobbin (cited inline).
- Competitor pricing from public reviews (sources at the end).

## The short version

1. **The app is calm and native, but it has no point of view.**
   - The system chrome is right.
   - Inside the content there's nothing that says Pinkslip except pastel pink
     buttons.
   - The iOS app and the website look like two products.
2. **It's built around a feed. The roadmap is built around a pipeline.**
   - Every planned feature moves work forward on the user's behalf: applying,
     emailing, following up, detecting replies.
   - The center of the app has to become the student's progress, not the list
     of postings.
3. **Two things cost trust today:**
   - The first screen of an early-career app shows "Sr Software Engineer"
     roles.
   - The facts a student needs (level, sponsorship, pay) are buried in raw
     descriptions.
4. **The worst bug:** selected chips are unreadable in light mode across
   onboarding, filters and preferences.
5. **Preferences and Filters are two overlapping ways to shape the feed.**
   - They use different vocabulary.
   - Merge them into one saved search with quick refinements.
6. **Recommended:**
   - Navigation: Jobs · Tracker · You now, adding a Today tab when background
     applying ships.
   - Look: native structure with a few brand moments.
   - Pricing: a free tier plus one Pro plan, billed weekly, monthly or per
     recruiting season.
   - All three are options below, with alternatives.

## Decisions (2026-10-11)

The owner's answers to section 11:

- **Assessment:** agreed on grid and layout, typography, and ease of use.
- **Navigation:** Jobs · Tracker · You for now.
- **Apply button:** one button whose state carries every automation level.
- **Look:** A's structure with B's moments.
  - Differ visibly from Simplify, the direct competitor.
  - Do everything it does, better.
- **Pricing:** usage-based, a free and a Pro tier.
  - The goal is to cover costs, not to profit.
  - Details later.
- **Fonts:** Klim for now (trial files), including iOS. The App Store build
  needs the app licence before Klim ships in it.
- **Career stages:** Internships, New grad, Early career (1–3 years),
  Mid-career (3–5 years).
  - Senior titles may appear, placed by their stated minimum, since many ask
    for about two years.
  - Built in this round (B5 below).
- **Email tracking:** forwarded emails first. No Gmail connection yet.
- **Recruiter contacts:** the owner will source them; no LinkedIn scraping.
- **Auto-apply:** low volume.
- **Sequence:** as proposed in section 12.
  - After the design is consolidated, work continues in the iOS app first.
  - Mobile web and desktop follow with their own designs.

## 1. What's working (keep)

- **The chrome is Apple's:**
  - Liquid Glass tab bar, large titles, native search field and context menus.
  - Page sheets, the segmented control, switches and pull to refresh.
- **Dark mode is solid.** It's the better-looking mode today.
- **The row is calm:** logo, company, title, location, with an unread dot and
  dividers inset to the text.
- **Restraint:** a warm neutral ramp and one accent. Nothing shouts.
- **"Did you apply?"** after the application sheet closes is the right moment
  and the right control (a native alert).
- **The motion foundation** from the craft pass: press feedback, swipe rows and
  toasts.

## 2. Bugs found while looking

These are worth fixing whatever the redesign does.

| # | Where | What | Status |
| --- | --- | --- | --- |
| B1 | Onboarding, Filters, Preferences (iOS, light mode) | Selected chips draw dark text on the dark `control-selected-bg`, so the labels are unreadable. The chip passes `tone="ink"` where it should use `control-selected-ink`. It has been there since the scaffold (`f0b2470`) | Fixed: chips use the selected ink |
| B2 | Jobs (iOS) | During launch and pull to refresh, the large title "Jobs" sits on top of the search field | Fixed: the refresh control spins only for a pull (`usePullToRefresh`), never for background refetches |
| B3 | Jobs (iOS) | Two spinners at launch: the refresh control and the list's own | Fixed with B2 |
| B4 | Rows and job page (data) | Locations and salaries arrive unnormalized: "US, WA, BELLEVUE", "US, WA, Seattle", "144K–194K" with no currency, "$185K–$278K," with a trailing comma | Fixed in the shared formatter, so existing data reads right on both platforms |
| B5 | Guest feed (data) | Senior titles lead the feed: "Sr Software Engineer, Merchant Intel 2" on iOS, and 4 of the first 6 web rows. The "Early / mid-career (1–5 years)" stage lets them through | Resolved by decision: senior titles stay when they ask for five years or fewer, and the stage splits into Early career (1–3) and Mid-career (3–5). Needs a backend deploy |
| B6 | Roblox job page (data) | The salary ($182,170–$227,370) is in the description but missing from the row and the facts | Fixed for new postings: the extractor unescapes Greenhouse's escaped markup. Older ones fill in as they're replaced, or with a backfill |

## 3. Assessment

### Visual cohesion

- **The two platforms disagree on the core row:**
  - Web: semibold one-line titles, a bold company name, a ⋮ button per row, a
    subtitle under the page title, and a "Get jobs that fit you" card.
  - iOS: regular-weight titles that wrap to two lines, no overflow button, no
    setup card.
  - Users who move between them meet a different product.
- **Fonts:** the web has Klim (Founders Grotesk headings), which gives it
  character. iOS uses SF at web sizes, so it has neither the brand face nor
  native proportions.
- **Two pinks with blurred roles:**
  - Magenta is used for the tab tint, the light-mode unread dot and links.
  - Pastel is used for primary buttons, the filter badge, switches and the
    dark-mode unread dot.
  - There's no rule a user could learn, such as "pink means act" or "pink means
    new".
- **Selected chips are near-black pills.** On Preferences, a dozen of them form
  the heaviest shapes on the screen, heavier than the title or the Save button.
  The emphasis lands on configuration rather than content.
- **Back buttons:** glass circles on pushed screens, a bare chevron in
  onboarding.
- **Elevation language is mixed:**
  - Cards: white on off-white, no border.
  - Inputs and secondary buttons: fill and border both.
  - Glass buttons: shadow.

### Grid and layout

- **The page margin is a consistent 16pt.** The 4pt grid holds in spacing.
- **Six left edges are in use:**
  - 16pt: page margin, job-page meta icons, body text.
  - 33pt: content inside a preferences card.
  - 40pt: job-page meta text.
  - 52pt: feed row text.
  - 65pt: You row titles.
  - 72pt: job-page title.
  - The eye has no keyline to settle on.
  - Proposal: two keylines. The 16pt margin, and one content keyline for
    everything beside a leading graphic (60pt with a 32pt logo).
- **Job page header:** the title sits beside a 44pt logo and wraps in a narrow
  column. Below it, the meta and body jump back to 16pt. Putting the logo above
  the title puts everything on one edge.
- **The primary action scrolls away.** On a long job page, Save and Apply leave
  with the header, and the page ends in EEO boilerplate with no action.
- **Onboarding's Continue button changes position between steps:** step 1 has
  Continue plus Not now, and later steps have one button.
- **The resume editor stacks six identical full-width "+ Add" buttons.**
  There's no hierarchy, and no preview of what the resume is.

### Grouping and information architecture

- **Preferences and Filters overlap and disagree:**
  - Both set location and career stage.
  - Salary exists only in Filters. Roles and authorization exist only in
    Preferences.
  - The labels differ: "NYC" vs "New York, NY", "SF Bay Area" vs
    "San Francisco / Bay Area", "Anywhere" vs "Anywhere in the US".
  - Nothing says which one drives alerts.
- **Preferences grouping:**
  - Three levels of heading: the nav title, the card heading ("What"), and the
    field label ("Roles").
  - Work authorization sits under "Where".
  - Three overlapping experience controls: career stage, years of experience,
    and "Show jobs requiring".
- **You:**
  - Search config, materials, appearance, help and account are mixed together,
    with the account last.
  - Every row carries a subtitle, against the less-text rule.
  - "On · turn on for this iPhone" is a puzzle.
- **The job menu:**
  - "I applied", the most important lifecycle action, sits in ⋯ next to
    "Report listing".
  - "Not interested" and "Hide Roblox" are two kinds of no with no explanation
    of the difference.
- **Library = Saved | Applied, with no stages.** It's the seed of the tracker
  and the place the new model will grow.

### Typography

- **iOS uses the web sizes** (16 body, 14 secondary, 13 meta) where iOS uses 17
  body, 15 subhead and 13 footnote. Text reads slightly small and webby next to
  native apps.
- **Row titles are regular weight.**
  - Hierarchy comes from colour alone, and read rows lose the title entirely.
  - The company name, the anchor people scan for, has the same weight and
    colour as "Posted 1d ago".
- **"Posted 1d ago" and "Updated 1d ago" repeat on every row.** Both words are
  noise. A quiet trailing "1d", as in Mail, frees the top line.
- **On the job page, the section heading "About the role" (ink-2) is weaker
  than the content heading "About Suno" (ink) directly under it.**
- **The token scale has near-duplicates:**
  - 11 sizes: 11, 12, 13, 14, 16, 16, 18, 22, 24, 32, 40.
  - `fs-md` equals `fs-base`.
  - 13/14 and 22/24 are too close to read as different levels.

### Styling

- **Pastel pink with black text works as a friendly primary.** But it's applied
  to the wrong actions in onboarding: "Skip for now" and "Show my jobs" are
  primary, while "Import from PDF" and "Turn on alerts" are grey.
- **Inputs:** grey fill plus border plus a large radius. It's heavy and
  form-like, and it ignores iOS grouped-list conventions, where a value sits
  trailing in a row.
- **Logos:** 24pt in the feed is small for the main recognition cue. Tiles vary
  between full-bleed and white with a border.

### Ease of use

- **First impression:**
  - Onboarding opens on a form ("What are you looking for?") with no welcome,
    promise or brand moment.
  - The feed then leads with senior roles (B5).
- **Choosing a job:**
  - Nothing on the row says why a job fits: no level, no match.
  - The job page puts company boilerplate first. Level, sponsorship, onsite
    days and pay come later or not at all: Roblox's no-sponsorship line is the
    last paragraph.
- **Applying:**
  - The sheet opens on the ATS page's Overview tab, not the form.
  - Fill is an unlabeled icon.
  - Closing is a ✓ that could mean "I applied".
  - Fill progress isn't shown: how many fields were filled, and which still
    need you.
- **Alerts:** one switch. There's no channel, frequency, digest time or quiet
  hours. With automation, notifications become a primary surface, so this
  matters.

## 4. What the roadmap changes

### From a feed to a pipeline

Today the unit is a **posting**. Every roadmap feature is about the student's
**relationship** with a company:
- applying (by hand, queued, or automatically)
- emailing the recruiter
- following up
- detecting the reply
- reaching the interview

The app's center moves from "what's out there" to "what's happening with my
search". The user approves at the right moments instead of doing every step.

### The object model

- **Job** is a posting.
  - **Application** is your relationship with a job.
    - States: Saved → Queued → Applying → Needs you → Applied → Assessment →
      Interview → Offer.
    - Endings: Rejected, Withdrawn, No response.
- **Company** groups the rest.
  - **Contact** is a recruiter, with a source and a verified marker.
    - **Thread** is your outreach: Sent → Follow-up 1 → Follow-up 2 → Replied
      or Closed.
  - **Event** is a webinar, info session or fair.
- **Post** is a piece of writing: what's new, or a guide.
- **You:**
  - Profile: resume, answers bank, links.
  - Search: the single source for the feed, alerts and auto-apply.
  - Automation rules, connected accounts, notifications and plan.
- **Activity** is the event stream: applied, email detected, follow-up due,
  reply.

The Activity stream is the backbone. It feeds notifications, the Live Activity,
the daily digest, each application's timeline and the stats. Designing it once
keeps those five surfaces consistent.

### Notifications are UI now

Every automation level reaches the user through notifications first:
- **Needs you:** a blank to answer, an interview invite to confirm.
  - Time-sensitive.
  - Actionable where iOS allows: answer a question from the notification, and
    the answer goes into the answers bank so it's never asked again.
- **Replies:** time-sensitive.
- **Daily digest:** passive, at a time the user picks. "Applied to 6, 2
  replies, 1 follow-up due."
- **New matches:** passive, batched.

## 5. Navigation options (decision 1)

| | Option 1: Jobs · Tracker · You | Option 2: Today · Jobs · Tracker · You | Option 3: Jobs · Companies · Tracker · You |
| --- | --- | --- | --- |
| **Idea** | Discover, track, configure. Library becomes Tracker, with Saved as its first stage | A home that answers "what needs me, and what happened" | Companies are first-class: a target list, people, outreach |
| **Events** | A shelf in the feed, on company pages, and an "All events" list | A section in Today | A tab on each company page |
| **Pros** | Smallest change. Clear while automation is still ahead | The consolidated place for autonomous applying. The daily habit. Where Pro's value is visible | Matches how recruiting works: relationships with companies |
| **Cons** | Autonomous activity has to live inside Tracker | Thin before automation ships | Splits a company's applications (Tracker) from its people (Companies) |

**Lean:**
- Start with Option 1.
- Add Today (Option 2) when background applying ships and there's enough
  happening to fill it.
- Design Tracker's top "Needs you" section so it can move into Today later.
- Option 3's best idea, following companies, still applies:
  - Following a company feeds alerts, outreach quotas and events.
  - The company page is one tap from any row.

**Search:**
- Make it global: jobs, companies and events.
- If expo-router's native tabs support iOS 26's search tab role, use a trailing
  search tab. Otherwise keep it in the Jobs header.

**Web:** same structure; the desktop rail carries the same three or four items.

## 6. Key surfaces in the new model

### Jobs

- **Row anatomy, the same on both platforms:**
  - Line 1: company (semibold) and a trailing age ("2h").
  - Line 2: title (semibold).
  - Line 3: quiet facts: level, location, pay.
  - Unread dot in the leading gutter, as in Mail.
  - A tracker glyph if the job is already in the pipeline (Saved, Queued,
    Applied).
- **One saved search** drives the feed, alerts and auto-apply. It's edited in
  one place.
- **Under the search field, a row of quick refinements** (Remote, New grad,
  $100K+, Sponsors visas). They're temporary, and "Edit search" opens the saved
  search. This replaces the Filters sheet and the duplicate vocabulary.
- **Select mode** (native list selection) → "Apply to 8" toolbar, for the
  queue.

### Job page and the one Apply button

- **Header on the 16pt edge:** logo, company, title.
- **A facts block:**
  - Level, pay, location and mode.
  - Sponsorship, posted, deadline.
  - Later, a "Why it fits" line.
- **Description:** sections with the EEO boilerplate collapsed. The company card
  sits at the end (open roles, people, events).
- **A sticky bottom bar holds Save and the Apply button.** That button is where
  every automation level appears, by changing state rather than adding buttons:
  1. Apply
  2. Apply for me (Pro), with "Apply myself" one tap away
  3. Queued · 2 ahead
  4. Applying…
  5. Needs you · 2 questions (pink)
  6. Applied Oct 10 ✓
  7. View in Tracker

  The morph between states is a good use of motion: it signals that the state
  changed.

### Assisted fill (level 1)

- Open straight on the form.
- **A native bar under the page:**
  - "14 of 17 filled · 3 need you", with ‹ › to jump between blanks.
  - A labeled Fill button.
  - Done, not ✓.
- **After submission:**
  - Detected: "Applied · added to Tracker".
  - Not detected: keep today's "Did you apply?".

### Queue and Live Activity (level 2)

- **Select jobs → a review sheet:**
  - Per-job readiness.
  - Shared questions asked once for the batch.
  - Then Start.
- **Live Activity:**
  - Compact: "3/8".
  - Expanded: the current company's logo, "Applying to Stripe", and "1 needs
    you".
  - Reference: [Hevy's "Set 3 of 4"](https://mobbin.com/screens/184c2861-65d0-4764-a3d3-6808a961264e).
  - Live Activities last about 8 hours, which suits a batch but not continuous
    autonomous applying.
- **In the app:** a progress card at the top of Tracker, and a badge on the
  Tracker tab when something needs you.

### Auto-apply (level 3)

- **Mode:** Off · Ask first · Automatic.
  - Ask first is the trust-building middle step. It sends a daily list of
    matches with all selected, and one "Apply to 9" button.
- **Rules:**
  - Match strength.
  - Companies: followed only, or all except hidden.
  - Daily cap.
  - Freshness, for example posted in the last 3 days.
  - Only when every required answer is known.
  - Legal and status questions are never auto-answered (an existing rule).
- **Transparency on every automatic application:** an "Applied by Pinkslip"
  label and a snapshot of exactly what was submitted.
- **Pause** is one tap from Tracker (and Today).

### Outreach

- **Company page:** logo, name, Follow, then segments for Jobs · People ·
  Events.
- **A person shows** name, title, source, and a verified-email marker.
- **Composer:**
  - Template chips: applied and saying hi, asking about internships, after an
    event, asking for a referral.
  - Personalized words are highlighted, so the user sees what was filled in.
  - A follow-up plan row: "Follow up Oct 13 and Oct 20 if no reply", set to
    remind or to send automatically (Pro).
  - Send from the connected account, or Open in Mail.
- **Daily quota (Pro):**
  - "Send up to 5 a day" to recruiters at followed companies, or for jobs I
    apply to.
  - Ask first or automatic.
  - Sent on weekday mornings in the recipient's time zone.

### Tracker and email tracking

- **Top:** "Needs you", the queue card, then Applications · Outreach.
- **Applications are grouped by stage.**
  - Each stage has a glyph that fills as it advances, like
    [Linear's status icons](https://mobbin.com/screens/30ebc468-06c8-46dd-9503-e197e89a1e5c).
  - Stage isn't carried by colour alone.
- **On a phone, a grouped list beats a board.** Desktop and web get a board.
- **Application page:**
  - A vertical timeline, as in
    [Mercury's review status](https://mobbin.com/screens/ec7b66ef-59c2-495b-9872-7f17f40c5c52).
  - Each email-detected step shows its source ("from 'Your application to
    Stripe', Oct 12") and "Not right? Change". Detections will sometimes be
    wrong, so correcting one is a single tap.
  - Also: the submitted answers, people at the company, notes, and the next
    step.
- **Stats:**
  - A funnel: applied → responses → interviews → offers.
  - Response rate by channel (automatic, manual, outreach) and time to first
    response.
  - The flow view (Sankey).
  - Export to CSV or Google Sheets.
- **Make the Sankey shareable as an image.** Students already post their search
  Sankeys, so a branded one is a growth loop.

### Events

- **Row:** a date block, the host's logo, title, local time, and virtual or
  in-person.
- **Actions:** Register (external), Add to Calendar, Remind me.
- **Sources:** curated first. Later, "Submit an event" goes to an admin review
  queue on the web.

### Writing

- **Two streams:**
  - What's new: changes and notices.
  - Guides: tips.
- **In the app:**
  - What's new lives in You, plus a one-time sheet after big releases.
  - Guides appear in context: the cold-email guide in the composer, the
    interview guide when a status turns to Interview.
- **On the web:** `/blog` as public pages. Guides like "how to cold email a
  recruiter as a new grad" are search traffic, which the owner cares about.

### You

- **The identity card is on top:** name, school and grad year, plan.
- **Sections:**
  - Profile: resume, answers, links.
  - Search: saved search, followed and hidden companies.
  - Automation: auto-apply, outreach, follow-ups.
  - Connections: email.
  - Notifications: per type, digest time, quiet hours.
  - Plan, Appearance, Help and What's new.
- **Rows:** trailing values ("Job alerts   On") instead of subtitles.

## 7. Visual direction options (decision 2)

| | A. Native calm | B. Paper | C. Instrument |
| --- | --- | --- | --- |
| **What** | iOS text styles, grouped lists, system materials. Brand only through the accent, logo and empty-state illustrations | Leans on the name: a pink slip is paper. Display type for titles, mono for dates and numbers, a "stamp" when a status changes (Applied, Interview, Offer), a perforated edge on milestones | Dense, monochrome, numbers forward, like Linear. Pink only for "needs you" |
| **Good for** | Speed, accessibility, feeling at home | Memorability. Ties to the planned skeuomorphic logo. Makes tracking feel rewarding | The automation and analytics future |
| **Risk** | Generic | Kitsch if overdone. Needs the Klim app licence and more custom work | Cold for 19-year-olds |

**Lean:** A's structure with B's moments.
- Native chrome, lists and type proportions everywhere.
- Brand concentrated in a few rare, high-value places:
  - display titles
  - mono metadata
  - the stamp on status changes
  - the Apply button morph
  - empty states
- Status changes happen a few times per application, so the stamp passes the
  animation frequency test.

## 8. Proposed system rules

These would be tested in wireframes before they reach tokens.

- **Keylines:** a 16pt margin and a 60pt content keyline (16 + 32pt logo + 12).
  Card content sits 16pt inside the card.
- **Type on iOS** follows the system text styles, with five sizes in daily use:
  - 34 Large Title.
  - 22 Title.
  - 17 Headline (semibold) and Body.
  - 15 Subhead.
  - 13 Footnote.
  - 12 Caption is for rare use.
  - The web keeps 16 body but drops the near-duplicates.
- **Weight:** list titles semibold, secondary text regular.
- **Colour:**
  - One accent hue with two roles: ink (text, icons, tint) and fill (primary
    actions).
  - Pink means "act" or "needs you", nothing else.
  - Status is neutral glyphs, green only for an offer, grey for closed.
- **Controls:**
  - Fill or border, never both.
  - Inline chips only for six options or fewer. Longer multi-selects become
    check lists or a searchable picker; metros, for example.
  - Selected chips use the accent fill rather than near-black.
- **Forms** are grouped lists with trailing values, iOS-style. Subtitles appear
  only where a wrong guess costs something.
- **Icons:** SF Symbols throughout on iOS, Phosphor on the web. This resolves
  the open icon question in `design-refresh-guide.md`.
- **Motion:**
  - System motion for navigation.
  - Brand motion only for status changes, queue progress and the Apply morph.

## 9. Pricing options (decision 3)

### The market

Episodic plans at roughly $30–40 a month:

| Product | Plans |
| --- | --- |
| Simplify+ | $19.99 a week, $39.99 a month, $89.99 for 3 months |
| Jobright Turbo | $17.99 a week, $39.99 a month, $89.99 a quarter |
| Teal+ | About $29 a month, $79 a quarter |
| LazyApply | $99–$999 a year, by daily application limit |

- Weekly and quarterly plans exist because a job search is a season, not a
  lifestyle.
- Billing complaints are a recurring theme in competitor reviews. Easy
  cancellation is a feature.

### What Pinkslip's costs scale with

- **Per use:**
  - Background and autonomous applying (browser automation plus a model).
  - Contact lookups.
  - Sending at volume.
- **Fixed:**
  - The Gmail security assessment.
  - Tracking and stats.

### Options

| | A. Free + Pro | B. Free + Plus + Pro | C. Credits |
| --- | --- | --- | --- |
| **Shape** | One paid plan, billed weekly, monthly or per season (3 months) | Plus: tracking, outreach sending, follow-ups. Pro adds background and automatic applying | Free tier, plus packs of application or email credits; Pro bundles credits |
| **Pros** | Simple to explain and build | Splits on the real cost driver | Cost matches revenue exactly |
| **Cons** | Heavy autonomous users cost more | Two paywalls to design and explain | Feels like a meter; students hate running out mid-season |

**Lean:** A, with fair-use caps (daily auto-apply and outreach limits, which
deliverability and quality need anyway).

Starting price hypotheses, priced under the market for students:
- $9.99 a week, $24.99 a month, $59.99 per season.
- Test them with the current testers before launch.

**Free:**
- the feed, search and alerts
- job pages with facts
- unlimited assisted fill: it runs on the device, and it's the hook
- the manual tracker and forwarded-email tracking
- outreach drafts with reminders
- events and guides
- sharing the Sankey

**Pro:**
- the queue and Live Activity
- Ask first and automatic applying
- auto-sent outreach and follow-ups, and daily quotas
- contact discovery beyond a few a month
- inbox-connected tracking
- full stats and export

**Paywalls** appear at the moment of intent, never in onboarding:
- queueing a batch
- turning on auto-apply
- connecting the inbox
- Each shows its value first: "23 jobs this week you could have auto-applied
  to".
- A taste comes before the paywall: a 7-day trial, or the first 5 automatic
  applications free.

**Payments:**
- StoreKit on iOS: 15% under the Small Business Program.
- Stripe on the web.
- One entitlement on the account.
- In the US, apps may currently link out to web checkout without Apple's
  commission (the April 2025 Epic order). The commission question is back
  before the district court, so check before relying on it.

## 10. Constraints that shape the design

- **Reading Gmail is a restricted scope.**
  - It needs Google's annual CASA security assessment. Reports range from about
    $540 for one indie Tier 2 review to vendor estimates in the tens of
    thousands.
  - Sending only (`gmail.send`) is a lighter, "sensitive" review.
  - Microsoft's Graph verification is lighter still.
  - A personal forwarding address (TripIt-style) needs no OAuth at all.
  - Design for both: "Connect inbox" and "Forward emails".
- **Scraping LinkedIn breaks its terms, and LinkedIn litigates.** Prefer your
  own lists (the owner's stated preference), licensed sources, or company
  pages. Every contact shows its source.
- **Auto-apply carries reputational risk** with employers and ATS vendors. Caps,
  quality thresholds and the submitted-answers snapshot are product
  requirements, not polish.
- **Live Activities** need a Swift widget extension and push updates. They fit
  a batch but not an always-on mode, so autonomous applying reports through the
  digest.
- **Outreach deliverability** from personal mailboxes means modest daily caps
  and per-recipient caps across all users, as recommended earlier.

## 11. Decisions for the owner

1. **Navigation:** Option 1, 2 or 3. Lean: 1 now, 2 when queued applying
   ships.
2. **Visual direction:** A, B, C or a mix. Lean: A structure, B moments.
3. **Pricing model:** A, B or C. Lean: A, billed weekly, monthly or per season.
4. **Klim app licence for iOS:** needed for direction B's display type.
5. **The first email-tracking route:** forwarding address, Outlook or Gmail
   (which needs the assessment).
6. **Contact data source:** your own lists, a licensed source, or both.
7. **Scope of "Early / mid-career":** should titles with "Senior" ever reach
   this audience? (B5)

## 12. Proposed sequence (after the decisions)

1. Fix B1–B3 (app) and B4–B6 (data).
2. Fill in the brief (template in `docs/design-refresh-guide.md`).
3. Lo-fi wireframes in Paper of the chosen navigation, for four screens:
   - Jobs
   - the job page with the Apply bar
   - Tracker
   - You
4. Visual directions on those four screens.
5. Codify tokens and kits, then roll out screen by screen.

## Sources

- Simplify+ plans: [Simplify help center](https://help.simplify.jobs/articles/5623502-whats-included-in-simplify-features-and-pricing)
- Teal+ plans: [Front Desk Review](https://frontdeskreview.com/software/resume-builders/teal.md), [Ophy](https://ophyai.com/blog/resume-writing/teal-ai-resume-builder-review)
- Jobright plans: [ResumeHog review](https://resumehog.com/blog/posts/jobright-ai-review-2026-is-this-job-search-copilot-worth-it.html), [ATS Verification review](https://atsverification.com/blog/jobright-ai-review-2026/)
- LazyApply plans: [Adzuna](https://www.adzuna.com/blog/?p=12824), [Stork](https://www.stork.ai/en/lazyapply)
- Gmail restricted scopes and CASA: [Nylas](https://developer.nylas.com/docs/cookbook/use-cases/build/google-oauth-scopes/), [DeepStrike](https://deepstrike.io/blog/google-casa-security-assessment-2025), [Indie Hackers report](https://www.indiehackers.com/product/mailnotes)
- External purchase links: [TechSpot](https://www.techspot.com/news/112956-apple-fight-epic-over-app-store-fees-reaches.html), [The Next Web](https://thenextweb.com/news/supreme-court-apple-epic-contempt-stay-denial), [MacRumors](https://macrumors.com/2026/06/11/apple-fights-back-against-epic/)
- Patterns: Mobbin screens linked inline.
