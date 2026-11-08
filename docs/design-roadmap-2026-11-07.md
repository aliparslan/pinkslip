# Design and motion roadmap (2026-11-07)

What's left to make the app feel more impressive, usable and native, after
the Nov 4 polish pass (`polish-pass-2026-11-04.md`) and the Nov 7 flow run
(`flow-run-2026-11-07.md`). The owner wants all of it ("all of these are
awesome. lets jot em all down"). Each item goes through Paper first, and
motion gets a kit toggle to compare against iOS's own apps (Match iOS
motion). How each should move: `research/animations-dev.md`. Proposals
waiting for the owner, from everything shared so far:
`research/directions.md`.

The app's bones are good: calm, consistent, and its paper-and-stamp look is
its own. What's missing is a few moments that feel earned, and the iOS
surfaces that make an app part of the phone. On usability, the gaps are
getting jobs in from elsewhere, and seeing progress without opening the app.

## 1. Motion that still feels off (before 1.4.0)

Small, but felt every day, so they come before anything new. All from the
Nov 7 flow run:

- [ ] 2.36 Undo slides a hidden job back in, the reverse of Hide, instead
      of it just appearing.
- [ ] 4.10 Steps inside a sheet fade instead of sliding.
- [ ] 5.2 The tab bar arrives a beat late after a page; the month wheel
      jitters; Ended appears with no motion.
- [ ] 2.7 Tracker shows nothing, then everything at once.
- [ ] 2.35 Swipe colours are too faint, dark mode especially (Read,
      Applied).
- [ ] 5.9 The sheet's fling after a PDF finishes.

## 2. Signature moments (JavaScript only, ship as updates)

- [ ] **Zoom from list to job.** Tapping a job row grows it into the job
      page, as Photos and the App Store do; Tracker rows into application
      pages the same way. Expo Router 57 has it
      (`<Link.Trigger withAppleZoom>`, iOS 18+), unused so far. The biggest
      single "this feels native" step.
- [ ] **The stamp lands where you are.** Already built: the stub tears off
      when you apply (`motion.stub`), and a new step's stamp lands on your
      stub while you watch (`motion.stamp`). Left: the same moment when
      Pinkslip's send goes out while you're elsewhere (the live bar), and
      Offer, once, when a job reaches it (it pairs with "Pro ends when
      you're hired").
- [ ] **Tracker rows move between stages** with a layout transition
      instead of vanishing and reappearing, and counts tick over ("3 of 10
      sent").
- [ ] **One rule for haptics.** About 40 call sites, no written rule. One
      rule each: success when something goes out, a tick for a choice, a
      warning for a refusal; nothing on scroll or tab switches.
- [ ] **A designed first load.** Placeholders cross-fade into the rows,
      with a short stagger on the first load only, never on refresh.

## 3. iOS surfaces (a native build, with or after Pro)

- [ ] **A Live Activity for sends.** "Applying to Stripe · 2 of 3" on the
      Lock Screen and in the Dynamic Island: the live bar outside the app.
      Auto-apply's most impressive face.
- [ ] **A share extension.** "Track in Pinkslip" from Safari's or
      LinkedIn's share sheet, for jobs found anywhere. The biggest
      usability step.
- [ ] **A Today widget** for the home screen: the next interview, new
      replies, new matches.
- [x] ~~**Pushes with the company's logo**~~ Dropped (owner, 2026-11-08):
      a push stays Pinkslip's, so people know where it came from.
- [ ] **Designed preview cards for shared job links** (flow run 2.30):
      every shared link reads as an ad. Web, not native.

None of these are installed yet (no widget, Live Activity or share
extension target in `apps/native`).

## 4. The website, against "a modern motherfucking website"

The owner shared modernmotherfuckingwebsite.dreamstation.systems (Nov 7):
platform features over frameworks. Checked on pinkslip.work the same day.

Already there: HTTP/3 (Cloudflare's `alt-svc: h3`), a canonical link,
`main`/`nav`/`article`/`header` landmarks, Open Graph and Twitter cards on
every page, dark mode from the system setting, and a `JobPosting` on each
public job (`apps/webapp/src/features/job-detail/structured-data.ts`).

To fix:

- [ ] **`JobPosting` that Google can fully read** (Google for Jobs is
      search traffic):
  - places are written whole into `addressLocality` ("Hybrid - San
    Francisco, CA"); split into locality "San Francisco" and region "CA",
    without the "Hybrid -" prefix;
  - add `baseSalary` when the job has pay, `employmentType` (`INTERN` for
    internships, else `FULL_TIME`), and the company's `logo`;
  - `sameAs` is missing when a company has no domain on file (Oura).
- [ ] **A card per shared job** (flow run 2.30, section 3): the image is
      the site's default for every job, and `og:description` is the
      posting's first sentence ("Our mission at ŌURA…"). Pinkslip's own line
      reads better in a chat: "New grad · San Francisco · $150–200K".
- [ ] **Instant navigation**: the router doesn't preload. TanStack Router's
      `defaultPreload: "intent"` loads a page's data on hover or press, the
      client-side version of the page's speculation rules.

## Left out on purpose

Confetti, sounds, parallax, anything that animates on every scroll, and
more onboarding.

## Order

1. Section 1 before 1.4.0.
2. Zoom to the job page and the stamp for a send as the first update
   after launch.
3. A native release built around the Live Activity and the share
   extension, after Pro.
