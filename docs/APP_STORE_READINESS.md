# Pinkslip App Store launch checklist

Updated 2026-11-04 for the Expo app (release 1.3.9). This replaces the
Capacitor-era checklist (1.0.3, build 42); read that with
`git show f437db2:docs/APP_STORE_READINESS.md`.

The owner runs App Store Connect. Pushes, deploys and over-the-air updates
need the owner's go-ahead, as everywhere else.

## Where things stand

Checked in the repo or production on 2026-11-04:

- [x] App record exists. Store name **Pinkslip: Job Search & Apply** (plain
  "Pinkslip" is taken), subtitle **Job hunting, from start to end**. The
  home screen, pushes and subscriptions say just "Pinkslip".
- [x] Bundle `dev.alip.pinkslip`, iOS 16.4 and later, iPhone only, portrait.
- [x] Xcode Cloud archives every push to `main` for TestFlight, and external
  testers already get builds.
- [x] Guest mode: jobs, search and job pages work without an account. The
  production access gate is off.
- [x] Sign in with Apple, Google or an email code, and "Use my password" for
  an account that made one after a code (`password_after_code_enabled` is
  on in production). Apple sign-in sits beside Google, as guideline 4.8
  requires.
- [x] Account deletion in the app: **You → Account → Delete account**. The
  production Worker has `APPLE_SIGN_IN_PRIVATE_KEY` and
  `APPLE_TOKEN_ENCRYPTION_KEY`, so deletion can revoke Apple's token.
- [x] Push: TestFlight uses production APNs and the owner's TestFlight push
  test arrived. `APNS_SANDBOX` stays unset in `wrangler.toml`.
- [x] Export compliance: `ITSAppUsesNonExemptEncryption` is `false` in
  `Info.plist`, so builds don't ask.
- [x] `PrivacyInfo.xcprivacy` is committed. The app has no analytics,
  crash-reporting or tracking SDKs.
