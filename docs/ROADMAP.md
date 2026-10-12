# Pinkslip roadmap (2026-10-11)

Everything left, in the order we'd do it. It's built from the owner's
decisions in [redesign-2026-10.md](redesign-2026-10.md), the port closeout
([port-closeout.md](port-closeout.md)) and the roadmap the owner laid out on
2026-10-10.

Sizes are relative: S is a session, M a few, L a week or more of sessions.

## Where things stand

- **The React and Expo port is done.**
  - The web is live on pinkslip.work.
  - iOS 1.3.1 ships through Xcode Cloud to TestFlight.
  - Over-the-air updates for iOS JavaScript are set up.
- **Already built, visible only to the admin account:**
  - Outreach drafts with follow-up reminders (`OUTREACH=admin`).
  - Level-1 assisted apply: Greenhouse and Ashby forms prepared from the
    profile and answers bank, then filled in the iOS in-app browser
    (`AUTO_APPLY=admin`).
- **Career stages:** Internships, New grad, Early career (1–3 years) and
  Mid-career (3–5 years). Deployed.

## Open owner items (any time)

- [ ] The brief: feeling words and references ([redesign-brief.md](redesign-brief.md)).
- [ ] Install the next TestFlight build: the first that can receive
  over-the-air updates.
- [ ] Remaining phone checks:
  - a real ATS fill with the PDF attached
  - a job alert opening the right job
  - account deletion with Apple token revocation
- [ ] Search Console sitemap and the Rich Results test on a job page.
- [ ] Optional: the Apple portal setup for website Apple sign-in
  ([apple-web-sign-in-setup.md](apple-web-sign-in-setup.md)).
- [ ] Optional: a one-off salary backfill for older Greenhouse postings
  (writes to the live database).
- [ ] Deploy the backend (`bun run deploy:backend`) to apply the source
  catalog repair and the empty-board fix (migrations 0087 and 0088,
  [source-health-2026-10-12.md](source-health-2026-10-12.md)). Afterwards the
  admin Sources count of sources that "need attention" should fall.

## 1. Redesign foundations, iOS first · L

The agreed sequence. Each screen ships over the air as it lands; native
changes go out in one build.

1. **Wireframes in Paper** (structure, grid, grouping), for Jobs · Tracker ·
   You:
   - Jobs
   - the job page with the sticky Save and Apply bar
   - Tracker
   - You
2. **Visual directions:** native structure with paper moments. Two or three
   takes on those four screens.
3. **iOS-only tokens and fonts:**
   - Values that don't restyle the web.
   - Klim on iOS (trial files for now).
   - Five-size type ramp, two keylines, one pink with two roles.
4. **Kit:**
   - row, buttons, chips (accent selection), grouped-list forms
   - sheets, stage glyphs, the status stamp, the morphing Apply button
5. **Screens:**
   - Jobs: the shared row anatomy. Quick refinements under search replace the
     Filters sheet. One saved search replaces Preferences plus Filters.
   - Job page: a facts block (level, pay, place and mode, sponsorship,
     posted), collapsed boilerplate, the sticky Apply bar.
   - Library becomes Tracker: Saved and Applied, with stages you can set by
     hand.
   - You: identity first, trailing values, the new grouping.
   - Onboarding: a welcome step, the right primary actions, four career
     stages.
   - Alerts: per-type settings, digest time, quiet hours.

## 2. Tracking, the backbone · L

Everything later reports into this, and none of it costs money per use.

- **Applications with stages:**
  - Saved → Applied → Assessment → Interview → Offer.
  - Endings: Rejected, Withdrawn, No response.
  - A timeline per application, plus notes.
- **One activity stream** feeds:
  - notifications
  - the daily digest
  - timelines
  - stats
  - later, the Live Activity and Today
- **Forwarded-email tracking:**
  - A personal forwarding address on Cloudflare Email Routing, handled by
    the Worker.
  - ATS emails (Greenhouse, Lever, Ashby, Workday) are recognized
    automatically, with a one-tap "Not right? Change".
  - No Gmail connection.
- **Stats:**
  - a funnel, response rate and time to first reply
  - the Sankey flow, shareable as an image
  - CSV export

## 3. Auto-apply · L

- **Level 1 for everyone:**
  - Opens straight on the form.
  - A fill bar ("14 of 17 · 3 need you", jump to blanks), labeled Fill and
    Done.
  - The Answers screen built for real (it's a placeholder today).
- **Level 2, background and queue:**
  - Select jobs, then a review sheet with shared questions asked once.
  - Server-side filling with Cloudflare Browser Rendering and Workflows.
  - "Needs you" notifications you can answer from the lock screen.
  - A Live Activity for the batch (a Swift widget extension, one native
    build).
- **Level 3, autonomous:**
  - Ask first (a daily list, one tap), then Automatic.
  - Rules: match, companies, daily cap, freshness, known answers only.
  - A snapshot of what was submitted, and a one-tap pause.
  - The **Today** tab arrives here, with the daily digest.
  - Kept low-volume and user-approved. Legal and status questions are never
    answered automatically.

## 4. Outreach · M–L

- **Company pages:** Jobs · People · Events, and Follow. Following drives
  alerts, events and quotas.
- **Contacts** come from the owner's lists, imported through admin. Each
  shows its source and whether its email is verified.
- **Composer:**
  - templates, with the personalized words highlighted
  - follow-ups at 3 and then about 5 business days
  - send from your mail app (works today); auto-send later
- **Auto-send and daily quotas:**
  - Sending only, through Gmail or Outlook. Lighter verification than
    reading mail.
  - Per-recipient caps across all users.
  - Replies are detected through the Phase 2 forwarding address.
- **The Outreach segment in Tracker:** follow-up due, waiting, replied,
  closed.

## 5. Community and writing · M

- **Events board:**
  - Curated first: webinars and recruiting events, with Register, Add to
    Calendar and Remind me.
  - Then community submissions with admin review on the web.
- **Writing:**
  - What's new in the app, with a sheet after big releases.
  - Guides shown in context.
  - `/blog` on the web for search traffic.

## 6. The web catches up · L

- **Mobile web** gets its own version of the new design.
- **Desktop** builds on the earlier redesign canvas, plus a Tracker board,
  stats and admin tools (event review, contact import).
- The web stays live and correct throughout. Only the redesign waits.

## 7. Pricing, licences and launch · M

- **Pricing:** usage-based Free and Pro, to cover costs.
  - Metering first: an applications and emails ledger.
  - Then StoreKit on iOS and Stripe on the web.
  - Paywalls appear at the moment of intent.
  - Costly automation (Levels 2 and 3, auto-send) stays beta-gated until
    then.
- **Before a public launch:**
  - the Klim web and app licences
  - the commissioned logo
  - the seller name (personal or company)
- **App Store** (tabled):
  - hide the Coming-soon placeholders in that build
  - App Store Connect metadata and privacy answers
  - reviewer notes

## Dependencies at a glance

- Today, the Live Activity and stats need the Phase 2 activity stream.
- Levels 2 and 3 should land after tracking, so automatic applications have
  somewhere to report.
- Outreach reply detection reuses the forwarding address.
- Paid automation for everyone needs pricing first. Until then it's beta- or
  admin-gated.
- Native work (the Live Activity widget, Klim if embedded natively, new native
  modules) batches into builds. Everything else ships over the air.