- [x] Public pages: [privacy](https://pinkslip.work/privacy),
  [terms](https://pinkslip.work/terms),
  [support](https://pinkslip.work/support). `support@pinkslip.work`
  forwards to the owner.
- [x] Paid Apps agreement, bank account and W-9 active. Small Business
  Program applied for on 2026-10-24.
- [x] Tailoring is hidden in the app and on the website (`tailoringShown` in
  each app's `src/features/tailoring/shown.ts`). Committed 2026-11-04, not
  yet pushed. Direct links still open its coming-soon page, which is fine.

## Decisions

All made by the owner on 2026-11-04:

- **Seller:** the owner's personal name (individual membership) for now.
  An LLC comes in a few months. Then convert this membership through
  Developer Support (subject "Account Updates and Renewals") rather than
  opening a company account and transferring the app: Sign in with Apple
  IDs belong to the team, so a transfer would mean migrating every Apple
  user. Ask Apple to confirm in writing that the Team ID stays the same,
  since Apple sign-in, push and the website's app links depend on it.
- **No AI consent prompt.** The privacy page covers the AI processing (see
  below).
- **The repository stays public.**
- **Pro waits for an update.** The app's StoreKit side isn't built, so this
  release sells nothing and the Plan row stays "Soon". When submitting,
  App Store Connect offers to add the two subscriptions: leave them out.
- **Availability: the United States only.** The jobs are US jobs, the
  Stripe tip link is allowed on the US storefront only, and selling in the
  EU needs a Digital Services Act trader declaration, which shows a trader's
  address, phone and email on EU listings. For an individual, that's a home
  address. Revisit after the LLC.
- **Version 1.4.0.** This is the public release, so it's held to the
  stability bar below.
- **Category: Productivity**, with no second category (owner: Pinkslip
  doesn't fit Business).
- **A review account with a password**, which the owner makes (see "The
  review account"). Guideline 2.1 asks for a demo account when features need
  one.

## Before submitting

### Stability for 1.4.0

1.4.0 has to be steady from its first day, so it's built as a release
candidate, not as one more TestFlight build:

- **Freeze what the app does.** 1.4.0 carries what's on `main` when the
  candidate is cut. Unfinished work stays hidden or behind its server
  switch (Outreach and auto-apply sends are admin-only; Plan and Tailoring
  are hidden or "Soon"). After the cut, only fixes go into 1.4.0.
- **Every check before the cut:** `bun run check`, `bun test`,
  `bun run build`, `bun run test:e2e`,
  `bun --filter @pinkslip/native export:ios`, then
  `cd apps/native && bunx playwright test -c playwright.config.ts`.
- **Soak it.** Send the 1.4.0 build to the external testers and run the
  phone checks below. Watch Xcode → Window → Organizer → Crashes and the
  TestFlight feedback for a few days. Submit only with no crash open. A fix
  means a new build and the phone checks again.
- **Quiet during review and launch week.** No over-the-air updates to 1.4.0
  except crash fixes, no API changes testers' builds rely on (the API stays
  additive anyway), and a D1 restore point before any migration.
- **Know the rollback.** An update that misbehaves is undone by republishing
  the previous one (`eas update:republish`, see `apps/native/README.md`).
  Try it once on the owner channel before launch.

### The build

- [x] The app draws in the system font (6eaf446, 2026-11-04). The redesign
  used the Klim trial cuts, which can't ship in a store build.
- [x] Google sign-in on the iPhone requires the handoff (owner, Nov 10). An app
  from before the update can't finish a Google sign-in until it updates.
- [x] Apple Developer → Identifiers → `dev.alip.pinkslip` → **Time Sensitive
  Notifications** is on (owner, 2026-11-09). The project carries that
  entitlement, so an archive needs the App ID to allow it.
- [x] Bump to 1.4.0 everywhere `apps/native/README.md` lists, and run
  `bun test tests/native-release.test.ts`. Do this when cutting the
  candidate, not before: until then, updates for testers still go to 1.3.9.
- [x] Push `main` (go-ahead). Xcode Cloud builds it with tailoring hidden.
  Done Nov 10 at `5e903ca`; the archive succeeded.
- [ ] Confirm the Xcode Cloud workflow's Archive action says **TestFlight and
  App Store** under Deployment Preparation. External testing already needs
  it, so this is probably done.
- [ ] On that TestFlight build, on the owner's iPhone:
  1. Delete the app and install fresh: onboarding, then the Jobs feed as a
     guest.
  2. Sign in with Apple, then sign out and in with Google, and with the
     review account's password.
  3. You shows no Tailoring row, and no job's ⋯ menu has "Tailor resume".
  4. Import a text PDF and a scanned PDF under You → Resume.
  5. Open Apply on a Greenhouse job and use Fill. **Stop before
     submitting.**
  6. Set up Email tracking and forward one job email.
  7. A job alert push opens its job, and a `pinkslip.work/jobs/…` link from
     Messages opens the job.
  8. Make a throwaway account with Sign in with Apple and delete it. In iOS
     Settings → your name → Sign-In & Security → Sign in with Apple,
     Pinkslip should be gone, which shows Apple's token was revoked.

### The review account

The owner makes this; it needs a real inbox and a password, which an agent
doesn't handle.

- [ ] Cloudflare dashboard → pinkslip.work → Email → Email Routing →
  Routing rules → **Create address**: `review`, sent to the same Fastmail
  address as `support@`.
- [ ] On the phone, signed out: You → Guest → `review@pinkslip.work` → the
  code from Fastmail → **Make a password**. Keep it in the password manager.
- [ ] Give the reviewer something to see: import the made-up resume at
  `tests/fixtures/resume-import/latex-resume.pdf` (Jordan Lee, not a real
  person), fill in a few Answers, and save a couple of jobs. Never use a
  real resume, and never make the account an admin.
- [ ] App Store Connect → the 1.4.0 version → App Review Information →
  **Sign-in required**: the email and password.

### The privacy page

- [x] Added to `shared/legal.ts` on 2026-11-04: forwarded job emails, saved
  application answers (including the optional demographic ones), every
  Workers AI use, and Google sign-in. `LEGAL_UPDATED_AT` is November 4,
  2026, and `tests/legal-pages.test.ts` checks the new lines.
- [x] Live on pinkslip.work since 2026-11-04 (`pinkslip-web` version
  `7fb2d3b3`, which also hides tailoring on the website).

### App Privacy answers

App Store Connect → App Privacy. Nothing is used for tracking. Everything
below is linked to the user, for App Functionality unless noted.

Entered and published in App Store Connect on 2026-11-04:

| Apple's category | Data types | What it is in Pinkslip | Purposes |
| --- | --- | --- | --- |
| Contact Info | Name, Email Address | Account | App Functionality |
| Contact Info | Phone Number | The resume's contact line | App Functionality |
| Financial Info | Other Financial Info | Salary expectations in saved answers | App Functionality |
| Location | Coarse Location | Saved places (typed, not GPS; declared to be safe) | App Functionality, Product Personalization |
| Sensitive Info | Sensitive Info | Optional demographic answers (race, disability) | App Functionality |
| User Content | Emails or Text Messages | Forwarded job emails | App Functionality |
| User Content | Customer Support | Feedback and reports | App Functionality |
| User Content | Other User Content | Resume, profile, saved answers, application records | App Functionality, Product Personalization |
| Identifiers | User ID | Account | App Functionality, Analytics |
| Identifiers | Device ID | Push token | App Functionality |
| Usage Data | Product Interaction | Saves, views, applies, hides | App Functionality, Analytics, Product Personalization |
| Diagnostics | Crash Data | JavaScript errors, fatal ones included (`platform/error-reporting.ts`) | App Functionality |
| Diagnostics | Other Diagnostic Data | Server-side error and delivery details | App Functionality |

Not collected: Purchases (tips stay with Stripe and the server doesn't tie
them to accounts), Financial Info, Health, Contacts, Browsing History,
Photos, Audio. **Search History:** no search-term logging was found on
2026-11-04. Check again before answering, since adding it later changes the
label.

### The listing

- [x] Description, keywords (100 characters) and promotional text, approved
  and entered 2026-11-04 ([app-store-listing.md](app-store-listing.md)). Copy
  rules: never "we"; sell the calm after (one app, less stress), not feature
  lists or job counts; written for new grads and early- and mid-career
  people, not just students; no time promises. The owner approves the copy.
- [x] Two screenshots uploaded by the owner (2026-11-04). Screenshots go
  under **App Previews and Screenshots** (pick it from
  the menu at the top of the product page, which opens on "Header and
  Search Results") → **iPhone with Dynamic Island (medium display)**. As of
  2026-11-04 that slot takes 6.1 or 6.3-inch sizes: 1206 × 2622 or
  1179 × 2556. Two are ready (onboarding and a job page, from the
  production build in the Simulator as a guest); the Jobs feed, Tracker and
  Search need a simulator window to tap in. Don't save anything on
  production. "Header" and "Search Results" are optional wide banners
  (5244 × 2950 and similar) that need designed art.
- [x] Category Productivity (no second category), price Free, availability
  United States only, and Apple silicon Mac and Vision Pro availability off
  (1.4.0 is tested on iPhone only). Version 1.4.0, support and marketing
  URLs, review notes and manual release are saved too (2026-11-04).
- [x] Age rating **16+** (2026-11-04). Every content question is None or
  No. Unrestricted web access is No (owner): the Fill sheet opens an
  employer's page with no address bar or search; switch to Yes if App Review
  disagrees. The questions alone give 4+, but the terms of use require users
  to be at least 16, and Apple requires the rating to match a stated
  minimum. Devices on iOS older than 26 show 17+.
- [x] Copyright: "2026 Pinkslip" (owner, 2026-11-04). Switch it to the
  LLC's name once the membership is converted.
- [x] Content rights: the app shows third-party content (job postings,
  company names and logos) and has the rights to it (owner, 2026-11-04).
- [x] App Privacy answers published (2026-11-04).
- [x] Apple's updated Developer Program License Agreement accepted by the
  owner (2026-11-04).
- [ ] Privacy, support and marketing URLs (the pages above, and
  `https://pinkslip.work`).
- [x] App Review contact details (Apple doesn't publish them), with
  `support@pinkslip.work` as the email, and the review account's sign-in
  (owner, 2026-11-04).
- [ ] Version release: **Manually release this version**, so approval
  doesn't publish the app before the owner is ready.

### Review notes

A draft for the Notes field:

> Pinkslip is a job search app for people early in their careers. Jobs,
> search and job pages work without an account.
>
> The review account is in the sign-in fields: on You, tap Guest, enter the
> email, then "Use my password". Sign in with Apple, Google and a one-time
> email code also work.
>
> To delete an account: You → Account → Delete account.
>
> Notifications are optional (You → Alerts).
>
> Fill: from a job's Apply, Pinkslip opens the employer's application page
> in the app and can fill in fields from the user's resume and saved
> answers. The user checks the form and submits it themselves.
>
> Email tracking is optional: You → Email tracking gives an address to
> forward job emails to, which keeps applications' status current.
>
> Rows marked "Soon" (Outreach, Plan, Auto-apply) aren't available yet and
> don't open.
>
> Support Pinkslip, shown in the United States only, is an optional tip
> through Stripe, opened in Safari. It unlocks nothing.

## Submit

- [ ] Add the soaked 1.4.0 build to the version, leave in-app purchases
  out, and submit.
- [ ] Once approved, release when ready.

## After approval

- Over-the-air updates carry fixes as before. Anything that changes what the
  reviewer saw goes out in a new version with review notes: Pro, auto-apply
  sends or outreach for everyone. Switching those on with a server flag
  after review runs into guideline 2.3.1 (hidden features). Outreach's
  recruiter list also runs into guideline 5.1.2, which bars compiling
  personal information about people other than the user, even from public
  sources.
- Update notes after an update with visible changes, approved by the owner.

## Later

- **Pro.** Build the StoreKit side. The Plan screen should take prices from
  StoreKit: it currently hard-codes $9.99, $24.99 and $59.99 for three
  plans, while App Store Connect has $4.99 a week and $14.99 a month. Each
  subscription needs a purchase-screen screenshot for its review, and both
  go to review with that version.
- **LLC.** File it, get an EIN and a D-U-N-S number, convert the
  membership, then redo tax and banking under the LLC. Decide on the EU
  then.
- **Klim licences.** The website still uses the trial cuts, so buy the web
  licence before promoting it. The app licence brings Klim back to iOS.

Sources: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
[App privacy details](https://developer.apple.com/app-store/app-privacy-details/),
[screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications).
